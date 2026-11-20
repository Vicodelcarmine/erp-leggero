const test = require("node:test");
const assert = require("node:assert/strict");
const sync = require("../js/archivio_sync");

function base() {
  return {
    versione: 1,
    demo: false,
    scelta: true,
    impostazioni: { nomeLocale: "Pizzeria", giorniCopertura: 7, giorniStorico: 30, sogliaAllerta: 0.1 },
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
  };
}

test("due telefoni aggiungono righe diverse: restano entrambe", function () {
  const sala = base();
  sala.vendite.push({ id: "ven-sala", idPiatto: "PIZ-001", quantita: 10, at: "2026-11-19T21:00:00" });
  const cucina = base();
  cucina.carichi.push({ id: "car-cucina", idIngrediente: "BAR-001", quantita: 15, at: "2026-11-19T18:00:00" });
  const sulServer = sync.daRighe([
    { collezione: "vendite", id: "ven-sala", corpo: sala.vendite[0] },
  ]);
  const esito = sync.unisci(cucina, sulServer, {});
  const vendite = esito.stato.vendite.map(function (v) { return v.id; }).sort();
  const carichi = esito.stato.carichi.map(function (c) { return c.id; });
  assert.deepEqual(vendite, ["ven-sala"]);
  assert.deepEqual(carichi, ["car-cucina"]);
  assert.equal(esito.invia.some(function (r) { return r.id === "car-cucina"; }), true);
  assert.equal(esito.togli.length, 0);
});

test("due conteggi della stessa riga: resta l'ora più recente e nasce una nota", function () {
  const locale = base();
  locale.inventari.push({ id: "inv-1", idIngrediente: "BAR-001", reale: 6, at: "2026-11-19T10:00:00" });
  const remoto = base();
  remoto._haImpostazioni = true;
  remoto.inventari.push({ id: "inv-1", idIngrediente: "BAR-001", reale: 4, at: "2026-11-19T18:00:00" });
  const firmaVecchia = sync.canon({ id: "inv-1", idIngrediente: "BAR-001", reale: 8, at: "2026-11-18T10:00:00" });
  const esito = sync.unisci(locale, remoto, { "inventari|inv-1": firmaVecchia });
  assert.equal(esito.stato.inventari.length, 1);
  assert.equal(esito.stato.inventari[0].reale, 4);
  assert.equal(esito.stato.note.length, 1);
  assert.equal(esito.stato.note[0].tenutoReale, 4);
  assert.equal(esito.stato.note[0].altroReale, 6);
  assert.equal(esito.invia.some(function (r) { return r.collezione === "inventari"; }), false);
});

test("un conteggio cancellato sull'altro telefono, e qui non toccato, si toglie", function () {
  const locale = base();
  const inv = { id: "inv-2", idIngrediente: "BAR-001", reale: 6, at: "2026-11-19T10:00:00" };
  locale.inventari.push(inv);
  const remoto = base();
  remoto._haImpostazioni = true;
  const esito = sync.unisci(locale, remoto, { "inventari|inv-2": sync.canon(inv) });
  assert.equal(esito.stato.inventari.length, 0);
  assert.equal(esito.togli.length, 1);
  assert.equal(esito.togli[0].id, "inv-2");
});

test("la ricetta si riconosce da piatto e ingrediente", function () {
  const a = { idPiatto: "piz-001", idIngrediente: "bar-001", quantita: 0.145 };
  const b = { quantita: 0.145, idIngrediente: "BAR-001", idPiatto: "PIZ-001" };
  assert.equal(sync.idDi("ricette", a), "PIZ-001|BAR-001");
  assert.equal(sync.idDi("ricette", a), sync.idDi("ricette", b));
  const locale = base();
  locale.ricette.push(a);
  const remoto = base();
  remoto._haImpostazioni = true;
  remoto.ricette.push(b);
  const esito = sync.unisci(locale, remoto, {});
  assert.equal(esito.stato.ricette.length, 1);
});

test("legge anche le righe oltre le prime mille", async function () {
  const chiamate = [];
  const tutte = await sync.raccogli(async function (da, pagina) {
    chiamate.push(da + ":" + pagina);
    if (da === 0) return new Array(1000).fill({ id: "a" });
    if (da === 1000) return new Array(129).fill({ id: "b" });
    return [];
  });
  assert.deepEqual(chiamate, ["0:1000", "1000:1000"]);
  assert.equal(tutte.length, 1129);
});
