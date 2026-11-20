/* I dati restano in questo browser (IndexedDB). Il backup è un file JSON. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ErpDb = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  const NOME = "erp-leggero";
  const CHIAVE = "stato";
  let memoria = null;
  let metroMemoria = null;
  let cassaMemoria = null;
  let avviso = "";

  function disponibile() {
    try {
      return typeof indexedDB !== "undefined" && indexedDB != null;
    } catch (e) {
      return false;
    }
  }

  function apri() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(NOME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error("IndexedDB")); };
    });
  }

  function leggi(db) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction("kv", "readonly");
      const q = tx.objectStore("kv").get(CHIAVE);
      q.onsuccess = function () { resolve(q.result || null); };
      q.onerror = function () { reject(q.error); };
    });
  }

  function scrivi(db, stato) {
    return metti(db, CHIAVE, stato);
  }

  function metti(db, chiave, valore) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction("kv", "readwrite");
      tx.objectStore("kv").put(valore, chiave);
      tx.oncomplete = function () { resolve(); };
      tx.onerror = function () { reject(tx.error); };
      tx.onabort = function () { reject(tx.error || new Error("salvataggio annullato")); };
    });
  }

  function leggiChiave(db, chiave) {
    return new Promise(function (resolve, reject) {
      const tx = db.transaction("kv", "readonly");
      const q = tx.objectStore("kv").get(chiave);
      q.onsuccess = function () { resolve(q.result || null); };
      q.onerror = function () { reject(q.error); };
    });
  }

  function metroVuoto() {
    return { caricate: [], mappa: {} };
  }

  function normalizzaMetro(raw) {
    if (!raw || typeof raw !== "object") return metroVuoto();
    return {
      caricate: Array.isArray(raw.caricate) ? raw.caricate : [],
      mappa: raw.mappa && typeof raw.mappa === "object" ? raw.mappa : {},
    };
  }

  async function carica() {
    avviso = "";
    if (!disponibile() || !root.ErpEngine) {
      memoria = root.ErpEngine ? root.ErpEngine.statoVuoto() : { ingredienti: [] };
      avviso = "Questo browser non conserva i dati: scarica spesso il backup.";
      return memoria;
    }
    try {
      const db = await apri();
      const salvato = await leggi(db);
      db.close();
      if (!salvato) return root.ErpEngine.statoVuoto();
      return root.ErpEngine.normalizzaStato(salvato);
    } catch (e) {
      memoria = root.ErpEngine.statoVuoto();
      avviso = "Non riesco a riaprire i dati salvati. Scarica un backup prima di continuare.";
      return memoria;
    }
  }

  async function salva(stato) {
    if (memoria) {
      memoria = stato;
      return;
    }
    const db = await apri();
    await scrivi(db, stato);
    db.close();
  }

  function messaggio() {
    return avviso;
  }

  async function caricaMetro() {
    if (memoria) {
      metroMemoria = metroMemoria || metroVuoto();
      return metroMemoria;
    }
    try {
      const db = await apri();
      const salvato = await leggiChiave(db, "metro");
      db.close();
      return normalizzaMetro(salvato);
    } catch (e) {
      metroMemoria = metroVuoto();
      return metroMemoria;
    }
  }

  async function salvaMetro(extra) {
    const pulito = normalizzaMetro(extra);
    if (memoria || metroMemoria) {
      metroMemoria = pulito;
      return;
    }
    const db = await apri();
    await metti(db, "metro", pulito);
    db.close();
  }

  function cassaVuoto() {
    return { id: [] };
  }

  function normalizzaCassa(raw) {
    if (!raw || typeof raw !== "object") return cassaVuoto();
    return { id: Array.isArray(raw.id) ? raw.id.map(String) : [] };
  }

  async function caricaCassa() {
    if (memoria) {
      cassaMemoria = cassaMemoria || cassaVuoto();
      return cassaMemoria;
    }
    try {
      const db = await apri();
      const salvato = await leggiChiave(db, "cassa");
      db.close();
      return normalizzaCassa(salvato);
    } catch (e) {
      cassaMemoria = cassaVuoto();
      return cassaMemoria;
    }
  }

  async function salvaCassa(extra) {
    const pulito = normalizzaCassa(extra);
    if (memoria || cassaMemoria) {
      cassaMemoria = pulito;
      return;
    }
    const db = await apri();
    await metti(db, "cassa", pulito);
    db.close();
  }

  let mailMemoria = null;

  function mailVuoto() {
    return { id: [] };
  }

  function normalizzaMail(raw) {
    if (!raw || typeof raw !== "object") return mailVuoto();
    return { id: Array.isArray(raw.id) ? raw.id.map(String) : [] };
  }

  async function caricaMail() {
    if (memoria) {
      mailMemoria = mailMemoria || mailVuoto();
      return mailMemoria;
    }
    try {
      const db = await apri();
      const salvato = await leggiChiave(db, "fatture-mail");
      db.close();
      return normalizzaMail(salvato);
    } catch (e) {
      mailMemoria = mailVuoto();
      return mailMemoria;
    }
  }

  async function salvaMail(extra) {
    const pulito = normalizzaMail(extra);
    if (memoria || mailMemoria) {
      mailMemoria = pulito;
      return;
    }
    const db = await apri();
    await metti(db, "fatture-mail", pulito);
    db.close();
  }

  return {
    carica: carica,
    salva: salva,
    messaggio: messaggio,
    caricaMetro: caricaMetro,
    salvaMetro: salvaMetro,
    caricaCassa: caricaCassa,
    salvaCassa: salvaCassa,
    caricaMail: caricaMail,
    salvaMail: salvaMail,
  };
});
