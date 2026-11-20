/* Lettura fattura Metro nel browser.
   Non è il convertitore FatturaPA del Mac: stessa lettura delle righe,
   poi una quantità nell'unità del prodotto.
   Regole portate da metro_extract.py, dispatcher.py, resa_um.py
   e dalla guardia in regole_formato_carico.py (prezzo letto come kg). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ErpMetro = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const TOL = 0.05;
  const UOM = { CF: 1, KG: 1, LA: 1, BS: 1, VC: 1, BT: 1, CT: 1, CS: 1, BO: 1, CL: 1, SC: 1, BG: 1, BA: 1, SE: 1 };
  const RE_COD = /^(\d{5,6}(?:\.\d+)?|\d{13,14})\s+/i;
  const RE_NUM = /^[\d,.]+$/;
  const RE_IVA = /\s+([ABCDE])(?:\s+\d{1,7})?\s*$/i;
  const RE_SCONTO_PRIMA = /\s+\d{5,7}$/;

  function toFloat(raw) {
    if (raw == null) return null;
    let s = String(raw).trim().replace(/[^\d,.\-+]/g, "");
    if (!s || s === "-" || s === "+") return null;
    if (s.indexOf(",") >= 0 && s.indexOf(".") >= 0) s = s.replace(/\./g, "").replace(",", ".");
    else if (s.indexOf(",") >= 0) s = s.replace(",", ".");
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function approx(a, b, tol) {
    return Math.abs(Number(a) - Number(b)) <= (tol == null ? TOL : tol);
  }

  function identita(testo) {
    return String(testo || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }

  /* dispatcher.py _is_metro */
  function eMetro(testo) {
    const n = identita(testo);
    if (!n) return false;
    if (n.indexOf("02827030962") >= 0) return true;
    if (n.indexOf("METROITALIA") >= 0 || n.indexOf("METROCASH") >= 0) return true;
    if (n.indexOf("METRO") >= 0 && (n.indexOf("DEPOT") >= 0 || n.indexOf("DELIVERY") >= 0 || n.indexOf("TOSCANA") >= 0 || n.indexOf("DEPOSITO") >= 0)) return true;
    return false;
  }

  /* metro_doc_type.py: la bolla ha Num.Bolla e non è "Fattura Delivery". */
  function eBolla(testo) {
    const flat = String(testo || "").replace(/\s+/g, " ");
    if (/Tipo\s+documento\s*:?\s*DDT/i.test(flat)) return true;
    if (/CODICE\s+DESCRIZIONE\s+PESO\s+QUANTITA/i.test(flat)) return true;
    if (/Num\.?\s*Bolla\s*:/i.test(flat) && !/Fattura\s+Delivery/i.test(flat)) return true;
    return false;
  }

  function codiceErp(cod) {
    const c = String(cod || "").trim();
    const m = /^(\d{5,6})\.\d$/.exec(c);
    return m ? m[1] : c;
  }

  function impronta(bytes) {
    let h = 5381;
    const n = bytes ? bytes.length : 0;
    for (let i = 0; i < n; i++) h = ((h * 33) ^ bytes[i]) >>> 0;
    return n + "-" + h.toString(16);
  }

  function tokenFormato(desc) {
    const d = String(desc || "").trim();
    let m = /^G\.?\s*(\d+(?:[.,]\d+)?)(?:\s*[Xx×]\s*(\d+))?/i.exec(d);
    if (m) {
      const g = toFloat(m[1]) || 0;
      return { udm: "kg", peso: g / 1000, pezzi: m[2] ? parseInt(m[2], 10) : 1 };
    }
    m = /^KG\.?\s*(\d+(?:[.,]\d+)?)/i.exec(d);
    if (m) return { udm: "kg", peso: toFloat(m[1]), pezzi: 1 };
    m = /^BIB\s+LT\s*(\d+(?:[.,]\d+)?)/i.exec(d);
    if (m) return { udm: "L", peso: toFloat(m[1]), pezzi: 1 };
    m = /^LT\s*(\d+(?:[.,]\d+)?)/i.exec(d);
    if (m) return { udm: "L", peso: toFloat(m[1]), pezzi: 1 };
    m = /^L(\d+(?:[.,]\d+)?)/i.exec(d);
    if (m) return { udm: "L", peso: toFloat(m[1]), pezzi: 1 };
    m = /^CL\s*(\d+(?:[.,]\d+)?)/i.exec(d);
    if (m) return { udm: "L", peso: (toFloat(m[1]) || 0) / 100, pezzi: 1 };
    m = /^(\d+)\s+CIALDE\b/i.exec(d);
    if (m) return { udm: "pz", peso: 1, pezzi: parseInt(m[1], 10) };
    return null;
  }

  /* resa_um.py _pezzi_collo_metro_su_token_g */
  function pezziCollo(pezziPdf, peso, qConf, colli) {
    if (!pezziPdf || pezziPdf <= 1) return 1;
    const col = colli != null ? Number(colli) : 0;
    if (peso >= 1) return pezziPdf;
    if (col > 1) return pezziPdf;
    if (Math.abs(pezziPdf - Number(qConf || 0)) > 1e-6) return pezziPdf;
    if (peso > 0 && peso <= 0.2) return pezziPdf;
    return 1;
  }

  function propostaDaRiga(riga) {
    const qtaFattura = riga.qtaFattura != null ? riga.qtaFattura : riga.quantita;
    if (riga.anomala || qtaFattura == null || riga.prezzo == null) {
      return { udm: "", qta: null, prezzoUdm: null, qtaConfezione: 0, nota: riga.errore || "Riga non letta." };
    }
    if (riga.pesoVariabile) {
      return {
        udm: "kg",
        qta: qtaFattura,
        prezzoUdm: riga.prezzo,
        qtaConfezione: 0,
        nota: "Peso letto in fattura.",
      };
    }
    const tok = tokenFormato(riga.descrizione);
    if (!tok || !(tok.peso > 0)) {
      return { udm: "", qta: null, prezzoUdm: null, qtaConfezione: 0, nota: "Manca il formato (es. KG2,5 o L5): non invento i kg." };
    }
    let pezzi = tok.pezzi;
    if (pezzi === 1 && riga.pezzi > 1) pezzi = pezziCollo(Math.round(riga.pezzi), tok.peso, qtaFattura, riga.colli);
    /* resa_um.py _quantita_confezioni_resa: 6 barattoli in 1 collo → 1 collo, non 6×15 kg. */
    let nConf = qtaFattura;
    if (pezzi > 1 && riga.colli >= 1 && Math.abs(qtaFattura - pezzi * riga.colli) <= 0.02) nConf = riga.colli;
    const contenuto = pezzi * tok.peso;
    const qta = contenuto * nConf;
    if (!(qta > 0)) return { udm: tok.udm, qta: null, prezzoUdm: null, qtaConfezione: 0, nota: "Quantità nulla." };
    return {
      udm: tok.udm,
      qta: qta,
      prezzoUdm: riga.importo / qta,
      qtaConfezione: contenuto,
      nota: "",
    };
  }

  function effettoCarico(riga, master) {
    if (!master) return { entra: false, motivo: "Non entra finché non scegli il prodotto." };
    if (riga.qta == null) return { entra: false, motivo: riga.nota || "Quantità non calcolata." };
    const udm = master.udm === "L" || master.udm === "pz" ? master.udm : "kg";
    if (riga.udm && riga.udm !== udm) {
      return { entra: false, motivo: "La fattura è in " + riga.udm + ", il prodotto è in " + udm + "." };
    }
    return {
      entra: true,
      qta: riga.qta,
      udm: udm,
      prezzoUdm: riga.prezzoUdm,
      qtaConfezione: riga.qtaConfezione || 0,
    };
  }

  function compatta(s) {
    return String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "");
  }

  function paroleNome(nome) {
    const stop = { di: 1, da: 1, de: 1, del: 1, con: 1, per: 1, mc: 1 };
    return String(nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3 && !stop[w]; });
  }

  function nomeCombacia(desc, nome) {
    const words = paroleNome(nome);
    const d = compatta(desc);
    if (words.length && words.every(function (w) { return d.indexOf(w) >= 0; })) return true;
    if (words.some(function (w) { return w.indexOf("pelat") === 0; })) {
      if (d.indexOf("pelat") >= 0 || d.indexOf("pomodpel") >= 0) return true;
    }
    return false;
  }

  function scegliMaster(riga, ingredienti, mappa) {
    const cod = codiceErp(riga.codice);
    const vivi = (ingredienti || []).filter(function (i) { return i && i.attivo !== false; });
    if (mappa && cod && mappa[cod]) {
      const salvato = vivi.find(function (i) { return String(i.id).toUpperCase() === String(mappa[cod]).toUpperCase(); });
      if (salvato) return salvato.id;
    }
    const perCodice = vivi.filter(function (i) { return String(i.id).toUpperCase() === String(cod).toUpperCase(); });
    if (perCodice.length === 1) return perCodice[0].id;
    const perNome = vivi.filter(function (i) { return nomeCombacia(riga.descrizione, i.nome); });
    if (perNome.length === 1) return perNome[0].id;
    return "";
  }

  function giaCaricata(elenco, doc) {
    const numero = String(doc && doc.numero || "");
    const segno = String(doc && doc.impronta || "");
    return (elenco || []).some(function (c) {
      if (segno && c.impronta && c.impronta === segno) return true;
      if (numero && c.numero === numero) return true;
      return false;
    });
  }

  function preparaTesto(testo) {
    let t = String(testo || "").replace(/\*/g, " ").replace(/\u00a0/g, " ");
    const righe = [];
    t.split(/\r?\n/).forEach(function (raw) {
      let s = raw.replace(/[ \t]+/g, " ").trim();
      if (!s) return;
      if (s.length <= 2 && /^[a-z]+$/i.test(s)) return;
      s = s.replace(/\s+([BEDC])(?:\s+[A-Za-z0-9]{1,4}){0,3}\s*$/i, " $1");
      s = s.replace(/(\d)([A-E])$/i, "$1 $2");
      righe.push(s);
    });
    const out = [];
    const stop = /^(?:sconto|cat:|orig:|gtin:|lotto|totale|imponibile|riepilogo|---|\*{2,})/i;
    let i = 0;
    while (i < righe.length) {
      let line = righe[i];
      if (RE_COD.test(line) && !RE_IVA.test(line)) {
        let j = i + 1;
        while (j < righe.length && j <= i + 4 && !RE_IVA.test(line)) {
          const nxt = righe[j];
          if (stop.test(nxt)) break;
          if (RE_COD.test(nxt) && RE_IVA.test(line)) break;
          line = (line + " " + nxt).replace(/\s+/g, " ").trim();
          j += 1;
        }
        out.push(line);
        i = j;
        continue;
      }
      out.push(line);
      i += 1;
    }
    return out.join("\n");
  }

  function fnums(parts) {
    const out = [];
    for (let i = 0; i < parts.length; i++) {
      const v = toFloat(parts[i]);
      if (v == null) return [];
      out.push(v);
    }
    return out;
  }

  function popNumeri(parts, n) {
    if (parts.length < n) return null;
    const tail = parts.slice(-n);
    if (!tail.every(function (t) { return RE_NUM.test(t); })) return null;
    const nums = fnums(tail);
    if (nums.length !== n) return null;
    return { head: parts.slice(0, -n), nums: nums };
  }

  function splitCodice(head) {
    const m = RE_COD.exec(head);
    if (!m) return null;
    let rest = head.slice(m[0].length).trim();
    const tokens = rest.split(/\s+/).filter(Boolean);
    if (!tokens.length) return null;
    let uom = "";
    if (UOM[tokens[tokens.length - 1].toUpperCase()]) {
      uom = tokens.pop().toUpperCase();
      rest = tokens.join(" ");
    }
    return { cod: m[1], desc: rest.replace(/\s+/g, " ").trim(), uom: uom };
  }

  /* metro_extract.py _validate_cf */
  function validaCf(pvU, pezzi, pvCollo, colli, importo) {
    if (pezzi > 1 && !approx(pvU * pezzi, pvCollo, TOL)) {
      return { ok: false, prezzo: pvU, qta: colli };
    }
    if (approx(pvCollo * colli, importo, TOL)) {
      if (pezzi > 1 && colli <= 1) return { ok: true, prezzo: pvU, qta: pezzi };
      if (pezzi > 1) return { ok: true, prezzo: pvCollo, qta: colli };
      return { ok: true, prezzo: pvU, qta: colli };
    }
    if (pezzi <= 1 && approx(pvU * colli, importo, TOL)) return { ok: true, prezzo: pvU, qta: colli };
    return { ok: false, prezzo: pvU, qta: colli };
  }

  function sembraPrezzoComeKg(vol, pvU, pezzi, importo, descrizione) {
    /* metro_extract.py fallback delivery_cf_peso + regole_formato_carico.py:
       il prezzo 14,02 della mozzarella KG2 non è un peso. La ricotta 2,700 kg resta un peso. */
    if (!(vol > 0) || !approx(pvU * vol, importo, TOL)) return false;
    const tok = tokenFormato(descrizione);
    if (!tok || tok.udm !== "kg" || !(tok.peso > 0)) return false;
    const colonneScambiate = approx(vol, pezzi, TOL) && approx(pvU, 1, 0.02);
    if (!colonneScambiate) return false;
    const rapporto = vol / tok.peso;
    return rapporto > 3 || rapporto < 1 / 3;
  }

  function rigaOk(base, extra) {
    const r = {
      codice: codiceErp(base.cod),
      codicePdf: base.cod,
      descrizione: base.desc,
      udmFattura: base.uom || "",
      qtaFattura: extra.qta,
      prezzo: extra.prezzo,
      importo: extra.importo,
      colli: extra.colli,
      pezzi: extra.pezzi,
      layout: extra.layout,
      pesoVariabile: !!extra.pesoVariabile,
      anomala: false,
      errore: "",
      scontoValore: null,
      scontoPct: null,
      gtin: "",
    };
    const p = propostaDaRiga(r);
    r.udm = p.udm;
    r.qta = p.qta;
    r.prezzoUdm = p.prezzoUdm;
    r.qtaConfezione = p.qtaConfezione;
    r.nota = p.nota;
    return r;
  }

  function parseCorpo(body, iva) {
    const parts = body.split(/\s+/).filter(Boolean);
    const p5 = popNumeri(parts, 5);
    if (p5 && p5.head.length && p5.head[p5.head.length - 1].toUpperCase() === "KG") {
      const iv = p5.nums[0];
      const vol = p5.nums[1];
      const importo = p5.nums[2];
      const colli = p5.nums[3];
      if (!approx(iv * vol, importo, TOL)) {
        return { anomala: true, errore: "Il prezzo al kg non torna con il peso.", raw: body, layout: "delivery_kg" };
      }
      const split = splitCodice(p5.head.slice(0, -1).join(" "));
      if (!split) return { anomala: true, errore: "Codice non letto.", raw: body, layout: "delivery_kg" };
      return rigaOk({ cod: split.cod, desc: split.desc, uom: "KG" }, {
        prezzo: iv, qta: vol, importo: importo, colli: colli, pezzi: 1,
        layout: "delivery_kg", pesoVariabile: true,
      });
    }
    const p6 = popNumeri(parts, 6);
    let head = null;
    let vol;
    let pvU;
    let pezzi;
    let pvCollo;
    let colli;
    let importo;
    if (p6) {
      head = p6.head;
      vol = p6.nums[0];
      pvU = p6.nums[1];
      pezzi = p6.nums[2];
      pvCollo = p6.nums[3];
      colli = p6.nums[4];
      importo = p6.nums[5];
    } else if (p5) {
      head = p5.head;
      vol = p5.nums[0];
      pvU = p5.nums[1];
      pezzi = p5.nums[2];
      pvCollo = p5.nums[3];
      importo = p5.nums[4];
      colli = 1;
    } else return null;
    const split = splitCodice(head.join(" "));
    if (!split) return { anomala: true, errore: "Codice non letto.", raw: body, layout: "delivery_cf" };
    const val = validaCf(pvU, pezzi, pvCollo, colli, importo);
    if (!val.ok) {
      const prezzoComeKg = sembraPrezzoComeKg(vol, pvU, pezzi, importo, split.desc);
      if (!prezzoComeKg && vol && approx(pvU * vol, importo, TOL)) {
        return rigaOk(
          { cod: split.cod, desc: split.desc, uom: "KG" },
          { prezzo: pvU, qta: vol, importo: importo, colli: colli, pezzi: pezzi, layout: "delivery_cf_peso", pesoVariabile: true }
        );
      }
      /* Stessi 5 numeri riletti senza la colonna VOL: prezzo, pezzi, prezzo collo, colli, importo. */
      if (p5 && !p6) {
        const alt = validaCf(p5.nums[0], p5.nums[1], p5.nums[2], p5.nums[3], p5.nums[4]);
        if (alt.ok) {
          return rigaOk(split, {
            prezzo: alt.prezzo, qta: alt.qta, importo: p5.nums[4], colli: p5.nums[3], pezzi: p5.nums[1],
            layout: "delivery_cf", pesoVariabile: false,
          });
        }
      }
      return { anomala: true, errore: "Quantità e prezzo non tornano.", codice: codiceErp(split.cod), descrizione: split.desc, raw: body, layout: "delivery_cf" };
    }
    const intero = Math.abs(val.qta - Math.round(val.qta)) <= 0.001;
    return rigaOk(split, {
      prezzo: val.prezzo,
      qta: val.qta,
      importo: importo,
      colli: colli,
      pezzi: pezzi,
      layout: "delivery_cf",
      pesoVariabile: false && !intero,
    });
  }

  function estraiBody(line) {
    let s = line;
    let m = RE_IVA.exec(s);
    if (!m) {
      s = s.replace(/([ABCDE])(\d{5,7})$/i, "$1 $2");
      m = RE_IVA.exec(s);
    }
    if (!m) return null;
    let body = s.slice(0, m.index).trim().replace(RE_SCONTO_PRIMA, "").trim();
    return { body: body, iva: m[1].toUpperCase() };
  }

  function daSaltare(line) {
    return /^(?:\*{2,}\s*Ordine|\*{2,}\s*Fine|Consegnato a|Num\.?\s*Bolla|Fattura\s+Delivery|Totale\b|Cod\.?\s*Descr|Codice\s+Descrizione|MM\s+Cod|Riepilogo|Aliquota|Imponibile|---\s*PAGINA|METRO\b|P\.?\s*IVA|Partita\s*IVA|Depot|Fattura\s+\d|Documento\s+\d|Pagina\b|Via\b|Data\s+Fattura|Cod\s+Fiscale|Cap\.\s*Soc|R\.E\.|ALLEYS|DOM\.|ITA\s+\d|Numero di Colli|Zucchero:|Firma|Contributo|ORTOFRUTTA|Metro credit)/i.test(line);
  }

  function attaccaSconto(riga, line) {
    const s = line.replace(/^[a-z]\s+(?=Sconto\b)/i, "");
    let m = /^Sconto a valore unitario\s+([\d,.]+)/i.exec(s);
    if (m) { riga.scontoValore = toFloat(m[1]); return true; }
    m = /^Sconto\s+([\d,.]+)\s*%/i.exec(s);
    if (m) { riga.scontoPct = toFloat(m[1]); return true; }
    return false;
  }

  function intestazione(testo) {
    const num = /(?:Fattura|Documento)[\s\S]{0,160}?(\d{4}\/\d{4,6})/i.exec(testo);
    let numero = num ? num[1] : "";
    if (!numero) {
      const tutti = testo.match(/\b\d{4}\/\d{4,6}\b/g) || [];
      numero = tutti.length ? tutti[0] : "";
    }
    const dataM = /(\d{1,2})[./](\d{1,2})[./](\d{2,4})/.exec(testo);
    let data = "";
    if (dataM) {
      let y = dataM[3];
      if (y.length === 2) y = "20" + y;
      const z = function (n) { return String(n).padStart(2, "0"); };
      data = y + "-" + z(dataM[2]) + "-" + z(dataM[1]);
    }
    let imponibile = null;
    const patt = [
      /totale\s+imponibile\s+food\s+([\d.,]+)/i,
      /imponibile\s+food\s*:?\s*([\d.,]+)/i,
      /totale\s+imponibile\s+([\d.,]+)/i,
    ];
    for (let i = 0; i < patt.length; i++) {
      const m = patt[i].exec(testo);
      if (m) { imponibile = toFloat(m[1]); break; }
    }
    return { fornitore: "Metro", numero: numero, data: data, imponibile: imponibile };
  }

  function leggi(testo) {
    const vuoto = { ok: false, errore: "", fornitore: "", numero: "", data: "", imponibile: null, righe: [], avvisi: [] };
    if (!eMetro(testo)) {
      vuoto.errore = "Questa non è una fattura Metro.";
      return vuoto;
    }
    if (eBolla(testo)) {
      vuoto.errore = "Questa è una bolla Metro, non una fattura. Per ora carico solo la fattura.";
      return vuoto;
    }
    const pulito = preparaTesto(testo);
    const testa = intestazione(pulito);
    const righe = [];
    let corrente = null;
    pulito.split("\n").forEach(function (raw) {
      const line = raw.trim();
      if (!line) return;
      if (daSaltare(line)) return;
      if (corrente && !corrente.anomala && attaccaSconto(corrente, line)) return;
      const gtin = /^GTIN:\s*(.+)$/i.exec(line);
      if (gtin) {
        if (corrente) corrente.gtin = String(gtin[1] || "").replace(/\s+/g, "");
        return;
      }
      if (/^(CAT:|ORIG:|Lotto)/i.test(line)) return;
      const estratto = estraiBody(line);
      if (!estratto) return;
      const parsed = parseCorpo(estratto.body, estratto.iva);
      if (!parsed) return;
      if (corrente) righe.push(corrente);
      corrente = parsed.anomala ? {
        codice: parsed.codice || "",
        descrizione: parsed.descrizione || "",
        anomala: true,
        errore: parsed.errore || "Riga non letta.",
        qta: null,
        prezzo: null,
        importo: null,
        udm: "",
        udmFattura: "",
        qtaFattura: null,
        prezzoUdm: null,
        qtaConfezione: 0,
        colli: null,
        pezzi: null,
        nota: parsed.errore || "Riga non letta.",
        scontoValore: null,
        scontoPct: null,
        gtin: "",
        layout: parsed.layout || "",
        pesoVariabile: false,
      } : parsed;
    });
    if (corrente) righe.push(corrente);
    const valide = righe.filter(function (r) { return !r.anomala && r.importo != null; });
    const somma = Math.round(valide.reduce(function (s, r) { return s + Number(r.importo || 0); }, 0) * 100) / 100;
    const avvisi = [];
    if (!valide.length) avvisi.push("Ho riconosciuto Metro ma non ho trovato righe prodotto.");
    if (testa.imponibile != null && valide.length && Math.abs(somma - testa.imponibile) > 0.05) {
      avvisi.push("La somma delle righe non torna con l'imponibile della fattura.");
    }
    return {
      ok: valide.length > 0,
      errore: valide.length ? "" : (avvisi[0] || "Nessuna riga."),
      fornitore: "Metro",
      numero: testa.numero,
      data: testa.data,
      imponibile: testa.imponibile,
      sommaRighe: somma,
      righe: righe,
      avvisi: avvisi,
    };
  }

  return {
    toFloat: toFloat,
    eMetro: eMetro,
    codiceErp: codiceErp,
    impronta: impronta,
    tokenFormato: tokenFormato,
    propostaDaRiga: propostaDaRiga,
    effettoCarico: effettoCarico,
    nomeCombacia: nomeCombacia,
    scegliMaster: scegliMaster,
    giaCaricata: giaCaricata,
    leggi: leggi,
  };
});
