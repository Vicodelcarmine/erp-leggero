/* Unisce il quaderno di questo telefono con le righe dell'archivio.
   Non calcola giacenza né sfrido: decide solo quali righe restano.
   Due conteggi diversi dello stesso articolo restano entrambi.
   Due scritture della stessa riga: resta l'ora più recente, l'altra diventa una nota. */
(function (root, factory) {
  let codici = root && root.ErpCodici;
  if (!codici) codici = require("./codici");
  const api = factory(codici);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ErpArchivioSync = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (codici) {
  "use strict";

  const LISTE = ["ingredienti", "offerte", "piatti", "ricette", "carichi", "vendite", "inventari", "codici", "fatture", "note"];

  function codice(id) {
    return String(id || "").trim().toUpperCase();
  }

  function canon(val) {
    if (Array.isArray(val)) return "[" + val.map(canon).join(",") + "]";
    if (val && typeof val === "object") {
      return "{" + Object.keys(val).sort().map(function (k) {
        return JSON.stringify(k) + ":" + canon(val[k]);
      }).join(",") + "}";
    }
    return JSON.stringify(val);
  }

  function momento(r) {
    return String((r && (r.at || r.data)) || "");
  }

  function idDi(collezione, riga) {
    if (!riga || typeof riga !== "object") return "";
    if (collezione === "ingredienti" || collezione === "piatti") return codice(riga.id);
    if (collezione === "ricette") {
      const p = codice(riga.idPiatto);
      const i = codice(riga.idIngrediente);
      return p && i ? p + "|" + i : "";
    }
    if (collezione === "codici") return codici.chiave(riga) || "";
    if (collezione === "fatture") {
      const num = String(riga.numero || riga.nomeFile || "").trim();
      if (!num) return "";
      return String(riga.fornitore || "").trim().toLocaleLowerCase("it") + "|" + num;
    }
    if (collezione === "impostazioni") return "locale";
    return String(riga.id || "").trim();
  }

  function rigaImpostazioni(stato) {
    return {
      id: "locale",
      versione: 1,
      demo: !!stato.demo,
      scelta: stato.scelta != null ? !!stato.scelta : false,
      impostazioni: stato.impostazioni || {},
    };
  }

  function listeDi(stato, forzaImpostazioni) {
    const s = stato || {};
    const out = {};
    if (forzaImpostazioni || s._haImpostazioni !== false) out.impostazioni = [rigaImpostazioni(s)];
    else out.impostazioni = [];
    LISTE.forEach(function (nome) {
      out[nome] = Array.isArray(s[nome]) ? s[nome] : [];
    });
    return out;
  }

  function indice(collezione, righe) {
    const map = new Map();
    (righe || []).forEach(function (r) {
      const id = idDi(collezione, r);
      if (id) map.set(id, r);
    });
    return map;
  }

  function preferisci(loc, rem) {
    const a = momento(loc);
    const b = momento(rem);
    if (a === b) return loc;
    return a > b ? loc : rem;
  }

  function notaDi(collezione, id, tenuto, altro) {
    const base = {
      id: "nota|" + collezione + "|" + id + "|" + momento(altro) + "|" + canon(altro).slice(0, 24),
      collezione: collezione,
      idRiga: id,
      testo: "Due versioni di " + collezione + " " + id + ". Tengo la più recente.",
    };
    if (collezione === "inventari") {
      base.idIngrediente = (tenuto && tenuto.idIngrediente) || (altro && altro.idIngrediente) || "";
      base.tenutoReale = tenuto ? tenuto.reale : null;
      base.tenutoAt = tenuto ? tenuto.at : "";
      base.altroReale = altro ? altro.reale : null;
      base.altroAt = altro ? altro.at : "";
    }
    return base;
  }

  function unisci(locale, remoto, ack) {
    const prima = listeDi(locale, true);
    const dopo = listeDi(remoto, false);
    const memoria = ack || {};
    const prossimo = Object.assign({}, memoria);
    const invia = [];
    const togli = [];
    const noteNuove = [];
    const risultato = {};
    let cambiato = false;

    function guarda(nome, locali, remoti) {
      const L = indice(nome, locali);
      const R = indice(nome, remoti);
      const ids = new Set();
      L.forEach(function (_r, id) { ids.add(id); });
      R.forEach(function (_r, id) { ids.add(id); });
      const tieni = [];
      ids.forEach(function (id) {
        const loc = L.get(id) || null;
        const rem = R.get(id) || null;
        const chiave = nome + "|" + id;
        const firmaAck = Object.prototype.hasOwnProperty.call(memoria, chiave) ? memoria[chiave] : null;
        const firmaLoc = loc ? canon(loc) : null;
        const firmaRem = rem ? canon(rem) : null;
        if (loc && !rem) {
          if (firmaAck == null || firmaLoc !== firmaAck) {
            tieni.push(loc);
            invia.push({ collezione: nome, id: id, corpo: loc });
          } else {
            togli.push({ collezione: nome, id: id });
            delete prossimo[chiave];
            cambiato = true;
          }
          return;
        }
        if (rem && !loc) {
          tieni.push(rem);
          prossimo[chiave] = firmaRem;
          cambiato = true;
          return;
        }
        if (firmaLoc === firmaRem) {
          tieni.push(loc);
          prossimo[chiave] = firmaLoc;
          return;
        }
        if (firmaLoc === firmaAck) {
          tieni.push(rem);
          prossimo[chiave] = firmaRem;
          cambiato = true;
          return;
        }
        if (firmaRem === firmaAck || firmaAck == null) {
          tieni.push(loc);
          invia.push({ collezione: nome, id: id, corpo: loc });
          return;
        }
        const scelto = preferisci(loc, rem);
        const altro = scelto === loc ? rem : loc;
        tieni.push(scelto);
        if (scelto === loc) invia.push({ collezione: nome, id: id, corpo: loc });
        else prossimo[chiave] = canon(scelto);
        noteNuove.push(notaDi(nome, id, scelto, altro));
        cambiato = true;
      });
      risultato[nome] = tieni;
    }

    guarda("impostazioni", prima.impostazioni, dopo.impostazioni);
    LISTE.forEach(function (nome) {
      if (nome === "note") return;
      guarda(nome, prima[nome], dopo[nome]);
    });

    const noteLocali = (prima.note || []).slice();
    const giaNote = {};
    noteLocali.forEach(function (n) { giaNote[idDi("note", n)] = true; });
    noteNuove.forEach(function (n) {
      const id = idDi("note", n);
      if (!id || giaNote[id]) return;
      giaNote[id] = true;
      noteLocali.push(n);
    });
    guarda("note", noteLocali, dopo.note || []);

    const imp = (risultato.impostazioni || [])[0] || rigaImpostazioni(locale || {});
    const stato = {
      versione: 1,
      demo: !!imp.demo,
      scelta: !!imp.scelta,
      impostazioni: imp.impostazioni || {},
      ingredienti: risultato.ingredienti || [],
      offerte: risultato.offerte || [],
      piatti: risultato.piatti || [],
      ricette: risultato.ricette || [],
      carichi: risultato.carichi || [],
      vendite: risultato.vendite || [],
      inventari: risultato.inventari || [],
      codici: risultato.codici || [],
      fatture: risultato.fatture || [],
      note: risultato.note || [],
    };
    return { stato: stato, invia: invia, togli: togli, cambiato: cambiato, ack: prossimo };
  }

  function applica(stato, nuovo) {
    if (!stato || !nuovo) return stato;
    stato.versione = 1;
    stato.demo = !!nuovo.demo;
    stato.scelta = !!nuovo.scelta;
    stato.impostazioni = nuovo.impostazioni || {};
    LISTE.forEach(function (nome) {
      stato[nome] = nuovo[nome] || [];
    });
    return stato;
  }

  async function raccogli(leggiPagina) {
    const tutti = [];
    const pagina = 1000;
    for (let da = 0; ; da += pagina) {
      const lista = await leggiPagina(da, pagina);
      const righe = Array.isArray(lista) ? lista : [];
      tutti.push.apply(tutti, righe);
      if (righe.length < pagina) break;
    }
    return tutti;
  }

  function confermaInvio(ack, invia) {
    const prossimo = Object.assign({}, ack || {});
    (invia || []).forEach(function (r) {
      prossimo[r.collezione + "|" + r.id] = canon(r.corpo);
    });
    return prossimo;
  }

  function daRighe(righe) {
    const stato = {
      versione: 1,
      demo: false,
      scelta: false,
      impostazioni: {
        nomeLocale: "Pizzeria",
        giorniCopertura: 7,
        giorniStorico: 30,
        sogliaAllerta: 0.1,
      },
      ingredienti: [],
      offerte: [],
      piatti: [],
      ricette: [],
      carichi: [],
      vendite: [],
      inventari: [],
      codici: [],
      fatture: [],
      note: [],
      _haImpostazioni: false,
    };
    (righe || []).forEach(function (r) {
      const nome = r && r.collezione;
      const corpo = r && r.corpo;
      if (!nome || !corpo || typeof corpo !== "object") return;
      if (nome === "impostazioni") {
        stato._haImpostazioni = true;
        stato.demo = !!corpo.demo;
        stato.scelta = !!corpo.scelta;
        stato.impostazioni = corpo.impostazioni || stato.impostazioni;
        return;
      }
      if (LISTE.indexOf(nome) < 0 || nome === "impostazioni") return;
      stato[nome].push(corpo);
    });
    return stato;
  }

  return {
    unisci: unisci,
    applica: applica,
    raccogli: raccogli,
    confermaInvio: confermaInvio,
    daRighe: daRighe,
    idDi: idDi,
    canon: canon,
    liste: LISTE,
  };
});
