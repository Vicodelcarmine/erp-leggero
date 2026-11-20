const test = require("node:test");
const assert = require("node:assert/strict");
const unita = require("../js/unita_qta");

test("30 kg restano 30 kg, 30000 g diventano 30 kg", function () {
  assert.deepEqual(unita.scelte("kg"), ["g", "kg"]);
  assert.equal(unita.converti("30", "kg", "kg").valore, 30);
  assert.equal(unita.converti("30,5", "kg", "kg").valore, 30.5);
  assert.equal(unita.converti("30000", "g", "kg").valore, 30);
  assert.ok(Math.abs(unita.converti("145", "g", "kg").valore - 0.145) < 1e-9);
});

test("75 cl diventano 0,75 L e i litri restano litri", function () {
  assert.deepEqual(unita.scelte("L"), ["L", "cl"]);
  assert.equal(unita.converti("75", "cl", "L").valore, 0.75);
  assert.equal(unita.converti("1,5", "L", "L").valore, 1.5);
});

test("un prodotto nuovo prende l'unità dal formato, senza un master già deciso", function () {
  assert.deepEqual(unita.daScelta("15", "kg"), { valore: 15, udm: "kg" });
  assert.deepEqual(unita.daScelta("500", "g"), { valore: 0.5, udm: "kg" });
  assert.deepEqual(unita.daScelta("5", "L"), { valore: 5, udm: "L" });
  assert.deepEqual(unita.daScelta("75", "cl"), { valore: 0.75, udm: "L" });
  assert.deepEqual(unita.daScelta("6", "PZ"), { valore: 6, udm: "pz" });
  assert.equal(unita.daScelta("15", "").errore, "Scegli l'unità.");
  assert.equal(unita.udmDi("cl"), "L");
});

test("i pezzi sono interi e un'unità di un'altra famiglia non passa", function () {
  assert.deepEqual(unita.scelte("pz"), ["PZ"]);
  assert.equal(unita.converti("6", "PZ", "pz").valore, 6);
  assert.equal(unita.converti("1,5", "PZ", "pz").errore, "I pezzi sono interi.");
  assert.equal(unita.converti("30", "L", "kg").errore, "Scegli l'unità.");
  assert.equal(unita.converti("30", "", "kg").errore, "Scegli l'unità.");
});
