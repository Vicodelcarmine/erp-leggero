/* Anagrafica dei codici letti in fattura.
   Un EAN (8, 12, 13 o 14 cifre) punta a un solo id_master, da qualunque fornitore.
   Il codice articolo Metro (per esempio 105872) non è un EAN: resta un codice di quel fornitore.
   Non calcola giacenza né sfrido. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ErpCodici = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function cifre(valore) {
    return String(valore || "").replace(/\D/g, "");
  }

  function eEan(valore) {
    const c = cifre(valore);
    return c.length === 8 || c.length === 12 || c.length === 13 || c.length === 14;
  }

  function codiceMetro(valore) {
    const t = String(valore || "").trim();
    const m = /^(\d{5,6})\.\d$/.exec(t);
    return m ? m[1] : t;
  }

  function fornitoreDi(nome) {
    return String(nome || "").trim().replace(/\s+/g, " ");
  }

  function chiaveFornitore(nome) {
    return fornitoreDi(nome).toLocaleLowerCase("it");
  }

  function normalizzaRecord(raw) {
    if (!raw || typeof raw !== "object") return null;
    const id = String(raw.id || raw.id_master || raw.idMaster || "").trim().toUpperCase();
    if (!id) return null;
    let tipo = raw.tipo === "ean" || raw.tipo === "fornitore" ? raw.tipo : "";
    const grezzo = raw.codice || raw.ean || raw.gtin || raw.codice_articolo || "";
    if (raw.tipo === "prova") {
      const codice = String(grezzo || "").trim().toUpperCase();
      if (!codice) return null;
      return { codice: codice, tipo: "prova", fornitore: "", id: id, prova: true };
    }
    if (!tipo) tipo = eEan(grezzo) ? "ean" : "fornitore";
    if (tipo === "ean" || eEan(grezzo)) {
      const codice = cifre(grezzo);
      if (!eEan(codice)) return null;
      return { codice: codice, tipo: "ean", fornitore: "", id: id };
    }
    const codice = codiceMetro(grezzo);
    const fornitore = fornitoreDi(raw.fornitore);
    if (!codice || !fornitore) return null;
    return { codice: codice, tipo: "fornitore", fornitore: fornitore, id: id };
  }

  function chiave(rec) {
    if (!rec) return "";
    if (rec.tipo === "ean") return "ean|" + rec.codice;
    if (rec.tipo === "prova") return "prova|" + rec.codice;
    return "fornitore|" + chiaveFornitore(rec.fornitore) + "|" + rec.codice;
  }

  function normalizzaLista(codici) {
    const visti = {};
    const out = [];
    (Array.isArray(codici) ? codici : []).forEach(function (raw) {
      const rec = normalizzaRecord(raw);
      if (!rec) return;
      const k = chiave(rec);
      if (visti[k] != null) {
        out[visti[k]] = rec;
        return;
      }
      visti[k] = out.length;
      out.push(rec);
    });
    return out;
  }

  function registra(codici, input) {
    const rec = normalizzaRecord(input);
    const lista = normalizzaLista(codici);
    if (!rec) return lista;
    const k = chiave(rec);
    const i = lista.findIndex(function (r) { return chiave(r) === k; });
    if (i >= 0) lista[i] = rec;
    else lista.push(rec);
    return lista;
  }

  function idDi(lista, tipo, codice, fornitore) {
    const k = tipo === "ean"
      ? "ean|" + codice
      : (tipo === "prova" ? "prova|" + String(codice || "").toUpperCase() : "fornitore|" + chiaveFornitore(fornitore) + "|" + codice);
    const rec = lista.find(function (r) { return chiave(r) === k; });
    return rec ? rec.id : "";
  }

  function trova(codici, input) {
    const lista = normalizzaLista(codici);
    const chiesto = input || {};
    const ean = cifre(chiesto.ean || chiesto.gtin || "");
    if (eEan(ean)) {
      const id = idDi(lista, "ean", ean, "");
      if (id) return { id: id, fonte: "ean" };
    }
    const codice = codiceMetro(chiesto.codice || "");
    const fornitore = fornitoreDi(chiesto.fornitore);
    if (eEan(codice)) {
      const id = idDi(lista, "ean", cifre(codice), "");
      if (id) return { id: id, fonte: "ean" };
    }
    if (codice && fornitore && !eEan(codice)) {
      const id = idDi(lista, "fornitore", codice, fornitore);
      if (id) return { id: id, fonte: "fornitore" };
    }
    const provaCod = String(chiesto.codice || "").trim().toUpperCase();
    if (provaCod) {
      const id = idDi(lista, "prova", provaCod, "");
      if (id) return { id: id, fonte: "prova" };
    }
    return { id: "", fonte: "" };
  }

  function assorbiMappaMetro(codici, mappa) {
    let lista = normalizzaLista(codici);
    const sorgente = mappa && typeof mappa === "object" ? mappa : {};
    Object.keys(sorgente).forEach(function (cod) {
      const gia = trova(lista, { codice: cod, fornitore: "Metro" });
      if (gia.id) return;
      lista = registra(lista, { codice: cod, tipo: "fornitore", fornitore: "Metro", id: sorgente[cod] });
    });
    return lista;
  }

  function togliProva(codici) {
    return normalizzaLista(codici).filter(function (r) { return r.tipo !== "prova"; });
  }

  /* Codice da scrivere sulla lista di quel fornitore.
     Prima il codice marcato suo; se non c'è, l'EAN del prodotto (vale per chiunque).
     Il codice di un altro fornitore e il codice di prova non si usano. */
  function codicePerFornitore(codici, idMaster, fornitore) {
    const lista = normalizzaLista(codici);
    const id = String(idMaster || "").trim().toUpperCase();
    const suo = chiaveFornitore(fornitore);
    if (!id) return { codice: "", fonte: "" };
    let delFornitore = "";
    let ean = "";
    lista.forEach(function (r) {
      if (r.id !== id || r.tipo === "prova") return;
      if (r.tipo === "fornitore" && suo && chiaveFornitore(r.fornitore) === suo) delFornitore = r.codice;
      if (r.tipo === "ean") ean = r.codice;
    });
    if (delFornitore) return { codice: delFornitore, fonte: "fornitore" };
    if (ean) return { codice: ean, fonte: "ean" };
    return { codice: "", fonte: "" };
  }

  return {
    eEan: eEan,
    normalizzaLista: normalizzaLista,
    registra: registra,
    trova: trova,
    assorbiMappaMetro: assorbiMappaMetro,
    togliProva: togliProva,
    codicePerFornitore: codicePerFornitore,
  };
});
