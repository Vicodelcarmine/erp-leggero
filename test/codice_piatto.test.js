const test = require("node:test");
const assert = require("node:assert/strict");
const engine = require("../js/engine");
const codici = require("../js/codice_piatto");

const codice = engine.codice;

function pizza(n) {
  return { id: "PIZ-" + String(n).padStart(3, "0"), categoria: "Pizza", nome: "Piatto " + n };
}

test("il prossimo piatto Pizza, con PIZ-001…006, è PIZ-007", function () {
  const piatti = [1, 2, 3, 4, 5, 6].map(pizza);
  assert.equal(codici.prossimoCodice(piatti, "Pizza", codice), "PIZ-007");
});

test("il progressivo è il massimo presente più uno", function () {
  const piatti = [pizza(1), pizza(5)];
  assert.equal(codici.prossimoCodice(piatti, "Pizza", codice), "PIZ-006");
  piatti.push(pizza(6));
  assert.equal(codici.prossimoCodice(piatti, "Pizza", codice), "PIZ-007");
  assert.equal(codici.prossimoCodice([pizza(10)], "pizza", codice), "PIZ-011");
});

test("legge anche un id minuscolo tramite codice() del motore", function () {
  assert.equal(codici.prossimoCodice([{ id: "piz-006", categoria: "Pizza" }], "Pizza", codice), "PIZ-007");
});

test("Dolci nuova è DOL-001 e non tocca PIZ", function () {
  const piatti = [pizza(6)];
  assert.equal(codici.prossimoCodice(piatti, "Dolci", codice), "DOL-001");
  assert.equal(codici.prossimoCodice(piatti, "Pizza", codice), "PIZ-007");
});

test("il prodotto nuovo continua il prefisso unico, e la dispensa mista parte da DIS", function () {
  const ings = [
    { id: "FAR-001", categoria: "Dispensa" },
    { id: "OLI-001", categoria: "Dispensa" },
    { id: "LAT-009", categoria: "Dispensa" },
    { id: "LAT-003", categoria: "Latticini" },
    { id: "DET-001", categoria: "Pulizia" },
  ];
  assert.equal(codici.prossimoCodiceIngrediente(ings, "Dispensa", codice), "DIS-001");
  assert.equal(codici.prossimoCodiceIngrediente(ings, "Latticini", codice), "LAT-010");
  assert.equal(codici.prossimoCodiceIngrediente(ings, "Pulizia", codice), "DET-002");
  assert.equal(codici.prossimoCodiceIngrediente(ings, "Ortofrutta", codice), "ORT-001");
  ings.push({ id: "DIS-001", categoria: "Dispensa" });
  assert.equal(codici.prossimoCodiceIngrediente(ings, "Dispensa", codice), "DIS-002");
});

test("se le 3 lettere sono di un'altra categoria, allunga il prefisso", function () {
  const piatti = [{ id: "DOL-002", categoria: "Dolce al cucchiaio" }];
  assert.equal(codici.prossimoCodice(piatti, "Dolci", codice), "DOLC-001");
  assert.equal(codici.prossimoCodice(piatti, "Dolce al cucchiaio", codice), "DOL-003");
});
