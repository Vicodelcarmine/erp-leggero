# -*- coding: utf-8 -*-
"""PDF Metro già messi da Google nella cartella Drive «Fatture Metro».

Il controllo della posta vive su Google, account vicodelcarmine1@gmail.com,
ogni mattina alle 7 ora di Roma. Questo file non legge Mail e non tocca
le cartelle delle chiusure cassa. Non carica merce.
"""
from __future__ import annotations

import json
import sys
import threading
from pathlib import Path

ERP = Path(__file__).resolve().parent.parent
if str(ERP) not in sys.path:
    sys.path.insert(0, str(ERP))

CARTELLA_ID = "1Rt34qeI34qI9_PkIIwjj8mCieD7q3HaS"
CARTELLA_NOME = "Fatture Metro"
CASELLA = "vicodelcarmine1@gmail.com"
VIETATE = {
    "1AhVSLROfza6eHOZo60ORPxrj2iB6yeXZ",
    "1zuu988IF_HwasEw4gngWj7hZTq-qmZvQ",
}
_MSG_VUOTO = "Nessuna mail nuova."
_LOCK = threading.Lock()
_PRESE = Path.home() / "Library" / "Application Support" / "erp-leggero" / "fatture" / "drive_prese.json"


def risposta(pdf, errore=""):
    if errore:
        return {"ok": False, "errore": errore, "pdf": [], "caselle": [CASELLA], "cartella": CARTELLA_NOME}
    return {
        "ok": True,
        "caselle": [CASELLA],
        "cartella": CARTELLA_NOME,
        "pdf": pdf,
        "messaggio": _MSG_VUOTO if not pdf else "",
    }


def _prese():
    try:
        dati = json.loads(_PRESE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(dati, dict):
        return []
    return [str(x) for x in (dati.get("id") or []) if x]


def segna_presa(file_id):
    ident = str(file_id or "").strip()
    if not ident or ident in VIETATE or ident == CARTELLA_ID:
        return
    with _LOCK:
        visti = _prese()
        if ident not in visti:
            visti.append(ident)
        _PRESE.parent.mkdir(parents=True, exist_ok=True)
        _PRESE.write_text(json.dumps({"id": visti}, ensure_ascii=False), encoding="utf-8")


def _drive():
    from app.services.drive_service import get_google_services

    drive, _ = get_google_services()
    return drive


def _data(valore):
    testo = str(valore or "")
    return testo[:10] if len(testo) >= 10 else ""


def leggi():
    if CARTELLA_ID in VIETATE:
        return risposta([], "La cartella delle fatture non può essere quella della cassa.")
    try:
        drive = _drive()
        meta = drive.files().get(fileId=CARTELLA_ID, fields="id,name,mimeType,trashed").execute()
        if meta.get("trashed") or meta.get("mimeType") != "application/vnd.google-apps.folder":
            return risposta([], "Non vedo la cartella Drive Fatture Metro.")
        if meta.get("name") != CARTELLA_NOME:
            return risposta([], "Non vedo la cartella Drive Fatture Metro.")
        elencati = drive.files().list(
            q="'%s' in parents and trashed = false and mimeType = 'application/pdf'" % CARTELLA_ID,
            fields="files(id,name,modifiedTime,description)",
            pageSize=40,
            orderBy="modifiedTime desc",
        ).execute()
    except Exception:
        return risposta([], "Non riesco a leggere la cartella Drive Fatture Metro.")
    gia = set(_prese())
    pdf = []
    for f in elencati.get("files") or []:
        ident = str(f.get("id") or "")
        if not ident or ident in gia or ident in VIETATE:
            continue
        nome = str(f.get("name") or "fattura.pdf")
        if not nome.lower().endswith(".pdf"):
            continue
        nota = str(f.get("description") or "")
        pdf.append({
            "id": ident,
            "messageId": nota[5:] if nota.startswith("mail:") else "",
            "nome": nome,
            "mittente": "Metro",
            "oggetto": "",
            "data": _data(f.get("modifiedTime")),
        })
    return risposta(pdf)


def bytes_di(file_id):
    ident = str(file_id or "").strip()
    if not ident or ident in VIETATE or ident == CARTELLA_ID or ident in set(_prese()):
        return None
    try:
        drive = _drive()
        meta = drive.files().get(fileId=ident, fields="id,name,mimeType,parents,trashed").execute()
    except Exception:
        return None
    if meta.get("trashed") or meta.get("mimeType") != "application/pdf":
        return None
    if CARTELLA_ID not in (meta.get("parents") or []):
        return None
    nome = str(meta.get("name") or "")
    if not nome.lower().endswith(".pdf"):
        return None
    try:
        return drive.files().get_media(fileId=ident).execute()
    except Exception:
        return None
