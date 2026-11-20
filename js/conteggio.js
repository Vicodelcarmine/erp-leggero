/* Conteggio del giorno: ordine alfabetico e chiusura alle 23:59.
   Non calcola giacenza né sfrido: tiene solo i numeri in sospeso. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ErpConteggio = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function vuoto() {
    return { giorno: "", righe: [] };
  }

  function normalizza(raw) {
    const base = vuoto();
    if (!raw || typeof raw !== "object") return base;
    const giorno = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.giorno || "")) ? String(raw.giorno) : "";
    const righe = [];
    const visti = {};
    (Array.isArray(raw.righe) ? raw.righe : []).forEach(function (r) {
      if (!r) return;
      const id = String(r.id || "").trim().toUpperCase();
      const reale = Number(r.reale);
      if (!id || !Number.isFinite(reale) || reale < 0) return;
      if (visti[id]) {
        const i = righe.findIndex(function (x) { return x.id === id; });
        if (i >= 0) righe[i].reale = reale;
        return;
      }
      visti[id] = true;
      righe.push({ id: id, reale: reale });
    });
    return { giorno: giorno, righe: righe };
  }

  function ordinaAlfabeto(lista) {
    return (lista || []).slice().sort(function (a, b) {
      return String(a && a.nome || "").localeCompare(String(b && b.nome || ""), "it", { sensitivity: "base" });
    });
  }

  function dataLocale(adesso) {
    const z = function (n) { return String(n).padStart(2, "0"); };
    return adesso.getFullYear() + "-" + z(adesso.getMonth() + 1) + "-" + z(adesso.getDate());
  }

  function istante(giorno, adesso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno) || !(adesso instanceof Date) || Number.isNaN(adesso.getTime())) return "";
    const oggi = dataLocale(adesso);
    if (giorno > oggi) return "";
    if (giorno < oggi) return giorno + "T23:59:00";
    if (adesso.getHours() === 23 && adesso.getMinutes() >= 59) return giorno + "T23:59:00";
    return "";
  }

  function chiusura(raw, adesso) {
    const s = normalizza(raw);
    if (!s.giorno) return null;
    const at = istante(s.giorno, adesso);
    if (!at) return null;
    return { giorno: s.giorno, at: at, righe: s.righe.slice() };
  }

  function millisecondiAllaChiusura(adesso) {
    if (!(adesso instanceof Date) || Number.isNaN(adesso.getTime())) return 0;
    const fine = new Date(adesso.getFullYear(), adesso.getMonth(), adesso.getDate(), 23, 59, 0, 0);
    const ms = fine.getTime() - adesso.getTime();
    return ms > 0 ? ms : 0;
  }

  function segna(raw, giorno, id, reale) {
    const s = normalizza(raw);
    const idc = String(id || "").trim().toUpperCase();
    const n = Number(reale);
    const stessoGiorno = s.giorno === giorno;
    const righe = stessoGiorno ? s.righe.filter(function (r) { return r.id !== idc; }) : [];
    if (idc && Number.isFinite(n) && n >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(String(giorno || ""))) {
      righe.push({ id: idc, reale: n });
    }
    return { giorno: /^\d{4}-\d{2}-\d{2}$/.test(String(giorno || "")) ? String(giorno) : "", righe: righe };
  }

  return {
    vuoto: vuoto,
    normalizza: normalizza,
    ordinaAlfabeto: ordinaAlfabeto,
    chiusura: chiusura,
    millisecondiAllaChiusura: millisecondiAllaChiusura,
    segna: segna,
  };
});
