/* Conversione della quantità digitata nell'unità del master.
   g → kg, cl → L. kg, L e PZ restano com'è. Il motore non viene toccato. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ErpUnita = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function master(udm) {
    if (udm === "L" || udm === "pz") return udm;
    return "kg";
  }

  function scelte(udm) {
    const m = master(udm);
    if (m === "L") return ["L", "cl"];
    if (m === "pz") return ["PZ"];
    return ["g", "kg"];
  }

  function leggi(raw) {
    const s = String(raw == null ? "" : raw).trim().replace(/\s/g, "").replace(",", ".");
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  function converti(raw, unita, udm) {
    if (scelte(udm).indexOf(unita) < 0) return { errore: "Scegli l'unità." };
    const n = leggi(raw);
    if (n == null) return { errore: "Scrivi solo numeri." };
    if (!(n > 0)) return { errore: "La quantità deve essere maggiore di zero." };
    if (unita === "g") return { valore: n / 1000 };
    if (unita === "cl") return { valore: n / 100 };
    if (unita === "PZ") {
      if (Math.abs(n - Math.round(n)) > 1e-9) return { errore: "I pezzi sono interi." };
      return { valore: Math.round(n) };
    }
    return { valore: n };
  }

  function testo(valoreMaster, unita) {
    const n = Number(valoreMaster);
    if (!Number.isFinite(n)) return "";
    let x = n;
    if (unita === "g") x = n * 1000;
    else if (unita === "cl") x = n * 100;
    else if (unita === "PZ") x = Math.round(n);
    if (unita === "g" || unita === "PZ") {
      const tondo = Math.round(x);
      return Math.abs(x - tondo) < 1e-6 ? String(tondo) : String(x).replace(".", ",");
    }
    return String(Math.round(x * 1000) / 1000).replace(".", ",");
  }

  function udmDi(unita) {
    if (unita === "L" || unita === "cl") return "L";
    if (unita === "PZ") return "pz";
    if (unita === "g" || unita === "kg") return "kg";
    return "";
  }

  function daScelta(raw, unita) {
    const udm = udmDi(unita);
    if (!udm) return { errore: "Scegli l'unità." };
    const esito = converti(raw, unita, udm);
    if (esito.errore) return esito;
    return { valore: esito.valore, udm: udm };
  }

  return { master: master, scelte: scelte, converti: converti, testo: testo, udmDi: udmDi, daScelta: daScelta };
});
