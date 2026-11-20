/* Codice piatto: prefisso dalla categoria, progressivo sul massimo già presente.
   Gli id passano da codice() del motore (maiuscolo), non da una copia. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ErpCodicePiatto = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function chiave(nome) {
    return String(nome || "").trim().toLocaleLowerCase("it");
  }

  function etichetta(nome) {
    const t = String(nome || "").trim();
    if (!t) return "";
    return t.charAt(0).toLocaleUpperCase("it") + t.slice(1);
  }

  function lettereCategoria(nome) {
    return String(nome || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "");
  }

  function parti(id, codice) {
    const c = codice(id);
    const m = /^([A-Z]+)-(\d+)$/.exec(c);
    if (!m) return null;
    return { prefisso: m[1], n: Number(m[2]) };
  }

  function occupati(piatti, codice) {
    const map = new Map();
    (piatti || []).forEach(function (p) {
      const parte = parti(p && p.id, codice);
      if (!parte) return;
      const k = chiave(p && p.categoria);
      if (!map.has(parte.prefisso)) map.set(parte.prefisso, new Set());
      if (k) map.get(parte.prefisso).add(k);
    });
    return map;
  }

  function libero(map, prefisso, chiaveCat) {
    const set = map.get(prefisso);
    if (!set || !set.size) return true;
    return set.size === 1 && set.has(chiaveCat);
  }

  function prefissoNuovo(categoria, map) {
    const chiaveCat = chiave(categoria);
    const lettere = lettereCategoria(categoria);
    const piene = lettere.length >= 3 ? lettere : (lettere + "XXX").slice(0, 3);
    let n;
    for (n = 3; n <= piene.length; n++) {
      const c = piene.slice(0, n);
      if (libero(map, c, chiaveCat)) return c;
    }
    const radice = piene.slice(0, 3);
    for (n = 0; n < 26; n++) {
      const c = radice + String.fromCharCode(65 + n);
      if (libero(map, c, chiaveCat)) return c;
    }
    n = 2;
    while (!libero(map, radice + n, chiaveCat)) n += 1;
    return radice + String(n);
  }

  function prefissoCategoria(piatti, categoria, codice) {
    const chiaveCat = chiave(categoria);
    const map = occupati(piatti, codice);
    let scelto = "";
    let maxN = -1;
    (piatti || []).forEach(function (p) {
      if (chiave(p && p.categoria) !== chiaveCat) return;
      const parte = parti(p && p.id, codice);
      if (!parte) return;
      if (parte.n > maxN) {
        maxN = parte.n;
        scelto = parte.prefisso;
      }
    });
    if (scelto) return scelto;
    return prefissoNuovo(categoria, map);
  }

  function prossimoCodice(piatti, categoria, codice) {
    const norm = codice;
    const pref = prefissoCategoria(piatti, categoria, norm);
    let max = 0;
    (piatti || []).forEach(function (p) {
      const parte = parti(p && p.id, norm);
      if (parte && parte.prefisso === pref && parte.n > max) max = parte.n;
    });
    return pref + "-" + String(max + 1).padStart(3, "0");
  }

  function prefissiCategoria(lista, categoria, codice) {
    const chiaveCat = chiave(categoria);
    const set = [];
    (lista || []).forEach(function (p) {
      if (chiave(p && p.categoria) !== chiaveCat) return;
      const parte = parti(p && p.id, codice);
      if (!parte || set.indexOf(parte.prefisso) >= 0) return;
      set.push(parte.prefisso);
    });
    return set;
  }

  function prossimoNumero(lista, pref, codice) {
    let max = 0;
    (lista || []).forEach(function (p) {
      const parte = parti(p && p.id, codice);
      if (parte && parte.prefisso === pref && parte.n > max) max = parte.n;
    });
    return max + 1;
  }

  /* Un solo prefisso nella categoria: si continua quello, sul massimo di tutto
     il magazzino. Più prefissi (la dispensa ha FAR, OLI e LAT): se ne crea uno
     dalle lettere della categoria, senza rubare un codice già di un'altra. */
  function prossimoCodiceIngrediente(lista, categoria, codice) {
    const norm = codice;
    const trovati = prefissiCategoria(lista, categoria, norm);
    const pref = trovati.length === 1 ? trovati[0] : prefissoNuovo(categoria, occupati(lista, norm));
    return pref + "-" + String(prossimoNumero(lista, pref, norm)).padStart(3, "0");
  }

  function categorie(piatti, extra) {
    const visti = new Map();
    function aggiungi(nome) {
      const mostra = etichetta(nome);
      const k = chiave(mostra);
      if (!k || visti.has(k)) return;
      visti.set(k, mostra);
    }
    (piatti || []).forEach(function (p) { aggiungi(p && p.categoria); });
    (extra || []).forEach(aggiungi);
    return Array.from(visti.values()).sort(function (a, b) { return a.localeCompare(b, "it"); });
  }

  return {
    lettereCategoria: lettereCategoria,
    prossimoCodice: prossimoCodice,
    prossimoCodiceIngrediente: prossimoCodiceIngrediente,
    categorie: categorie,
  };
});
