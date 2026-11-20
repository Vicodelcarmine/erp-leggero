const test = require("node:test");
const assert = require("node:assert/strict");
const conteggio = require("../js/conteggio");

test("gli articoli della categoria vanno in ordine alfabetico", function () {
  const ordinati = conteggio.ordinaAlfabeto([
    { nome: "Pelati", id: "LAT-009" },
    { nome: "farina 00", id: "FAR-001" },
    { nome: "Olio EVO", id: "OLI-001" },
  ]);
  assert.deepEqual(ordinati.map(function (a) { return a.nome; }), ["farina 00", "Olio EVO", "Pelati"]);
});

test("prima delle 23:59 il conteggio resta in sospeso", function () {
  const sospeso = { giorno: "2026-11-15", righe: [{ id: "LAT-009", reale: 6 }] };
  assert.equal(conteggio.chiusura(sospeso, new Date(2026, 10, 15, 23, 58, 59)), null);
});

test("alle 23:59 chiude solo i contati, con la data di quel giorno", function () {
  const sospeso = {
    giorno: "2026-11-15",
    righe: [{ id: "lat-009", reale: 6 }],
  };
  const piano = conteggio.chiusura(sospeso, new Date(2026, 10, 15, 23, 59, 0));
  assert.equal(piano.at, "2026-11-15T23:59:00");
  assert.deepEqual(piano.righe, [{ id: "LAT-009", reale: 6 }]);
});

test("se l'app si riapre dopo, la chiusura usa le 23:59 del giorno del conteggio", function () {
  const sospeso = { giorno: "2026-11-15", righe: [{ id: "LAT-009", reale: 4 }] };
  const piano = conteggio.chiusura(sospeso, new Date(2026, 10, 16, 8, 12, 0));
  assert.equal(piano.giorno, "2026-11-15");
  assert.equal(piano.at, "2026-11-15T23:59:00");
  assert.equal(piano.righe.length, 1);
  assert.equal(piano.righe[0].id, "LAT-009");
});

test("un secondo numero sullo stesso articolo sostituisce il primo", function () {
  const primo = conteggio.segna(null, "2026-11-15", "LAT-009", 6);
  const secondo = conteggio.segna(primo, "2026-11-15", "lat-009", 4.5);
  assert.equal(secondo.righe.length, 1);
  assert.equal(secondo.righe[0].reale, 4.5);
  assert.equal(conteggio.chiusura(secondo, new Date(2026, 10, 15, 21, 0, 0)), null);
});
