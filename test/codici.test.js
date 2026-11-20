const test = require("node:test");
const assert = require("node:assert/strict");
const codici = require("../js/codici");
const engine = require("../js/engine");

test("un codice noto restituisce l'id, uno ignoto va chiesto", function () {
  let lista = codici.registra([], { codice: "8001234567890", tipo: "ean", id: "OLI-001" });
  assert.deepEqual(codici.trova(lista, { ean: "8001234567890", fornitore: "Metro" }), { id: "OLI-001", fonte: "ean" });
  assert.deepEqual(codici.trova(lista, { ean: "8009999999999", fornitore: "Biancalani" }), { id: "", fonte: "" });
});

test("due EAN possono puntare allo stesso articolo, uno stesso EAN a un solo id", function () {
  let lista = codici.registra([], { codice: "8001111111111", tipo: "ean", id: "OLI-001" });
  lista = codici.registra(lista, { codice: "8002222222222", tipo: "ean", id: "OLI-001" });
  lista = codici.registra(lista, { codice: "8001111111111", tipo: "ean", fornitore: "Biancalani", id: "OLI-001" });
  assert.equal(codici.trova(lista, { ean: "8001111111111", fornitore: "Biancalani" }).id, "OLI-001");
  assert.equal(codici.trova(lista, { ean: "8002222222222", fornitore: "Metro" }).id, "OLI-001");
  assert.equal(lista.filter(function (r) { return r.codice === "8001111111111"; }).length, 1);
  lista = codici.registra(lista, { codice: "8001111111111", id: "ALT-009" });
  assert.equal(codici.trova(lista, { ean: "8001111111111" }).id, "ALT-009");
  assert.equal(lista.filter(function (r) { return r.codice === "8001111111111"; }).length, 1);
});

test("il 105872 dei pelati è un codice Metro, non un EAN", function () {
  assert.equal(codici.eEan("105872"), false);
  assert.equal(codici.eEan("105872.1"), false);
  let lista = codici.registra([], { codice: "105872.1", tipo: "fornitore", fornitore: "Metro", id: "LAT-009" });
  assert.equal(lista[0].tipo, "fornitore");
  assert.equal(lista[0].codice, "105872");
  assert.equal(lista[0].fornitore, "Metro");
  assert.equal(codici.trova(lista, { codice: "105872", fornitore: "Metro" }).id, "LAT-009");
  assert.equal(codici.trova(lista, { codice: "105872", fornitore: "Biancalani" }).id, "");
  lista = codici.registra(lista, { codice: "8001234567890", tipo: "ean", id: "OLI-001" });
  assert.equal(codici.trova(lista, { codice: "8001234567890", fornitore: "Metro" }).id, "OLI-001");
});

test("il backup dello stato custodisce i codici", function () {
  const stato = engine.normalizzaStato({
    ingredienti: [],
    codici: [
      { codice: "8001234567890", tipo: "ean", id: "OLI-001" },
      { codice: "105872", tipo: "fornitore", fornitore: "Metro", id: "LAT-009" },
    ],
  });
  assert.equal(stato.codici.length, 2);
  assert.equal(stato.codici[1].id, "LAT-009");
});

test("la lista spesa prende il codice di quel fornitore, non quello di un altro", function () {
  let lista = codici.registra([], { codice: "105872", tipo: "fornitore", fornitore: "Metro", id: "LAT-009" });
  assert.equal(codici.codicePerFornitore(lista, "LAT-009", "Biancalani").codice, "");
  assert.equal(codici.codicePerFornitore(lista, "LAT-009", "biancalani").fonte, "");
  assert.equal(codici.codicePerFornitore(lista, "LAT-009", "Metro").codice, "105872");
  lista = codici.registra(lista, { codice: "8001234567890", tipo: "ean", id: "LAT-009" });
  assert.equal(codici.codicePerFornitore(lista, "LAT-009", "Biancalani").codice, "8001234567890");
  assert.equal(codici.codicePerFornitore(lista, "LAT-009", "Biancalani").fonte, "ean");
  assert.equal(codici.codicePerFornitore(lista, "LAT-009", "Metro").codice, "105872");
  lista = codici.registra(lista, { codice: "B77", tipo: "fornitore", fornitore: "Biancalani", id: "LAT-009" });
  assert.equal(codici.codicePerFornitore(lista, "LAT-009", "Biancalani").codice, "B77");
  assert.equal(codici.codicePerFornitore([], "LAT-009", "Biancalani").codice, "");
  lista = codici.registra(lista, { codice: "PROVA-FARFALLINI", tipo: "prova", id: "OLI-001" });
  assert.equal(codici.codicePerFornitore(lista, "OLI-001", "Biancalani").codice, "");
});

test("il codice di prova si aggancia anche con un altro fornitore e si può togliere", function () {
  let lista = codici.registra([], { codice: "PROVA-FARFALLINI", tipo: "prova", id: "OLI-001" });
  assert.equal(codici.trova(lista, { codice: "PROVA-FARFALLINI", fornitore: "Biancalani" }).fonte, "prova");
  assert.equal(codici.trova(lista, { codice: "PROVA-FARFALLINI", fornitore: "Biancalani" }).id, "OLI-001");
  lista = codici.togliProva(lista);
  assert.equal(lista.length, 0);
  assert.equal(codici.trova(lista, { codice: "PROVA-FARFALLINI", fornitore: "Biancalani" }).id, "");
});
