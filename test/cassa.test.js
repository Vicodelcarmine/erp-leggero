const test = require("node:test");
const assert = require("node:assert/strict");
const demo = require("../js/demo");
const engine = require("../js/engine");
const azioni = require("../js/azioni");
const cassa = require("../js/cassa");

const OGGI = "2026-11-12";

test("10 Margherite: 1,45 kg di pelati, senza sfrido e senza detersivo", function () {
  const stato = demo.statoEsempio(OGGI);
  const prima = engine.giacenzaIngrediente(stato, "LAT-009", OGGI);
  const a = cassa.anteprima(stato, [{ idPiatto: "PIZ-001", quantita: 10 }]);
  assert.equal(engine.giacenzaIngrediente(stato, "LAT-009", OGGI), prima);

  assert.equal(a.piatti.length, 1);
  assert.equal(a.piatti[0].vuoto, false);
  const per = function (id) {
    return a.ingredienti.find(function (r) { return r.id === id; });
  };
  assert.equal(per("LAT-009").qta, 1.45);
  assert.equal(per("LAT-009").udm, "kg");
  assert.equal(per("LAT-003").qta, 1.25);
  assert.equal(per("FAR-001").qta, 1.8);
  assert.equal(per("OLI-001").qta, 0.1);
  assert.equal(per("OLI-001").udm, "L");
  assert.equal(per("DET-001"), undefined);

  const pelati = a.piatti[0].righe.find(function (r) { return r.id === "LAT-009"; });
  assert.equal(pelati.qtaRicetta, 0.145);
  assert.equal(pelati.tempo, false);

  const copia = demo.statoEsempio(OGGI);
  const primaG = engine.giacenzaIngrediente(copia, "LAT-009", OGGI);
  const esito = azioni.registraVendita(copia, { idPiatto: "PIZ-001", quantita: 10, at: OGGI + "T18:00:00" });
  assert.equal(esito.ok, true);
  const dopoG = engine.giacenzaIngrediente(copia, "LAT-009", OGGI);
  assert.ok(Math.abs(primaG - dopoG - 1.45) < 1e-6);
});

test("un piatto senza ricetta non consuma nulla", function () {
  const stato = demo.statoEsempio(OGGI);
  stato.piatti.push({ id: "PIZ-099", nome: "Acqua", categoria: "Bar", prezzoListino: 1 });
  const a = cassa.anteprima(stato, [{ idPiatto: "PIZ-099", quantita: 4 }]);
  assert.equal(a.piatti[0].vuoto, true);
  assert.equal(a.piatti[0].righe.length, 0);
  assert.equal(a.ingredienti.length, 0);
});

test("la data si legge dal nome del foglio Drive, come sul Mac", function () {
  assert.equal(cassa.dataDalNome("STAMPA ARTICOLI del 11-11-2026 23.35.26"), "2026-11-11");
  assert.equal(cassa.chiaveRiga("abc", "18"), "abc|18");
  assert.equal(cassa.chiaveRiga("abc", ""), "");
});

test("il detersivo in ricetta non esce con la cassa", function () {
  const stato = demo.statoEsempio(OGGI);
  stato.ricette.push({ idPiatto: "PIZ-001", idIngrediente: "DET-001", quantita: 0.02 });
  const a = cassa.anteprima(stato, [{ idPiatto: "PIZ-001", quantita: 10 }]);
  const det = a.piatti[0].righe.find(function (r) { return r.id === "DET-001"; });
  assert.equal(det.tempo, true);
  assert.equal(det.qta, 0.2);
  assert.equal(a.ingredienti.find(function (r) { return r.id === "DET-001"; }), undefined);
  assert.equal(a.ingredienti.find(function (r) { return r.id === "LAT-009"; }).qta, 1.45);
});
