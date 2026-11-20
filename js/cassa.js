/* Anteprima cassa: pezzi venduti × quantità di ricetta.
   Stesso prodotto di consumoTeorico in engine.js (niente sfrido).
   La giacenza food lo usa così: conteggio + carichi − questo consumo.
   Gli articoli TEMPO non escono con la cassa: la loro giacenza
   segue i conteggi, non le vendite (giacenzaIngrediente). */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ErpCassa = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function codice(id) {
    return String(id || "").trim().toUpperCase();
  }

  function tondo(n) {
    return Math.round((Number(n) || 0) * 1e6) / 1e6;
  }

  function anteprima(stato, pezzi) {
    const s = stato || {};
    const piatti = [];
    const somma = new Map();
    (pezzi || []).forEach(function (p) {
      const id = codice(p.idPiatto);
      const qta = Number(p.quantita) || 0;
      if (!id || !(qta > 0)) return;
      const piatto = (s.piatti || []).find(function (x) { return codice(x.id) === id; });
      const ricetta = (s.ricette || []).filter(function (r) { return codice(r.idPiatto) === id; });
      const righe = ricetta.map(function (r) {
        const idIng = codice(r.idIngrediente);
        const ing = (s.ingredienti || []).find(function (i) { return codice(i.id) === idIng; });
        const tempo = !!(ing && ing.tipo === "TEMPO");
        const qtaRiga = tondo(qta * (Number(r.quantita) || 0));
        if (!tempo && qtaRiga > 0) {
          const gia = somma.get(idIng);
          if (gia) gia.qta = tondo(gia.qta + qtaRiga);
          else somma.set(idIng, {
            id: idIng,
            nome: ing ? ing.nome : idIng,
            udm: ing ? (ing.udm || "") : "",
            qta: qtaRiga,
          });
        }
        return {
          id: idIng,
          nome: ing ? ing.nome : idIng,
          udm: ing ? (ing.udm || "") : "",
          qtaRicetta: Number(r.quantita) || 0,
          qta: qtaRiga,
          tempo: tempo,
        };
      });
      piatti.push({
        id: id,
        nome: piatto ? piatto.nome : id,
        quantita: qta,
        vuoto: righe.length === 0,
        righe: righe,
      });
    });
    return {
      piatti: piatti,
      ingredienti: Array.from(somma.values()),
    };
  }

  function dataDalNome(nome) {
    const m = /\bdel\s+(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/i.exec(String(nome || ""));
    if (!m) return "";
    const d = Number(m[1]);
    const mo = Number(m[2]);
    const y = Number(m[3]);
    if (d < 1 || d > 31 || mo < 1 || mo > 12) return "";
    const z = function (n) { return String(n).padStart(2, "0"); };
    return y + "-" + z(mo) + "-" + z(d);
  }

  function chiaveRiga(fileId, codice) {
    const f = String(fileId || "").trim();
    const c = String(codice || "").trim();
    if (!f || !c) return "";
    return f + "|" + c;
  }

  return { anteprima: anteprima, dataDalNome: dataDalNome, chiaveRiga: chiaveRiga };
});
