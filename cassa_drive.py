# -*- coding: utf-8 -*-
"""Legge le chiusure POS già usate dal gestionale sul Mac.

Non scrive warehouse.db e non copia token.json. Il token resta nella
cartella ERP: lo usa get_google_services, come processa_fogli_google_pos.
Le righe già importate sul Mac si rileggono dal database in sola lettura.
Un foglio nuovo, ancora non importato, si legge dal Drive e non si salva lì.
"""
from __future__ import annotations

import re
import sqlite3
import sys
from pathlib import Path

ERP = Path(__file__).resolve().parent.parent
if str(ERP) not in sys.path:
    sys.path.insert(0, str(ERP))

_RE_DATA = re.compile(r"\bdel\s+(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b", re.IGNORECASE)


def data_dal_nome(nome: str) -> str:
    """Stessa regola di scarico_pos.data_vendita_foglio_pos: 'del 11-11-2026'."""
    m = _RE_DATA.search(str(nome or ""))
    if not m:
        return ""
    d, mo, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if not (1 <= d <= 31 and 1 <= mo <= 12):
        return ""
    return f"{y:04d}-{mo:02d}-{d:02d}"


def _errore_pubblico(exc: BaseException) -> str:
    testo = str(exc).replace("\n", " ")
    basso = testo.lower()
    if any(k in basso for k in ("token", "secret", "ya29", "client_secret", "refresh")):
        return "Il collegamento Google di questo computer non risponde."
    if len(testo) > 220:
        testo = testo[:220]
    return testo or exc.__class__.__name__


def _mappa_pos() -> dict:
    db = ERP / "warehouse.db"
    if not db.exists():
        return {}
    uri = f"file:{db}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT codice_pos, id_piatto, COALESCE(nome_piatto, '') FROM mappatura_pos"
        )
        out = {}
        for cod, idp, nome in cur.fetchall():
            c = str(cod or "").strip()
            if c:
                out[c] = (str(idp or "").strip(), str(nome or "").strip())
        return out
    except sqlite3.Error:
        return {}
    finally:
        conn.close()


def _righe_gia_lette() -> dict:
    db = ERP / "warehouse.db"
    if not db.exists():
        return {}
    uri = f"file:{db}?mode=ro"
    conn = sqlite3.connect(uri, uri=True)
    try:
        cur = conn.cursor()
        cur.execute(
            """
            SELECT file_id, codice_pos, COALESCE(id_piatto, ''), COALESCE(descrizione, ''),
                   quantita, importo
            FROM pos_vendite_righe
            """
        )
        out = {}
        for fid, cod, idp, desc, qta, importo in cur.fetchall():
            file_id = str(fid or "").strip()
            codice = str(cod or "").strip()
            if not file_id or not codice:
                continue
            try:
                n = float(qta or 0)
            except (TypeError, ValueError):
                n = 0.0
            if n <= 0:
                continue
            imp = None
            if importo not in (None, ""):
                try:
                    imp = float(importo)
                except (TypeError, ValueError):
                    imp = None
            out.setdefault(file_id, []).append(
                {
                    "codice": codice,
                    "idPiatto": str(idp or "").strip(),
                    "descrizione": str(desc or "").strip(),
                    "quantita": n,
                    "importo": imp,
                }
            )
        return out
    except sqlite3.Error:
        return {}
    finally:
        conn.close()


def _lista_in_cartella(drive, cartella_id: str) -> list:
    if not cartella_id:
        return []
    query = (
        f"'{cartella_id}' in parents and mimeType="
        "'application/vnd.google-apps.spreadsheet' and trashed=false"
    )
    files = []
    page = None
    while True:
        listing = (
            drive.files()
            .list(
                q=query,
                fields="nextPageToken, files(id, name)",
                pageSize=100,
                pageToken=page,
                supportsAllDrives=True,
                includeItemsFromAllDrives=True,
            )
            .execute()
        )
        files.extend(listing.get("files") or [])
        page = listing.get("nextPageToken")
        if not page:
            break
    return files


def _id_cartella_elaborate(drive) -> str:
    """I fogli già chiusi non restano in Chiusure: stanno in «Chiusure Elaborate»."""
    query = (
        "name = 'Chiusure Elaborate' and mimeType = "
        "'application/vnd.google-apps.folder' and trashed = false"
    )
    res = (
        drive.files()
        .list(
            q=query,
            fields="files(id)",
            pageSize=5,
            supportsAllDrives=True,
            includeItemsFromAllDrives=True,
        )
        .execute()
    )
    files = res.get("files") or []
    return str(files[0]["id"]) if files else ""


def _lista_fogli(drive):
    """Ritorna (fogli nuovi in Chiusure, fogli già spostati in Chiusure Elaborate)."""
    from app.services.drive_service import FOLDER_CHIUSURE_ID

    return (
        _lista_in_cartella(drive, FOLDER_CHIUSURE_ID),
        _lista_in_cartella(drive, _id_cartella_elaborate(drive)),
    )


def _righe_nuove(sheets, file_id: str, mappa: dict) -> list:
    from processa_fogli_google_pos import (
        fetch_google_sheet_values_grid,
        parse_stamp_articoli_values,
    )

    values = fetch_google_sheet_values_grid(sheets, file_id=file_id)
    righe = []
    for cod, desc, qta, importo in parse_stamp_articoli_values(values):
        if qta <= 0:
            continue
        idp, nome = mappa.get(cod, ("", ""))
        righe.append(
            {
                "codice": cod,
                "idPiatto": idp,
                "descrizione": (desc or nome or "").strip(),
                "quantita": float(qta),
                "importo": float(importo) if importo else None,
            }
        )
    return righe


def leggi_chiusure() -> dict:
    """Fogli della cartella Drive Chiusure, stesse righe del gestionale."""
    try:
        from app.services.drive_service import get_google_services
    except Exception as exc:
        return {"ok": False, "errore": "Non raggiungo il foglio Drive. " + _errore_pubblico(exc), "fogli": []}
    try:
        drive, sheets = get_google_services()
        nuovi, elaborate = _lista_fogli(drive)
    except Exception as exc:
        return {"ok": False, "errore": "Non raggiungo il foglio Drive. " + _errore_pubblico(exc), "fogli": []}

    def _solo_stampa(elenco):
        stampa = [
            f for f in elenco
            if "stampa" in (f.get("name") or "").lower() and "articoli" in (f.get("name") or "").lower()
        ]
        return stampa or list(elenco)

    nuovi = _solo_stampa(nuovi)
    elaborate = _solo_stampa(elaborate)
    if not nuovi and not elaborate:
        return {"ok": True, "errore": "", "fonte": "Drive Chiusure", "fogli": []}

    mappa = _mappa_pos()
    gia = _righe_gia_lette()
    fogli = []
    letti_nuovi = {}
    errori = []
    for f in nuovi:
        fid = str(f.get("id") or "").strip()
        nome = str(f.get("name") or "").strip()
        if not fid or fid in gia:
            continue
        try:
            letti_nuovi[fid] = _righe_nuove(sheets, fid, mappa)
        except Exception as exc:
            errori.append(nome + ": " + _errore_pubblico(exc))

    candidati = []
    visti = set()
    for f in list(nuovi) + list(elaborate):
        fid = str(f.get("id") or "").strip()
        if not fid or fid in visti:
            continue
        if fid not in gia and fid not in letti_nuovi:
            continue
        visti.add(fid)
        candidati.append(f)

    for f in candidati:
        fid = str(f.get("id") or "").strip()
        nome = str(f.get("name") or "").strip()
        if not fid:
            continue
        grezze = gia.get(fid, letti_nuovi.get(fid, []))
        righe = []
        for r in grezze:
            chiave = fid + "|" + r["codice"]
            righe.append(
                {
                    "id": chiave,
                    "fileId": fid,
                    "codice": r["codice"],
                    "idPiatto": r.get("idPiatto") or "",
                    "descrizione": r.get("descrizione") or "",
                    "quantita": r["quantita"],
                    "importo": r.get("importo"),
                }
            )
        righe.sort(key=lambda r: (-float(r["quantita"]), r["descrizione"]))
        fogli.append(
            {
                "fileId": fid,
                "nome": nome,
                "data": data_dal_nome(nome),
                "righe": righe,
            }
        )
    fogli.sort(key=lambda f: (f["data"] or "", f["nome"]), reverse=True)
    if not fogli and errori:
        return {"ok": False, "errore": "Non riesco a leggere il foglio Drive. " + errori[0], "fogli": []}
    return {
        "ok": True,
        "errore": ("Non ho letto " + str(len(errori)) + " fogli.") if errori else "",
        "fonte": "Drive Chiusure",
        "fogli": fogli,
    }


if __name__ == "__main__":
    pacco = leggi_chiusure()
    if not pacco.get("ok"):
        print("ERRORE", pacco.get("errore"))
        raise SystemExit(1)
    fogli = pacco.get("fogli") or []
    print("fogli", len(fogli))
    if not fogli:
        print("vuoto")
        raise SystemExit(0)
    primo = fogli[0]
    print("ultimo", primo.get("data"), primo.get("nome"), "righe", len(primo.get("righe") or []))
    for r in primo.get("righe") or []:
        desc = (r.get("descrizione") or "").upper()
        if "MARGHER" in desc or r.get("idPiatto") == "PIZ-001":
            print("margherita", r.get("quantita"), r.get("idPiatto"), r.get("codice"), r.get("importo"))
