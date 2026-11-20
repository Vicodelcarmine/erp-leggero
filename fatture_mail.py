# -*- coding: utf-8 -*-
"""Non è più il controllo del mattino.

Il controllo vive su Google (cartella Drive «Fatture Metro», fatture_drive.py).
Questo modulo non va rilanciato con launchd e non va richiamato da servi.py.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
import threading
import time
from datetime import datetime
from pathlib import Path

_LOCK = threading.Lock()
_FILE: dict[str, Path] = {}
_BASE = Path.home() / "Library" / "Application Support" / "erp-leggero" / "fatture"
_DIR = _BASE / "pdf"
_STATO = _BASE / "stato.json"
_PRESE = _BASE / "prese.json"
_CASELLA = "vicodelcarmine1@gmail.com"
_MSG_MANCA = (
    "Manca la casella vicodelcarmine1@gmail.com in Mail su questo Mac. "
    "Aggiungila dall'app Mail: qui non si scrive la password."
)
_SCRIPT = r'''
function iso(d) {
  if (!d) return "";
  var z = function (n) { return String(n).padStart(2, "0"); };
  return d.getFullYear() + "-" + z(d.getMonth() + 1) + "-" + z(d.getDate());
}
function emailAccount(acc) {
  try {
    var u = acc.userName();
    if (u) return String(u);
  } catch (e) {}
  return String(acc.name());
}
function dominio(mittente) {
  var raw = String(mittente || "").toLowerCase();
  var tra = raw.match(/<([^>]+)>/);
  var e = (tra ? tra[1] : raw).trim();
  var at = e.lastIndexOf("@");
  if (at < 0) return "";
  return e.slice(at + 1).replace(/[^a-z0-9.-].*$/, "");
}
function daMetro(mittente) {
  var d = dominio(mittente);
  return d === "metro.it" || (d.length > 9 && d.slice(-9) === ".metro.it");
}
function run(argv) {
  var dir = argv[0];
  var Mail = Application("Mail");
  var nAcc = Mail.accounts.length;
  var accTrovato = null;
  var casella = "";
  for (var i = 0; i < nAcc; i++) {
    var acc = Mail.accounts[i];
    var nomeAcc = String(acc.name() || "").toLowerCase();
    var email = emailAccount(acc).toLowerCase();
    if (email === "vicodelcarmine1@gmail.com" || nomeAcc === "vicodelcarmine1@gmail.com") {
      accTrovato = acc;
      casella = email || nomeAcc;
      break;
    }
  }
  if (!accTrovato) return JSON.stringify({ ok: false, manca: true, pdf: [] });
  var box;
  try { box = accTrovato.mailboxes.byName("INBOX"); }
  catch (e) { return JSON.stringify({ ok: false, manca: true, pdf: [] }); }
  var pdf = [];
  var n = 0;
  var quanti = box.messages.length;
  for (var j = 0; j < quanti; j++) {
    var msg;
    try { msg = box.messages[j]; }
    catch (e) { continue; }
    var mittente = "";
    try { mittente = String(msg.sender() || ""); } catch (e) { mittente = ""; }
    if (!daMetro(mittente)) continue;
    var atts;
    try { atts = msg.mailAttachments(); }
    catch (e) { continue; }
    if (!atts || !atts.length) continue;
    var mid = "";
    var oggetto = "";
    var data = "";
    try { mid = String(msg.messageId() || ""); } catch (e) {}
    try { oggetto = String(msg.subject() || ""); } catch (e) {}
    try { data = iso(msg.dateReceived()); } catch (e) {}
    for (var k = 0; k < atts.length; k++) {
      var att = atts[k];
      var nome = "";
      try { nome = String(att.name() || ""); } catch (e) { nome = ""; }
        if (!/\.pdf$/i.test(nome)) continue;
        var file = dir + "/" + n + ".pdf";
        try { att.save({ in: Path(file) }); }
        catch (e) { continue; }
        pdf.push({
          file: n + ".pdf",
          messageId: mid,
          nome: nome,
          mittente: mittente,
          oggetto: oggetto,
          data: data,
          casella: casella
        });
        n += 1;
    }
  }
  return JSON.stringify({ ok: true, caselle: [casella], pdf: pdf });
}
'''


def _dominio(mittente: str) -> str:
    raw = str(mittente or "").lower()
    if "<" in raw and ">" in raw:
        raw = raw.split("<", 1)[1].split(">", 1)[0]
    raw = raw.strip()
    if "@" not in raw:
        return ""
    dom = raw.rsplit("@", 1)[1]
    fine = []
    for ch in dom:
        if ch.isalnum() or ch in ".-":
            fine.append(ch)
        else:
            break
    return "".join(fine)


def _da_metro(mittente: str) -> bool:
    """Il mittente è Metro solo se il dominio della mail è metro.it."""
    dom = _dominio(mittente)
    return dom == "metro.it" or dom.endswith(".metro.it")


def _manca() -> dict:
    _FILE.clear()
    return {"ok": False, "errore": _MSG_MANCA, "caselle": [], "pdf": []}


def _errore_pubblico(testo: str) -> str:
    basso = (testo or "").lower()
    if any(k in basso for k in ("not authorized", "non autorizz", "assistive", "-1743", "osascript")):
        return "Mail non dà il permesso di leggere la posta da questo programma."
    if "mail" in basso and ("non è in esecuzione" in basso or "not running" in basso):
        return "Mail non è aperto su questo Mac."
    pulito = " ".join((testo or "").split())
    if len(pulito) > 180:
        pulito = pulito[:180]
    return pulito or "Non riesco a leggere la posta di questo Mac."


def _estrai() -> dict:
    _DIR.mkdir(parents=True, exist_ok=True)
    for vecchio in _DIR.glob("*.pdf"):
        try:
            vecchio.unlink()
        except OSError:
            pass
    try:
        proc = subprocess.run(
            ["osascript", "-l", "JavaScript", "-", str(_DIR)],
            input=_SCRIPT,
            text=True,
            capture_output=True,
            timeout=180,
        )
    except subprocess.TimeoutExpired:
        return {"ok": False, "errore": "La posta ci ha messo troppo a rispondere.", "caselle": [], "pdf": []}
    except OSError:
        return {"ok": False, "errore": "Su questo Mac non riesco ad aprire Mail.", "caselle": [], "pdf": []}
    if proc.returncode != 0:
        return {
            "ok": False,
            "errore": _errore_pubblico(proc.stderr or proc.stdout),
            "caselle": [],
            "pdf": [],
        }
    try:
        dati = json.loads(proc.stdout or "")
    except json.JSONDecodeError:
        return {
            "ok": False,
            "errore": _errore_pubblico(proc.stdout or proc.stderr),
            "caselle": [],
            "pdf": [],
        }
    if isinstance(dati, dict) and dati.get("manca"):
        return _manca()
    if not isinstance(dati, dict) or not dati.get("ok"):
        return {
            "ok": False,
            "errore": _errore_pubblico(str((dati or {}).get("errore") or "")),
            "caselle": [],
            "pdf": [],
        }
    caselle = [c for c in (str(x).strip().lower() for x in (dati.get("caselle") or [])) if c == _CASELLA]
    if not caselle:
        return _manca()
    visti_sha = set()
    visti_msg = set()
    pdf = []
    _FILE.clear()
    for raw in dati.get("pdf") or []:
        if not isinstance(raw, dict):
            continue
        percorso = _DIR / str(raw.get("file") or "")
        if percorso.parent != _DIR or not percorso.is_file():
            continue
        try:
            contenuto = percorso.read_bytes()
        except OSError:
            continue
        if not contenuto.startswith(b"%PDF"):
            continue
        if not _da_metro(str(raw.get("mittente") or "")):
            continue
        sha = hashlib.sha256(contenuto).hexdigest()
        message_id = str(raw.get("messageId") or "").strip()
        nome = str(raw.get("nome") or "fattura.pdf").strip()[:120]
        chiave = (message_id, nome.lower())
        if sha in visti_sha or (message_id and chiave in visti_msg):
            continue
        visti_sha.add(sha)
        if message_id:
            visti_msg.add(chiave)
        if _gia_presa(message_id, sha):
            continue
        destinazione = _DIR / (sha + ".pdf")
        if percorso != destinazione:
            try:
                destinazione.write_bytes(contenuto)
            except OSError:
                continue
        _FILE[sha] = destinazione
        pdf.append({
            "id": sha,
            "messageId": message_id,
            "nome": nome,
            "mittente": str(raw.get("mittente") or "")[:160],
            "oggetto": str(raw.get("oggetto") or "")[:180],
            "data": str(raw.get("data") or "")[:10],
            "casella": str(raw.get("casella") or "")[:120],
        })
    pdf.sort(key=lambda r: (r["data"], r["nome"]), reverse=True)
    return {"ok": True, "errore": "", "caselle": caselle, "pdf": pdf[:80]}


def _cartella() -> None:
    _DIR.mkdir(parents=True, exist_ok=True)


def _leggi_json(path: Path) -> dict:
    try:
        dati = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return dati if isinstance(dati, dict) else {}


def _gia_presa(message_id: str, sha: str) -> bool:
    prese = _leggi_json(_PRESE).get("id") or []
    if not isinstance(prese, list):
        return False
    noti = {str(x) for x in prese}
    if message_id and ("m:" + message_id) in noti:
        return True
    return bool(sha) and ("s:" + sha) in noti


def _salva(payload: dict) -> dict:
    _cartella()
    payload = dict(payload)
    payload["controllato"] = datetime.now().replace(microsecond=0).isoformat(timespec="seconds")
    _STATO.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return payload


def raccogli() -> dict:
    with _LOCK:
        payload = _estrai()
        return _salva(payload)


def leggi(fresco: bool = False) -> dict:
    with _LOCK:
        if fresco:
            payload = _salva(_estrai())
        elif _STATO.is_file():
            payload = _leggi_json(_STATO)
            if not payload:
                payload = _manca()
        else:
            payload = _manca()
        for voce in payload.get("pdf") or []:
            if isinstance(voce, dict) and voce.get("id"):
                _FILE[str(voce["id"])] = _DIR / (str(voce["id"]) + ".pdf")
        return payload


def segna_presa(message_id: str, sha: str) -> None:
    with _LOCK:
        _cartella()
        dati = _leggi_json(_PRESE)
        noti = [str(x) for x in (dati.get("id") or []) if str(x)]
        if message_id and ("m:" + message_id) not in noti:
            noti.append("m:" + message_id)
        if sha and ("s:" + sha) not in noti:
            noti.append("s:" + sha)
        _PRESE.write_text(json.dumps({"id": noti}, ensure_ascii=False), encoding="utf-8")
        stato = _leggi_json(_STATO)
        if stato:
            stato["pdf"] = [
                p for p in (stato.get("pdf") or [])
                if not (isinstance(p, dict) and _gia_presa(str(p.get("messageId") or ""), str(p.get("id") or "")))
            ]
            _STATO.write_text(json.dumps(stato, ensure_ascii=False), encoding="utf-8")


def bytes_di(ident: str) -> bytes | None:
    if len(ident) != 64 or any(c not in "0123456789abcdef" for c in ident):
        return None
    with _LOCK:
        percorso = _FILE.get(ident) or (_DIR / (ident + ".pdf"))
        if not percorso.is_file():
            return None
        stato = _leggi_json(_STATO)
        noti = {str(p.get("id")) for p in (stato.get("pdf") or []) if isinstance(p, dict)}
        if ident not in noti:
            return None
        try:
            return percorso.read_bytes()
        except OSError:
            return None


def main() -> int:
    dati = raccogli()
    if not (dati.get("pdf") or []):
        print("nessuna mail Metro con PDF")
    else:
        print(str(len(dati["pdf"])) + " mail Metro con PDF")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
