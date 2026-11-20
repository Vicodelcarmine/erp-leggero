# -*- coding: utf-8 -*-
"""Pagine dell'ERP leggero, più la lettura del foglio Drive della cassa.

Solo su questo computer (127.0.0.1). Non pubblica nulla e non scrive il database.
"""
from __future__ import annotations

import json
import re
import secrets
import subprocess
import threading
import time
import zipfile
from datetime import date, datetime, timedelta
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from io import BytesIO
from pathlib import Path
from urllib.parse import urlparse, parse_qs

import cassa_drive
import fatture_drive

ROOT = Path(__file__).resolve().parent
PREV = ROOT / "preventivi_link.json"
# https pubblico di questo programma (Tailscale Funnel sulla porta 8443).
# La 443 resta il gestionale: non la sostituiamo.
BASE_PUBBLICA = "https://imac-di-ivo.tail178446.ts.net:8443"
_base_ok = {"ok": False, "t": 0.0}
_lock = threading.Lock()
_prev_lock = threading.Lock()
_cache = {"t": 0.0, "body": b"", "fresco": False}
_TOKEN = re.compile(r"^[A-Za-z0-9_-]{8,80}$")


def _adesso():
    return datetime.now().replace(microsecond=0).isoformat(timespec="seconds")


def _iniziale(testo):
    t = " ".join(str(testo or "").split())
    if not t:
        return ""
    return t[0].upper() + t[1:]


def _udm(valore):
    u = str(valore or "").strip()
    return u if u in ("L", "pz") else "kg"


def _giorni(valore):
    if isinstance(valore, bool):
        return None
    if isinstance(valore, int):
        n = valore
    elif isinstance(valore, float) and valore == int(valore):
        n = int(valore)
    else:
        s = str(valore or "").strip()
        if not re.fullmatch(r"\d{1,3}", s):
            return None
        n = int(s)
    if n < 1 or n > 365:
        return None
    return n


def _scade_il(giorni):
    return (date.today() + timedelta(days=giorni)).isoformat()


def _scaduto(link):
    scade = str((link or {}).get("scade") or "")[:10]
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", scade):
        return False
    return date.today().isoformat() > scade


def _data_it(iso):
    m = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})", str(iso or "")[:10])
    if not m:
        return ""
    return m.group(3) + "/" + m.group(2) + "/" + m.group(1)


def _assicura_https():
    ora = time.time()
    if _base_ok["ok"] and ora - _base_ok["t"] < 120:
        return True
    try:
        subprocess.run(
            ["tailscale", "funnel", "--bg", "--https=8443", "--yes", "http://127.0.0.1:8877"],
            check=False,
            timeout=20,
            capture_output=True,
        )
    except (OSError, subprocess.TimeoutExpired):
        pass
    ok = False
    try:
        import urllib.error
        import urllib.request
        req = urllib.request.Request(BASE_PUBBLICA + "/preventivo/r/ping")
        with urllib.request.urlopen(req, timeout=6) as res:
            ok = res.status < 500
    except urllib.error.HTTPError as e:
        ok = e.code < 500
    except Exception:
        ok = False
    _base_ok["ok"] = ok
    _base_ok["t"] = ora
    return ok


def _base():
    if _assicura_https():
        return BASE_PUBBLICA
    return "http://127.0.0.1:8877"


def _url_link(token):
    return _base().rstrip("/") + "/preventivo/r/" + token


def _numero(valore):
    if valore is None or valore is False:
        return None
    if isinstance(valore, (int, float)) and not isinstance(valore, bool):
        n = float(valore)
        return n if n > 0 else None
    s = str(valore).strip().replace(" ", "").replace(",", ".")
    if not s:
        return None
    try:
        n = float(s)
    except ValueError:
        return None
    return n if n > 0 else None


def _leggi_prev():
    if not PREV.exists():
        return {"link": []}
    try:
        dati = json.loads(PREV.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"link": []}
    if not isinstance(dati, dict) or not isinstance(dati.get("link"), list):
        return {"link": []}
    return dati


def _scrivi_prev(dati):
    tmp = PREV.with_suffix(".tmp")
    tmp.write_text(json.dumps(dati, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(PREV)


def _trova(dati, token):
    for link in dati["link"]:
        if link.get("token") == token:
            return link
    return None


def _html(testo):
    return (str(testo)
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


def _testo(valore, n):
    t = " ".join(str(valore or "").split())
    if len(t) > n:
        t = t[:n].rstrip()
    return t


def _prezzo_etichetta(udm):
    if udm == "L":
        return "Prezzo €/L"
    if udm == "pz":
        return "Prezzo €/pz"
    return "Prezzo €/kg"


def _unita_prezzo(udm):
    if udm == "L":
        return "€/L"
    if udm == "pz":
        return "€/pz"
    return "€/kg"


def _aiuto_collo(udm):
    if udm == "L":
        return "5 L si scrive 5 e L."
    if udm == "pz":
        return "6 bottiglie si scrive 6 e PZ."
    return "30 kg si scrive 30 e kg, non 30000."


def _unita_scelta(valore):
    u = str(valore or "").strip()
    return u if u in ("g", "kg", "L", "PZ") else ""


def _stessa_famiglia(udm, unita):
    if udm == "L":
        return unita == "L"
    if udm == "pz":
        return unita == "PZ"
    return unita in ("g", "kg")


def _collo_udm(udm, unita, qta):
    if not _stessa_famiglia(udm, unita) or not (qta and qta > 0):
        return None
    if unita == "g":
        return qta / 1000.0
    return qta


_ALT = re.compile(r"^alt-[A-Za-z0-9_-]{4,40}$")


def _euro_cifre(n):
    if isinstance(n, bool) or not isinstance(n, (int, float)) or not (n > 0):
        return ""
    cents = int(round(float(n) * 100))
    if cents <= 0:
        return ""
    s = str(cents).zfill(3)
    return s[:-2] + "," + s[-2:]


def _qta_testo(n):
    if isinstance(n, bool) or not isinstance(n, (int, float)) or not (n > 0):
        return ""
    if abs(float(n) - round(float(n))) < 1e-6:
        return str(int(round(float(n))))
    return ("%.4f" % float(n)).rstrip("0").rstrip(".").replace(".", ",")


def _tasti_unita(scelta):
    scelta = _unita_scelta(scelta)
    return "".join(
        '<button type="button" class="unita-tasto" data-unita="' + u + '" aria-pressed="'
        + ("true" if u == scelta else "false") + '">' + u + "</button>"
        for u in ("g", "kg", "L", "PZ")
    )


def _formato_campo(udm, qta, unita):
    unita = _unita_scelta(unita)
    if unita == "g":
        segna = "500"
    elif unita == "L" or (not unita and udm == "L"):
        segna = "5"
    elif unita == "PZ" or (not unita and udm == "pz"):
        segna = "6"
    else:
        segna = "15"
    modo = "numeric" if unita in ("g", "PZ") else "decimal"
    return (
        '<div class="formato-box" role="group" aria-label="Formato confezione">'
        + '<input class="conf" data-unita="' + _html(unita) + '" inputmode="' + modo
        + '" autocomplete="off" placeholder="' + segna + '" value="' + _html(_qta_testo(qta)) + '">'
        + '<div class="formato-unita">' + _tasti_unita(unita) + "</div></div>"
    )


def _udm_da_unita(unita):
    if unita == "L":
        return "L"
    if unita == "PZ":
        return "pz"
    return "kg"


def _riga_html(art, salvata, alternativa):
    salvata = salvata or {}
    udm = _udm_da_unita(_unita_scelta(salvata.get("unita"))) if alternativa else _udm(art.get("udm"))
    nome = _testo(salvata.get("nome"), 80) if alternativa else str(art.get("nome") or art.get("id") or "")
    titolo = nome or "Articolo alternativo"
    unita = _unita_scelta(salvata.get("unita"))
    ident = str(salvata.get("id") or "") if alternativa else str(art.get("id") or "")
    extra = ' data-alt="1"' if alternativa else ""
    nome_campo = ""
    togli = ""
    if alternativa:
        nome_campo = (
            '<div class="prev-field span-2"><label>Nome</label>'
            + '<input class="campo-editabile-listino nome-alt" autocomplete="off" maxlength="80" placeholder="Come lo chiami tu" value="'
            + _html(nome) + '"></div>'
        )
        togli = '<button type="button" class="togli-alt">Togli questo articolo</button>'
    return (
        '<article class="card-prev-riga scheda" data-id="' + _html(ident) + '" data-udm="' + _html(udm) + '"' + extra + ">"
        + '<div class="prev-riga-nome nome-articolo-magazzino nome-visibile">' + _html(titolo) + "</div>"
        + '<div class="prev-fields-grid">'
        + nome_campo
        + '<div class="prev-field span-2"><label>Cod. fornitore</label>'
        + '<input class="campo-editabile-listino codice" autocomplete="off" placeholder="Il tuo codice" maxlength="40" value="'
        + _html(salvata.get("codice") or "") + '">'
        + '<p class="aiuto">Il codice che usi tu. Non il nostro.</p></div>'
        + '<div class="prev-field span-2"><label>Formato conf.</label>'
        + _formato_campo(udm, salvata.get("qta"), unita)
        + '<p class="aiuto aiuto-collo">' + _html(_aiuto_collo(udm)) + "</p>"
        + '<p class="aiuto formato-avviso" hidden></p></div>'
        + '<div class="prev-field span-2"><label class="etichetta-prezzo">' + _html(_prezzo_etichetta(udm)) + "</label>"
        + '<input class="inp-prev text-end prezzo" inputmode="numeric" autocomplete="off" placeholder="110" value="'
        + _html(_euro_cifre(salvata.get("prezzo"))) + '">'
        + '<p class="aiuto aiuto-prezzo">110 diventa 1,10 € per ' + _html(udm) + ".</p></div>"
        + '<div class="prev-field span-2"><label>Note</label>'
        + '<input class="campo-editabile-listino nota-riga" autocomplete="off" placeholder="Opzionale" maxlength="240" value="'
        + _html(salvata.get("note") or "") + '"></div>'
        + "</div>" + togli + "</article>"
    )


def _pagina_fornitore(link, messaggio):
    if link is None:
        corpo = "<h1>Link non valido</h1><p>Questo indirizzo non corrisponde a un preventivo.</p>"
    elif _scaduto(link):
        fino = _data_it(link.get("scade"))
        corpo = (
            "<h1>Questo link è scaduto</h1>"
            + ("<p class=\"fino\">Era valido fino al <span class=\"giorno\">" + _html(fino) + "</span></p>" if fino else "")
            + "<p>Non puoi più inviare il preventivo. Chiedi un link nuovo al locale.</p>"
        )
    elif link.get("stato") != "aperto":
        corpo = "<h1>Preventivo inviato</h1><p>Grazie. Il locale lo vede sul suo computer.</p>"
    else:
        bozza = link.get("bozza") if isinstance(link.get("bozza"), dict) else {}
        salvate = {}
        for raw in bozza.get("righe") or []:
            if isinstance(raw, dict) and raw.get("id"):
                salvate[str(raw.get("id"))] = raw
        slides = []
        tasti_griglia = []
        for i, art in enumerate(link.get("articoli") or []):
            nome = str(art.get("nome") or art.get("id") or "")
            sid = "slide-prev-" + str(i)
            card = _riga_html(art, salvate.get(str(art.get("id"))), False)
            slides.append(
                '<div class="carousel-slide-prev" id="' + sid + '" data-carousel-slide>' + card + "</div>"
            )
            tasti_griglia.append(
                '<button type="button" class="btn-articolo-grid-prev" data-slide="' + sid + '">' + _html(nome) + "</button>"
            )
        for j, raw in enumerate(bozza.get("alternativi") or []):
            if not isinstance(raw, dict) or not _ALT.match(str(raw.get("id") or "")):
                continue
            sid = "slide-alt-" + str(j)
            slides.append(
                '<div class="carousel-slide-prev" id="' + sid + '" data-carousel-slide>'
                + _riga_html({}, raw, True) + "</div>"
            )
        fino = _data_it(link.get("scade"))
        riga_scadenza = (
            '<p class="rq-online-countdown">Valido fino al ' + _html(fino) + "</p>"
            if fino else '<p class="rq-online-countdown">Senza scadenza</p>'
        )
        nota_bozza = _testo(bozza.get("note"), 500)
        corpo = (
            "<h1>" + _html(link.get("fornitore") or "Preventivo") + "</h1>"
            + '<p class="prev-lead">Prezzi per ' + _html(link.get("locale") or "il locale")
            + ". Lascia vuoto un articolo che non tratti.</p>"
            + riga_scadenza
            + '<div class="progress-wrap"><div class="label"><span>Avanzamento</span>'
            + '<span id="testoProgresso">0 di ' + str(len(slides)) + " pronti</span></div>"
            + '<div class="progress"><div class="progress-bar" id="barraProgresso"></div></div></div>'
            + '<p class="errore" id="errore" hidden></p>'
            + '<div class="prev-categoria-body" id="sezione-prev">'
            + '<div class="griglia-articoli-prev" role="list">' + "".join(tasti_griglia) + "</div>"
            + '<aside class="pannello-laterale-prev">'
            + '<div class="pannello-placeholder-prev">Seleziona una riga del listino</div>'
            + '<div class="carousel-prev-wrap">'
            + '<div class="carousel-prev-viewport" id="vista-carousel">'
            + '<div class="carousel-prev-track">' + "".join(slides) + "</div>"
            + "</div>"
            + '<div class="carousel-prev-nav">'
            + '<button type="button" class="btn-nav-prev" id="prec" aria-label="Precedente">‹</button>'
            + '<div class="carousel-prev-counter"><span class="carousel-counter-text">—</span>'
            + '<small class="carousel-counter-nome"></small></div>'
            + '<button type="button" class="btn-nav-prev" id="succ" aria-label="Successivo">›</button>'
            + "</div>"
            + '<p class="carousel-prev-hint">← scorri con il dito →</p>'
            + "</div></aside></div>"
            + '<button type="button" id="aggiungi-alt">Aggiungi articolo alternativo</button>'
            + '<p class="aiuto" id="stato-bozza"></p>'
            + '<div class="prev-field span-2 note-generali"><label>Note generali</label>'
            + '<textarea id="note" rows="3" maxlength="500" placeholder="Opzionale">' + _html(nota_bozza) + "</textarea></div>"
            + '<button type="button" id="invia">Invia il preventivo</button>'
            + '<template id="modello-alt"><div class="carousel-slide-prev" data-carousel-slide>'
            + _riga_html({}, {"id": ""}, True)
            + "</div></template>"
            + '<p class="prev-lead nota-fondo">Questo link funziona finché il computer del locale è acceso.</p>'
        )
    dati = json.dumps({"token": (link or {}).get("token") or ""}, ensure_ascii=False).replace("<", "\\u003c")
    avviso = '<p class="errore">' + _html(messaggio) + "</p>" if messaggio else ""
    return """<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0a1628">
  <title>Preventivo</title>
  <style>
    :root {
      --prev-bg: #0a1628; --prev-bg2: #0f2138; --prev-card: #132a47; --prev-card2: #1a3558;
      --prev-border: #2a4a6e; --prev-text: #f0f4fa; --prev-muted: #9eb4d0; --prev-accent: #4d9fff;
      --prev-orange: #f59e0b; --prev-danger: #f87171; --prev-touch: 54px; --prev-radius: 16px;
      color-scheme: dark;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; min-height: 100vh; color: var(--prev-text);
      background: var(--prev-bg);
      background-image: radial-gradient(ellipse at 50% -20%, #1a3a5c 0%, var(--prev-bg) 55%);
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    main { width: min(520px, calc(100% - 24px)); margin: 0 auto; padding: 1.5rem 0 2.5rem; }
    h1 { color: var(--prev-text); font-weight: 800; font-size: 1.75rem; margin: 0 0 0.35rem; }
    .prev-lead { color: var(--prev-muted); font-size: 0.9rem; max-width: 52rem; margin: 0 0 0.75rem; }
    .rq-online-countdown {
      display: inline-block; font-size: .88rem; font-weight: 700; white-space: nowrap;
      padding: .25rem .55rem; border-radius: 999px; background: var(--prev-card);
      color: var(--prev-text); border: 1px solid var(--prev-border); margin: 0 0 1rem;
    }
    .errore { background: rgba(248, 113, 113, .12); border: 1px solid var(--prev-danger); color: #fecaca; border-radius: 12px; padding: 12px; }
    [hidden] { display: none !important; }
    .nome-articolo-magazzino { color: #4ade80 !important; font-weight: 600; }
    .griglia-articoli-prev { display: none; }
    .pannello-placeholder-prev { display: none; }
    .carousel-prev-wrap { margin-bottom: 1rem; }
    .carousel-prev-viewport {
      overflow-x: auto; scroll-snap-type: x mandatory; -webkit-overflow-scrolling: touch;
      scrollbar-width: none; border-radius: var(--prev-radius);
    }
    .carousel-prev-viewport::-webkit-scrollbar { display: none; }
    .carousel-prev-track { display: flex; }
    .carousel-slide-prev { flex: 0 0 100%; min-width: 100%; scroll-snap-align: start; scroll-snap-stop: always; padding: 0 1px; }
    .carousel-prev-nav { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-top: .75rem; }
    .btn-nav-prev {
      width: 3rem; height: 3rem; border-radius: 50%; border: 1px solid var(--prev-border);
      background: var(--prev-card); color: var(--prev-text); font-size: 1.6rem; line-height: 1;
      display: flex; align-items: center; justify-content: center; padding: 0;
    }
    .btn-nav-prev:disabled { opacity: .35; }
    .carousel-prev-counter { flex: 1; text-align: center; font-size: 1.05rem; font-weight: 700; }
    .carousel-prev-counter small { display: block; font-size: .8rem; color: var(--prev-muted); margin-top: .15rem; font-weight: 600; }
    .carousel-prev-hint { text-align: center; font-size: .8rem; color: var(--prev-muted); margin: .4rem 0 0; }
    .card-prev-riga {
      background: var(--prev-card); border: 1px solid var(--prev-border);
      border-radius: var(--prev-radius); padding: 15px; color: var(--prev-text);
    }
    .prev-riga-nome { font-size: 1.05rem; font-weight: 700; line-height: 1.25; margin-bottom: 0.75rem; word-break: break-word; }
    .prev-fields-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .prev-field label, .note-generali label {
      display: block; font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.04em;
      color: var(--prev-muted); margin-bottom: 0.25rem; font-weight: 700;
    }
    .campo-editabile-listino, .inp-prev, textarea {
      background: var(--prev-bg2); border: 1px solid var(--prev-border); color: var(--prev-text);
      font-size: 16px; border-radius: 10px; padding: 10px 12px; width: 100%; font-family: inherit;
    }
    textarea { min-height: 5.5rem; resize: vertical; }
    .text-end { text-align: right; }
    .prev-field.span-2 { grid-column: 1 / -1; }
    input:disabled { opacity: 0.45; }
    .aiuto { color: var(--prev-muted); font-size: 0.75rem; margin: 0.35rem 0 0; font-weight: 600; }
    .formato-avviso { color: #fbbf24; }
    .formato-box {
      display: flex; align-items: stretch; gap: 8px;
      background: var(--prev-bg2); border: 1px solid var(--prev-border); border-radius: 12px; padding: 8px;
    }
    .formato-box .conf {
      flex: 1 1 92px; min-width: 76px; width: auto; min-height: 56px; margin: 0;
      border: 0; background: transparent; color: var(--prev-text);
      font: inherit; font-size: 1.7rem; font-weight: 750; padding: 6px 8px;
    }
    .formato-unita { flex: 2 1 230px; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
    button.unita-tasto {
      min-height: 56px; margin: 0; padding: 0; border-radius: 10px;
      border: 1px solid var(--prev-border); background: var(--prev-card); color: var(--prev-text);
      font: inherit; font-size: 1.05rem; font-weight: 800; cursor: pointer;
    }
    button.unita-tasto[aria-pressed="true"] { background: var(--prev-accent); color: #061018; border-color: var(--prev-accent); }
    .progress-wrap {
      background: var(--prev-card); border: 1px solid var(--prev-border); border-radius: var(--prev-radius);
      padding: .7rem .9rem; margin: 0 0 .75rem;
    }
    .progress-wrap .label { display: flex; justify-content: space-between; gap: .5rem; color: var(--prev-muted); font-size: .88rem; font-weight: 600; margin-bottom: .4rem; }
    .progress-wrap .label span:last-child { color: var(--prev-accent); }
    .progress { height: 10px; border-radius: 999px; background: var(--prev-bg2); overflow: hidden; }
    .progress-bar { height: 100%; width: 0; border-radius: 999px; background: linear-gradient(90deg, #2563b8, var(--prev-accent)); }
    .note-generali { margin-top: 0.5rem; }
    button#aggiungi-alt, button.togli-alt {
      width: 100%; min-height: 52px; margin-top: 8px; border-radius: 12px;
      border: 1px solid var(--prev-border); background: var(--prev-card); color: var(--prev-text);
      font-family: inherit; font-weight: 700; font-size: 1rem;
    }
    button.togli-alt { min-height: 44px; background: transparent; color: var(--prev-muted); }
    #stato-bozza { min-height: 1.1rem; margin: 0.35rem 0 0; }
    button#invia {
      width: 100%; min-height: var(--prev-touch); margin-top: 16px; border: 1px solid var(--prev-orange);
      border-radius: 12px; background: var(--prev-orange); color: #000; font-family: inherit; font-weight: 700; font-size: 1rem;
    }
    .nota-fondo { margin-top: 0.75rem; }
  </style>
</head>
<body>
  <main>
    """ + avviso + corpo + """
  </main>
  <script id="dati" type="application/json">""" + dati + """</script>
  <script>
    function cifreEuro(digits) {
      digits = String(digits || "").replace(/\\D/g, "").replace(/^0+(?=\\d)/, "");
      if (!digits) return "";
      while (digits.length < 3) digits = "0" + digits;
      return digits.slice(0, -2) + "," + digits.slice(-2);
    }
    function sistema(el) {
      var v = el.value;
      if (el.classList.contains("prezzo")) v = cifreEuro(v);
      else if (el.classList.contains("conf")) {
        var u = el.dataset.unita || "";
        if (u === "g" || u === "PZ") v = v.replace(/\\D/g, "");
        else {
          v = v.replace(/\\./g, ",").replace(/[^\\d,]/g, "");
          var i = v.indexOf(",");
          if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/,/g, "");
        }
      }
      if (v !== el.value) el.value = v;
    }
    document.addEventListener("input", function (e) {
      var t = e.target;
      if (!t) return;
      if (t.matches && t.matches("input")) sistema(t);
      if (t.classList && t.classList.contains("nome-alt")) {
        var vis = t.closest(".scheda") && t.closest(".scheda").querySelector(".nome-visibile");
        if (vis) vis.textContent = (t.value || "").trim() || "Articolo alternativo";
      }
      aggiornaAvanzamento();
      aggiornaContatore();
      salvaBozza();
    });
    function stessaFamiglia(udm, unita) {
      if (udm === "L") return unita === "L";
      if (udm === "pz") return unita === "PZ";
      return unita === "g" || unita === "kg";
    }
    function testoUnita(udm, unita) {
      if (!unita || stessaFamiglia(udm, unita)) return "";
      if (udm === "L") return "Questo articolo è a litri: scegli L.";
      if (udm === "pz") return "Questo articolo è a pezzi: scegli PZ.";
      return "Questo articolo è a kg: scegli g o kg.";
    }
    function famigliaUnita(unita) {
      if (unita === "L") return "L";
      if (unita === "PZ") return "pz";
      if (unita === "g" || unita === "kg") return "kg";
      return "";
    }
    function leggiCollo(box) {
      var confEl = box.querySelector(".conf");
      var unita = confEl.dataset.unita || "";
      var confRaw = confEl.value.trim().replace(",", ".");
      var qta = confRaw ? Number(confRaw) : 0;
      var avviso = box.querySelector(".formato-avviso");
      var alt = box.getAttribute("data-alt") === "1";
      var udm = alt ? (famigliaUnita(unita) || "kg") : (box.getAttribute("data-udm") || "kg");
      var testo = alt ? "" : testoUnita(udm, unita);
      if (alt && unita) box.setAttribute("data-udm", udm);
      if (avviso) {
        avviso.hidden = !testo;
        avviso.textContent = testo;
      }
      if (!(qta > 0) || !unita || testo) return null;
      return unita === "g" ? qta / 1000 : qta;
    }
    function rigaPronta(box) {
      var nomeEl = box.querySelector(".nome-alt");
      var nomeOk = !nomeEl || !!(nomeEl.value || "").trim();
      var prezzo = box.querySelector(".prezzo").value.replace(/\\D/g, "");
      return nomeOk && Number(prezzo) > 0 && leggiCollo(box) != null;
    }
    function aggiornaAvanzamento() {
      var schede = document.querySelectorAll(".scheda");
      var pronti = 0;
      schede.forEach(function (box) {
        if (rigaPronta(box)) pronti += 1;
      });
      var testo = document.getElementById("testoProgresso");
      var barra = document.getElementById("barraProgresso");
      if (testo) testo.textContent = pronti + " di " + schede.length + " pronti";
      if (barra) barra.style.width = (schede.length ? Math.round(pronti / schede.length * 100) : 0) + "%";
    }
    function elencoSlide() {
      return Array.prototype.slice.call(document.querySelectorAll(".carousel-slide-prev"));
    }
    function indiceVisibile() {
      var viewport = document.getElementById("vista-carousel");
      var elenco = elencoSlide();
      if (!viewport || !elenco.length) return 0;
      var idx = Math.round(viewport.scrollLeft / (viewport.clientWidth || 1));
      return Math.max(0, Math.min(idx, elenco.length - 1));
    }
    function aggiornaContatore() {
      var elenco = elencoSlide();
      var idx = indiceVisibile();
      var text = document.querySelector(".carousel-counter-text");
      var nome = document.querySelector(".carousel-counter-nome");
      if (text) text.textContent = elenco.length ? (idx + 1) + " / " + elenco.length : "—";
      if (nome) {
        var slide = elenco[idx];
        var campo = slide && slide.querySelector(".nome-alt");
        var t = campo && campo.value.trim();
        if (!t) {
          var n = slide && slide.querySelector(".prev-riga-nome");
          t = n ? n.textContent.trim() : "";
        }
        nome.textContent = t.length > 34 ? t.slice(0, 32) + "…" : t;
      }
      var prec = document.getElementById("prec");
      var succ = document.getElementById("succ");
      if (prec) prec.disabled = idx <= 0;
      if (succ) succ.disabled = !elenco.length || idx >= elenco.length - 1;
    }
    function vaiSlide(delta) {
      var elenco = elencoSlide();
      if (!elenco.length) return;
      var viewport = document.getElementById("vista-carousel");
      var idx = Math.max(0, Math.min(indiceVisibile() + delta, elenco.length - 1));
      if (viewport) viewport.scrollTo({ left: idx * viewport.clientWidth, behavior: "smooth" });
      setTimeout(aggiornaContatore, 320);
    }
    var vista = document.getElementById("vista-carousel");
    if (vista) vista.addEventListener("scroll", aggiornaContatore, { passive: true });
    var prec = document.getElementById("prec");
    var succ = document.getElementById("succ");
    if (prec) prec.addEventListener("click", function () { vaiSlide(-1); });
    if (succ) succ.addEventListener("click", function () { vaiSlide(1); });
    aggiornaContatore();
    aggiornaAvanzamento();
    function euroDaMaschera(v) {
      var cifre = String(v || "").replace(/\\D/g, "");
      if (!cifre) return null;
      var n = Number(cifre) / 100;
      return n > 0 ? n : null;
    }
    function qtaDaTesto(v) {
      var s = String(v || "").trim().replace(",", ".");
      if (!s) return null;
      var n = Number(s);
      return n > 0 ? n : null;
    }
    function raccogliBozza() {
      var righe = [];
      var alternativi = [];
      document.querySelectorAll(".scheda").forEach(function (box) {
        var prezzo = euroDaMaschera(box.querySelector(".prezzo").value);
        var confEl = box.querySelector(".conf");
        var unita = confEl.dataset.unita || "";
        var qta = qtaDaTesto(confEl.value);
        var codice = (box.querySelector(".codice").value || "").trim();
        var nota = (box.querySelector(".nota-riga").value || "").trim();
        if (box.getAttribute("data-alt") === "1") {
          alternativi.push({
            id: box.getAttribute("data-id"),
            nome: (box.querySelector(".nome-alt").value || "").trim(),
            prezzo: prezzo,
            unita: unita,
            qta: qta,
            codice: codice,
            note: nota
          });
          return;
        }
        if (prezzo == null && !unita && qta == null && !codice && !nota) return;
        righe.push({ id: box.getAttribute("data-id"), prezzo: prezzo, unita: unita, qta: qta, codice: codice, note: nota });
      });
      var noteEl = document.getElementById("note");
      return { righe: righe, alternativi: alternativi, note: noteEl ? (noteEl.value || "").trim() : "" };
    }
    var bozzaTimer = null;
    var bozzaInCorso = false;
    var bozzaDiNuovo = false;
    function salvaBozza(subito) {
      clearTimeout(bozzaTimer);
      var parti = function () {
        if (bozzaInCorso) { bozzaDiNuovo = true; return; }
        bozzaInCorso = true;
        var token = "";
        try { token = JSON.parse(document.getElementById("dati").textContent).token; } catch (e) { token = ""; }
        var stato = document.getElementById("stato-bozza");
        fetch("/preventivo/r/" + encodeURIComponent(token) + "/bozza", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          keepalive: true,
          body: JSON.stringify(raccogliBozza())
        }).then(function (res) {
          if (stato) stato.textContent = res.ok ? "Bozza salvata" : "Bozza non salvata";
        }).catch(function () {
          if (stato) stato.textContent = "Bozza non salvata";
        }).then(function () {
          bozzaInCorso = false;
          if (bozzaDiNuovo) { bozzaDiNuovo = false; salvaBozza(true); }
        });
      };
      if (subito) parti();
      else bozzaTimer = setTimeout(parti, 400);
    }
    window.addEventListener("pagehide", function () { salvaBozza(true); });
    var aggiungi = document.getElementById("aggiungi-alt");
    if (aggiungi) aggiungi.addEventListener("click", function () {
      var modello = document.getElementById("modello-alt");
      var track = document.querySelector(".carousel-prev-track");
      if (!modello || !track) return;
      var slide = modello.content.firstElementChild.cloneNode(true);
      var id = "alt-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      slide.id = id;
      slide.querySelector(".scheda").setAttribute("data-id", id);
      track.appendChild(slide);
      var viewport = document.getElementById("vista-carousel");
      var elenco = elencoSlide();
      if (viewport) viewport.scrollTo({ left: (elenco.length - 1) * viewport.clientWidth, behavior: "smooth" });
      setTimeout(aggiornaContatore, 320);
      aggiornaAvanzamento();
      var nome = slide.querySelector(".nome-alt");
      if (nome) nome.focus();
      salvaBozza(true);
    });
    document.addEventListener("click", function (e) {
      var togli = e.target.closest && e.target.closest(".togli-alt");
      if (togli) {
        var slide = togli.closest(".carousel-slide-prev");
        if (slide) slide.remove();
        aggiornaContatore();
        aggiornaAvanzamento();
        salvaBozza(true);
        return;
      }
      var g = e.target.closest && e.target.closest(".btn-articolo-grid-prev");
      if (g) {
        var id = g.getAttribute("data-slide");
        document.querySelectorAll(".btn-articolo-grid-prev").forEach(function (b) {
          b.classList.toggle("active", b === g);
        });
        document.querySelectorAll(".carousel-slide-prev").forEach(function (s) {
          s.classList.toggle("is-active-slide", s.id === id);
        });
        var ph = document.querySelector(".pannello-placeholder-prev");
        if (ph) ph.classList.add("nascosto");
        return;
      }
      var b = e.target.closest && e.target.closest(".unita-tasto");
      if (!b) return;
      var box = b.closest(".scheda");
      box.querySelectorAll(".unita-tasto").forEach(function (x) {
        x.setAttribute("aria-pressed", x === b ? "true" : "false");
      });
      var input = box.querySelector(".conf");
      var u = b.getAttribute("data-unita") || "";
      input.dataset.unita = u;
      input.setAttribute("inputmode", u === "g" || u === "PZ" ? "numeric" : "decimal");
      input.placeholder = u === "g" ? "500" : (u === "kg" ? "15" : (u === "L" ? "5" : "6"));
      sistema(input);
      if (box.getAttribute("data-alt") === "1") {
        var fam = u === "L" ? "L" : (u === "PZ" ? "pz" : "kg");
        var et = box.querySelector(".etichetta-prezzo");
        var aiutoPrezzo = box.querySelector(".aiuto-prezzo");
        var aiutoCollo = box.querySelector(".aiuto-collo");
        if (et) et.textContent = fam === "L" ? "Prezzo €/L" : (fam === "pz" ? "Prezzo €/pz" : "Prezzo €/kg");
        if (aiutoPrezzo) aiutoPrezzo.textContent = "110 diventa 1,10 € per " + fam + ".";
        if (aiutoCollo) aiutoCollo.textContent = fam === "L" ? "5 L si scrive 5 e L." : (fam === "pz" ? "6 bottiglie si scrive 6 e PZ." : (u === "g" ? "500 g si scrive 500 e g." : "30 kg si scrive 30 e kg, non 30000."));
      }
      input.focus();
      aggiornaAvanzamento();
      salvaBozza(true);
    });
    var tasto = document.getElementById("invia");
    if (tasto) tasto.addEventListener("click", function () {
      var errore = document.getElementById("errore");
      var righe = [];
      var problema = "";
      document.querySelectorAll(".scheda").forEach(function (box) {
        var prezzo = box.querySelector(".prezzo").value.replace(/\\D/g, "");
        var confEl = box.querySelector(".conf");
        var confRaw = confEl.value.trim();
        var unita = confEl.dataset.unita || "";
        var codice = (box.querySelector(".codice").value || "").trim();
        var nota = (box.querySelector(".nota-riga").value || "").trim();
        var alt = box.getAttribute("data-alt") === "1";
        var nomeAlt = alt ? (box.querySelector(".nome-alt").value || "").trim() : "";
        var nome = alt ? (nomeAlt || "Articolo alternativo") : box.querySelector(".prev-riga-nome").textContent;
        var salvato = leggiCollo(box);
        if (!prezzo && !confRaw && !unita && !codice && !nota && !nomeAlt) return;
        var euro = prezzo ? Number(prezzo) / 100 : 0;
        var famigliaSbagliata = alt ? "" : testoUnita(box.getAttribute("data-udm") || "kg", unita);
        if (alt && !nomeAlt) problema = problema || "Scrivi il nome dell'articolo alternativo.";
        else if (!(euro > 0)) problema = problema || (nome + ": scrivi il prezzo.");
        else if (!unita) problema = problema || (nome + ": scegli l'unità della confezione.");
        else if (famigliaSbagliata) problema = problema || (nome + ": " + famigliaSbagliata);
        else if (!(salvato > 0)) problema = problema || (nome + ": scrivi quanto contiene un collo.");
        else {
          var riga = {
            id: box.getAttribute("data-id"),
            prezzo: euro,
            confezione: salvato,
            unita: unita,
            qta: Number(confRaw.replace(",", ".")),
            codice: codice,
            note: nota
          };
          if (alt) {
            riga.alternativo = true;
            riga.nome = nomeAlt;
          }
          righe.push(riga);
        }
      });
      if (!problema && !righe.length) problema = "Inserisci almeno un prezzo prima di inviare.";
      if (problema) {
        errore.hidden = false;
        errore.textContent = problema;
        return;
      }
      tasto.disabled = true;
      var token = "";
      try { token = JSON.parse(document.getElementById("dati").textContent).token; } catch (e) { token = ""; }
      var noteGenerali = "";
      var noteEl = document.getElementById("note");
      if (noteEl) noteGenerali = (noteEl.value || "").trim();
      fetch("/preventivo/r/" + encodeURIComponent(token), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ righe: righe, note: noteGenerali })
      }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
        .then(function (out) {
          if (!out.ok || !out.data.ok) throw new Error((out.data && out.data.errore) || "Invio non riuscito.");
          document.querySelector("main").innerHTML = "<h1>Preventivo inviato</h1><p>Grazie. Il locale lo vede sul suo computer.</p>";
        })
        .catch(function (err) {
          tasto.disabled = false;
          errore.hidden = false;
          errore.textContent = err.message || "Il computer del locale non risponde.";
        });
    });
  </script>
</body>
</html>
"""


def _colonna(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def _xlsx(articoli):
    righe = [[
        "Nome", "Prezzo", "Unità del prezzo", "Unità confezione",
        "Confezione", "Codice articolo", "Note",
    ]]
    for art in articoli or []:
        udm = _udm(art.get("udm"))
        righe.append([
            str(art.get("nome") or ""),
            "",
            _unita_prezzo(udm),
            "",
            "",
            "",
            "",
        ])
    righe.append(["Note generali", "", "", "", "", "", ""])
    xml_righe = []
    for i, riga in enumerate(righe, 1):
        celle = []
        for j, val in enumerate(riga, 1):
            ref = _colonna(j) + str(i)
            if val == "":
                celle.append('<c r="%s"/>' % ref)
            else:
                celle.append('<c r="%s" t="inlineStr"><is><t>%s</t></is></c>' % (ref, _html(val)))
        xml_righe.append('<row r="%d">%s</row>' % (i, "".join(celle)))
    foglio = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        "<sheetData>" + "".join(xml_righe) + "</sheetData></worksheet>"
    )
    pezzi = {
        "[Content_Types].xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            "</Types>"
        ),
        "_rels/.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>"
        ),
        "xl/workbook.xml": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            '<sheets><sheet name="Preventivo" sheetId="1" r:id="rId1"/></sheets></workbook>'
        ),
        "xl/_rels/workbook.xml.rels": (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            "</Relationships>"
        ),
        "xl/worksheets/sheet1.xml": foglio,
    }
    buf = BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for nome, testo in pezzi.items():
            z.writestr(nome, testo)
    return buf.getvalue()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        path = urlparse(self.path).path
        if path == "/cassa-drive" or path == "/fatture-mail" or path.startswith("/fatture-mail/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _corpo(self):
        n = int(self.headers.get("Content-Length") or 0)
        if n < 0 or n > 200000:
            return None
        raw = self.rfile.read(n) if n else b""
        if not raw:
            return {}
        try:
            dati = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            return None
        return dati if isinstance(dati, dict) else None

    def _host_pubblico(self):
        host = (self.headers.get("Host") or "").lower()
        return "tail178446.ts.net" in host

    def _nega_pubblico(self):
        if not self._host_pubblico():
            return False
        path = urlparse(self.path).path
        if path.startswith("/preventivo/r/"):
            return False
        self.send_error(404)
        return True

    def do_GET(self):
        if self._nega_pubblico():
            return
        path = urlparse(self.path).path
        if path in ("/preventivi_link.json", "/preventivi_link.tmp"):
            self.send_error(404)
            return
        if path == "/api/preventivi":
            with _prev_lock:
                dati = _leggi_prev()
            visibili = [x for x in dati["link"] if x.get("stato") not in ("tolto", "scartato")]
            self._json(200, {"ok": True, "base": _base(), "https": _base().startswith("https://"), "link": visibili})
            return
        if path.startswith("/api/preventivi/") and path.endswith("/excel"):
            token = path[len("/api/preventivi/"):-len("/excel")].strip("/")
            self._excel(token)
            return
        if path.startswith("/preventivo/r/"):
            token = path[len("/preventivo/r/"):]
            if not _TOKEN.match(token):
                pagina = _pagina_fornitore(None, "").encode("utf-8")
                self.send_response(404)
            else:
                with _prev_lock:
                    link = _trova(_leggi_prev(), token)
                pagina = _pagina_fornitore(link, "").encode("utf-8")
                self.send_response(200 if link else 404)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(pagina)))
            self.end_headers()
            self.wfile.write(pagina)
            return
        if path == "/fatture-mail":
            self._json(200, fatture_drive.leggi())
            return
        if path.startswith("/fatture-mail/"):
            ident = path[len("/fatture-mail/"):]
            pdf = fatture_drive.bytes_di(ident)
            if pdf is None:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "application/pdf")
            self.send_header("Content-Length", str(len(pdf)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(pdf)
            return
        if path != "/cassa-drive":
            return super().do_GET()
        qs = parse_qs(urlparse(self.path).query)
        fresco = "1" in qs.get("fresco", [])
        now = time.time()
        with _lock:
            if not fresco and _cache["body"] and now - _cache["t"] < 20:
                body = _cache["body"]
            else:
                body = json.dumps(cassa_drive.leggi_chiusure(), ensure_ascii=False).encode("utf-8")
                _cache["t"] = now
                _cache["body"] = body
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self._nega_pubblico():
            return
        path = urlparse(self.path).path
        corpo = self._corpo()
        if corpo is None:
            self._json(400, {"ok": False, "errore": "Non ho letto i dati."})
            return
        if path == "/fatture-mail/presa":
            fatture_drive.segna_presa(str(corpo.get("id") or ""))
            self._json(200, {"ok": True})
            return
        if path == "/api/preventivi":
            self._crea(corpo)
            return
        if path.startswith("/api/preventivi/") and path.endswith("/importato"):
            token = path[len("/api/preventivi/"):-len("/importato")]
            self._segna(token, "importato")
            return
        if path.startswith("/api/preventivi/") and path.endswith("/togli"):
            token = path[len("/api/preventivi/"):-len("/togli")]
            self._segna(token, "tolto")
            return
        if path.startswith("/api/preventivi/") and path.endswith("/scarta"):
            token = path[len("/api/preventivi/"):-len("/scarta")]
            self._segna(token, "scartato")
            return
        if path.startswith("/preventivo/r/") and path.endswith("/bozza"):
            token = path[len("/preventivo/r/"):-len("/bozza")].strip("/")
            self._bozza(token, corpo)
            return
        if path.startswith("/preventivo/r/"):
            self._invia(path[len("/preventivo/r/"):], corpo)
            return
        self._json(404, {"ok": False, "errore": "Indirizzo sconosciuto."})

    def _crea(self, corpo):
        fornitore = _iniziale(corpo.get("fornitore"))
        if not fornitore:
            self._json(400, {"ok": False, "errore": "Scrivi il nome del fornitore."})
            return
        articoli = []
        visti = set()
        for raw in corpo.get("articoli") or []:
            if not isinstance(raw, dict):
                continue
            id_art = str(raw.get("id") or "").strip()
            if not id_art or id_art in visti or len(articoli) >= 200:
                continue
            visti.add(id_art)
            articoli.append({
                "id": id_art[:40],
                "nome": str(raw.get("nome") or id_art)[:80],
                "udm": _udm(raw.get("udm")),
            })
        if not articoli:
            self._json(400, {"ok": False, "errore": "Non c'è un articolo da chiedere."})
            return
        giorni = _giorni(corpo.get("giorni"))
        if giorni is None:
            self._json(400, {"ok": False, "errore": "Scrivi quanti giorni resta valido, per esempio 7."})
            return
        scade = _scade_il(giorni)
        token = secrets.token_urlsafe(18)
        link = {
            "token": token,
            "fornitore": fornitore[:80],
            "locale": _iniziale(corpo.get("locale"))[:80] or "Pizzeria",
            "creato": _adesso(),
            "giorni": giorni,
            "scade": scade,
            "stato": "aperto",
            "inviato": "",
            "articoli": articoli,
            "righe": [],
        }
        with _prev_lock:
            dati = _leggi_prev()
            dati["link"].append(link)
            _scrivi_prev(dati)
        base = _base()
        self._json(200, {
            "ok": True,
            "token": token,
            "fornitore": fornitore,
            "giorni": giorni,
            "scade": scade,
            "base": base,
            "https": base.startswith("https://"),
            "url": _url_link(token),
            "n": len(articoli),
        })

    def _segna(self, token, stato):
        if not _TOKEN.match(token):
            self._json(404, {"ok": False, "errore": "Questo link non c'è."})
            return
        with _prev_lock:
            dati = _leggi_prev()
            link = _trova(dati, token)
            if not link:
                self._json(404, {"ok": False, "errore": "Questo link non c'è."})
                return
            link["stato"] = stato
            _scrivi_prev(dati)
        self._json(200, {"ok": True})

    def _bozza(self, token, corpo):
        if not _TOKEN.match(token):
            self._json(404, {"ok": False, "errore": "Questo link non c'è."})
            return
        with _prev_lock:
            dati = _leggi_prev()
            link = _trova(dati, token)
            if not link or link.get("stato") == "tolto":
                self._json(404, {"ok": False, "errore": "Questo link non c'è."})
                return
            if _scaduto(link):
                self._json(400, {"ok": False, "errore": "Questo link è scaduto."})
                return
            if link.get("stato") != "aperto":
                self._json(400, {"ok": False, "errore": "Questo preventivo è già stato inviato."})
                return
            noti = {a["id"] for a in link.get("articoli") or []}
            righe = []
            visti = set()
            for raw in corpo.get("righe") or []:
                if not isinstance(raw, dict):
                    continue
                id_art = str(raw.get("id") or "")
                if id_art not in noti or id_art in visti:
                    continue
                visti.add(id_art)
                riga = {"id": id_art}
                prezzo = _numero(raw.get("prezzo"))
                unita = _unita_scelta(raw.get("unita"))
                qta = _numero(raw.get("qta"))
                codice = _testo(raw.get("codice"), 40)
                nota = _testo(raw.get("note"), 240)
                if prezzo is not None:
                    riga["prezzo"] = round(prezzo, 4)
                if unita:
                    riga["unita"] = unita
                if qta is not None:
                    riga["qta"] = qta
                if codice:
                    riga["codice"] = codice
                if nota:
                    riga["note"] = nota
                if len(riga) > 1:
                    righe.append(riga)
            alternativi = []
            visti_alt = set()
            for raw in (corpo.get("alternativi") or [])[:30]:
                if not isinstance(raw, dict):
                    continue
                id_alt = str(raw.get("id") or "")
                if not _ALT.match(id_alt) or id_alt in visti_alt:
                    continue
                visti_alt.add(id_alt)
                riga = {"id": id_alt, "nome": _testo(raw.get("nome"), 80)}
                prezzo = _numero(raw.get("prezzo"))
                unita = _unita_scelta(raw.get("unita"))
                qta = _numero(raw.get("qta"))
                codice = _testo(raw.get("codice"), 40)
                nota = _testo(raw.get("note"), 240)
                if prezzo is not None:
                    riga["prezzo"] = round(prezzo, 4)
                if unita:
                    riga["unita"] = unita
                if qta is not None:
                    riga["qta"] = qta
                if codice:
                    riga["codice"] = codice
                if nota:
                    riga["note"] = nota
                alternativi.append(riga)
            link["bozza"] = {
                "note": _testo(corpo.get("note"), 500),
                "righe": righe,
                "alternativi": alternativi,
            }
            _scrivi_prev(dati)
        self._json(200, {"ok": True})

    def _invia(self, token, corpo):
        if not _TOKEN.match(token):
            self._json(404, {"ok": False, "errore": "Questo link non c'è."})
            return
        with _prev_lock:
            dati = _leggi_prev()
            link = _trova(dati, token)
            if not link or link.get("stato") == "tolto":
                self._json(404, {"ok": False, "errore": "Questo link non c'è."})
                return
            if _scaduto(link):
                self._json(400, {"ok": False, "errore": "Questo link è scaduto."})
                return
            if link.get("stato") != "aperto":
                self._json(400, {"ok": False, "errore": "Questo preventivo è già stato inviato."})
                return
            noti = {a["id"]: a for a in link.get("articoli") or []}
            righe = []
            for raw in corpo.get("righe") or []:
                if not isinstance(raw, dict):
                    continue
                id_raw = str(raw.get("id") or "")
                if raw.get("alternativo") and _ALT.match(id_raw):
                    nome = _testo(raw.get("nome"), 80)
                    unita = _unita_scelta(raw.get("unita"))
                    qta = _numero(raw.get("qta"))
                    prezzo = _numero(raw.get("prezzo"))
                    udm = _udm_da_unita(unita)
                    if not nome:
                        self._json(400, {"ok": False, "errore": "Scrivi il nome dell'articolo alternativo."})
                        return
                    if prezzo is None:
                        self._json(400, {"ok": False, "errore": nome + ": il prezzo non è un numero."})
                        return
                    conf = _collo_udm(udm, unita, qta) if qta is not None else None
                    if conf is None:
                        self._json(400, {"ok": False, "errore": nome + ": scrivi quanto contiene un collo."})
                        return
                    riga = {
                        "id": id_raw,
                        "nome": nome,
                        "alternativo": True,
                        "udm": udm,
                        "prezzo": round(prezzo, 4),
                        "confezione": conf,
                    }
                    codice = _testo(raw.get("codice"), 40)
                    nota = _testo(raw.get("note"), 240)
                    if codice:
                        riga["codice"] = codice
                    if nota:
                        riga["note"] = nota
                    righe.append(riga)
                    continue
                art = noti.get(id_raw)
                if not art:
                    continue
                prezzo = _numero(raw.get("prezzo"))
                nome = str(art.get("nome") or art["id"])
                udm = _udm(art.get("udm"))
                unita = _unita_scelta(raw.get("unita"))
                if unita:
                    qta = _numero(raw.get("qta"))
                    conf = _collo_udm(udm, unita, qta) if qta is not None else None
                    if conf is None and qta is not None and not _stessa_famiglia(udm, unita):
                        attesa = "litri: scegli L" if udm == "L" else ("pezzi: scegli PZ" if udm == "pz" else "kg: scegli g o kg")
                        self._json(400, {"ok": False, "errore": nome + ": questo articolo è a " + attesa + "."})
                        return
                else:
                    conf = _numero(raw.get("confezione"))
                if prezzo is None:
                    self._json(400, {"ok": False, "errore": nome + ": il prezzo non è un numero."})
                    return
                if conf is None:
                    self._json(400, {"ok": False, "errore": nome + ": scrivi quanto contiene un collo."})
                    return
                riga = {"id": art["id"], "prezzo": round(prezzo, 4), "confezione": conf}
                codice = _testo(raw.get("codice"), 40)
                nota = _testo(raw.get("note"), 240)
                if codice:
                    riga["codice"] = codice
                if nota:
                    riga["note"] = nota
                righe.append(riga)
            if not righe:
                self._json(400, {"ok": False, "errore": "Inserisci almeno un prezzo prima di inviare."})
                return
            link["righe"] = righe
            link["note"] = _testo(corpo.get("note"), 500)
            link["stato"] = "inviato"
            link["inviato"] = _adesso()
            _scrivi_prev(dati)
        self._json(200, {"ok": True, "n": len(righe)})

    def _excel(self, token):
        if not _TOKEN.match(token):
            self.send_error(404)
            return
        with _prev_lock:
            link = _trova(_leggi_prev(), token)
        if not link or link.get("stato") == "tolto":
            self.send_error(404)
            return
        body = _xlsx(link.get("articoli") or [])
        nome = re.sub(r"[^\w]+", "-", str(link.get("fornitore") or "preventivo")).strip("-") or "preventivo"
        self.send_response(200)
        self.send_header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        self.send_header("Content-Disposition", 'attachment; filename="preventivo-' + nome + '.xlsx"')
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        if args and "cassa-drive" in str(args[0]):
            super().log_message(fmt, *args)
        else:
            super().log_message(fmt, *args)


def main():
    _assicura_https()
    server = ThreadingHTTPServer(("127.0.0.1", 8877), Handler)
    print("ERP leggero su http://127.0.0.1:8877", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
