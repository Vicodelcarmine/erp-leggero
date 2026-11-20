const test = require("node:test");
const assert = require("node:assert/strict");
const metro = require("../js/metro");
const demo = require("../js/demo");

const FATTURA = [
  "METRO Italia S.p.A. Depot Toscana",
  "Partita IVA:IT 02827030962",
  "Data Fattura: 29/05/2026",
  "Fattura 0/0(094)0194/039765",
  "Fattura Delivery",
  "278266.2 G400 FAGIOLI CANNELLINI ARO LA 0.000 0,790 1 0,79 24 18,96 C",
  "025232.0 G660 POMODORI SECCHI MC BA 0.000 4,390 1 4,39 1 4,39 C",
  "371742.8 G950FRIARIELLI O.S. MC CT 0.000 7,440 2 14,88 1 14,88 C",
  "060946.1 G720 FIL.ALICI PEZZI O.S. RIZZ CF 0.000 9,560 1 9,56 1 9,56 C",
  "170193.7 G80X3 TONNO NAT.CAPRI CF 0.000 2,990 8 23,92 1 23,92 C",
  "361918.6 L5 OLIO EVO UE PET 1P BT 0.000 26,690 1 26,69 1 26,69 B",
  "339414.5 KG25 FARINA 0 NUVOLA CF 0.000 31,990 1 31,99 2 63,98 B",
  "Sconto a valore unitario 4.00",
  "363749.3 KG1 ZUCCHERO SEMOLATO ARO 2 CF 10.000 1,290 10 12,90 1 12,90 C",
  "072188.6 G800 GOCCE CIOCC.FOND. MC CF 0.000 10,390 1 10,39 1 10,39 C",
  "373513.1 G.400 ORIGANO FOGLIE M.C. CF 0.000 10,190 1 10,19 1 10,19 E",
  "352369.3 KG1 FROLLINI DOL.COLAZ.JUNIOR CF 0.000 3,780 1 3,78 2 7,56 C",
  "368817.3 KG1.6 SAVOIARDI MC SC 0.000 9,990 1 9,99 1 9,99 C",
  "373781.4 50 CIALDE FORTE RIOBA CT 0.000 10,790 1 10,79 1 10,79 D",
  "373782.2 50 CIALDE DECAFFEINATO RIOBA CT 0.000 10,790 1 10,79 1 10,79 D",
  "375764.8 1/8 GRANA PAD. DOP SV AGRIFORM KG 10,490 5,160 54,13 1 54,13 B",
  "Sconto a valore unitario 5.04",
  "346717.2 KG1 PESTO S/AGLIO ARO SE 0.000 8,010 1 8,01 1 8,01 C",
  "157916.8 CL75 AGLIANICO BENEVE SOLOPACA BT 0.000 2,470 6 14,82 2 29,64 D",
  "369060.9 LT5 VINO ROSSO PET B.VIGNETO BT 0.000 5,740 1 5,74 2 11,48 D",
  "373244.3 BIB LT10 VINO BIANCO VALLEFIOR BG 0.000 13,500 1 13,50 2 27,00 D",
  "316830.9 KG 1,2 TORTA CAPRESE MC CF 0.000 17,320 1 17,32 1 17,32 C",
  "370895.5 G110X18 GATEAUX CIOCC FOND MC CF 0.000 22,010 1 22,01 1 22,01 C",
  "371588.5 KG2,5 SPINACI FOGLIE A CUBI MC CT 0.000 4,940 1 4,94 1 4,94 B",
  "363179.3 G750 MAZZ TR ECUA COD SG 41/50 BS 0.000 8,530 1 8,53 1 8,53 C",
  "Sconto 27.00%",
  "001595.8 CARRE AGN.HAL.NZ CONG KG 17,320 1,679 29,08 1 29,08 C",
  "032890.6 INS. ICEB. CAL9/11 CS MC(NL I) KG 1,770 7,811 13,83 1 13,83 B",
  "Sconto 6.00%",
  "069015.6 PANCETTA TESA T/AMBURGO 1/2 SV KG 9,350 1,310 12,25 1 12,25 C",
  "089353.7 1/2 VENTRICINA PICC.KG1,5CA SV KG 8,490 3,485 29,59 1 29,59 C",
  "Totale Imponibile 502,80",
].join("\n");

function riga(fattura, codice) {
  return fattura.righe.find(function (r) { return r.codice === codice; });
}

test("la fattura Metro 0194/039765 legge 27 righe e l'imponibile 502,80", function () {
  const f = metro.leggi(FATTURA);
  assert.equal(f.ok, true);
  assert.equal(f.fornitore, "Metro");
  assert.equal(f.numero, "0194/039765");
  assert.equal(f.data, "2026-05-29");
  assert.equal(f.imponibile, 502.8);
  const valide = f.righe.filter(function (r) { return !r.anomala; });
  assert.equal(valide.length, 27);
  assert.ok(Math.abs(f.sommaRighe - 502.8) < 0.02);

  const fagioli = riga(f, "278266");
  assert.equal(fagioli.descrizione.indexOf("FAGIOLI") >= 0, true);
  assert.equal(fagioli.qtaFattura, 24);
  assert.equal(fagioli.prezzo, 0.79);
  assert.ok(Math.abs(fagioli.qta - 9.6) < 1e-9);

  const grana = riga(f, "375764");
  assert.ok(Math.abs(grana.qtaFattura - 5.16) < 1e-9);
  assert.ok(Math.abs(grana.prezzo - 10.49) < 1e-9);
  assert.equal(grana.scontoValore, 5.04);

  const agnello = riga(f, "001595");
  assert.ok(Math.abs(agnello.qta - 1.679) < 1e-9);
  assert.ok(Math.abs(agnello.prezzo - 17.32) < 1e-9);

  const savoiardi = riga(f, "368817");
  assert.ok(savoiardi.descrizione.indexOf("KG1.6") >= 0);
  assert.equal(savoiardi.descrizione.indexOf("G1600"), -1);
});

test("farina e olio della stessa fattura: colli nell'unità del prodotto", function () {
  const f = metro.leggi(FATTURA);
  const stato = demo.statoEsempio("2026-11-09");
  const farina = riga(f, "339414");
  assert.equal(farina.colli, 2);
  assert.ok(Math.abs(farina.qta - 50) < 1e-9);
  assert.equal(farina.udm, "kg");
  assert.equal(farina.qtaConfezione, 25);
  assert.ok(Math.abs(farina.prezzoUdm - 63.98 / 50) < 1e-9);
  assert.equal(farina.scontoValore, 4);
  assert.equal(metro.scegliMaster(farina, stato.ingredienti, {}), "FAR-001");

  const olio = riga(f, "361918");
  assert.equal(olio.colli, 1);
  assert.ok(Math.abs(olio.qta - 5) < 1e-9);
  assert.equal(olio.udm, "L");
  assert.equal(olio.qtaConfezione, 5);
  assert.ok(Math.abs(olio.prezzoUdm - 26.69 / 5) < 1e-9);
  assert.equal(metro.scegliMaster(olio, stato.ingredienti, {}), "OLI-001");
  const effetto = metro.effettoCarico(olio, stato.ingredienti[3]);
  assert.equal(effetto.entra, true);
  assert.ok(Math.abs(effetto.qta - 5) < 1e-9);
});

test("pelati KG2,5: 6 barattoli in 1 collo sono 15 kg, non 90", function () {
  const testo = [
    "METRO ITALIA S.P.A. Depot Toscana",
    "P.IVA 02827030962",
    "Fattura Delivery",
    "Fattura 0002/014654 del 03/06/2026",
    "105872.1 KG2.5 POMOD.PEL. ROSSO GARGANO VC 0,000 3,750 6 22,50 1 22,50 B",
    "Totale Imponibile 22,50",
  ].join("\n");
  const f = metro.leggi(testo);
  const pelati = f.righe[0];
  assert.equal(pelati.colli, 1);
  assert.equal(pelati.qtaFattura, 6);
  assert.ok(Math.abs(pelati.qta - 15) < 1e-9);
  assert.equal(pelati.udm, "kg");
  assert.equal(pelati.qtaConfezione, 15);
  assert.ok(Math.abs(pelati.prezzoUdm - 1.5) < 1e-9);
  const stato = demo.statoEsempio("2026-11-09");
  assert.equal(metro.scegliMaster(pelati, stato.ingredienti, {}), "LAT-009");
  const master = stato.ingredienti[0];
  const effetto = metro.effettoCarico(pelati, master);
  assert.equal(effetto.entra, true);
  assert.equal(effetto.qta, 15);
  assert.equal(effetto.udm, "kg");
});

test("il prezzo 14,02 della mozzarella KG2 non diventa 14,02 kg", function () {
  const testo = [
    "METRO ITALIA Depot Toscana P.IVA 02827030962",
    "Fattura Delivery",
    "Fattura 0007/002265 del 03/07/2026",
    "8026924073458 KG2 MOZZ FIORDILATTE 100G MC VC 14,020 1 14,02 1 14,02 B",
    "Totale Imponibile 14,02",
  ].join("\n");
  const f = metro.leggi(testo);
  const r = f.righe[0];
  assert.equal(r.anomala, false);
  assert.ok(Math.abs(r.qta - 2) < 1e-9, "qta " + r.qta);
  assert.equal(r.udm, "kg");
  assert.ok(Math.abs(r.prezzoUdm - 7.01) < 1e-9);
  const stato = demo.statoEsempio("2026-11-09");
  assert.equal(metro.scegliMaster(r, stato.ingredienti, {}), "LAT-003");
});

test("la ricotta pesata 2,700 kg resta un peso, non un collo da 1", function () {
  const testo = [
    "METRO ITALIA Depot Toscana P.IVA 02827030962",
    "Fattura Delivery",
    "Fattura 1/1 del 27/06/2026",
    "8026924066801 KG1,3 RICOTTA FRESCA MC CF 2,700 1 2,70 1 2,70 B",
    "Totale Imponibile 2,70",
  ].join("\n");
  const f = metro.leggi(testo);
  const r = f.righe[0];
  assert.ok(Math.abs(r.qta - 2.7) < 1e-9);
  assert.ok(Math.abs(r.prezzoUdm - 1) < 1e-9);
});

test("il GTIN è un codice a barre distinto dal codice articolo Metro", function () {
  const testo = [
    "METRO ITALIA S.P.A. Depot Toscana",
    "P.IVA 02827030962",
    "Fattura Delivery",
    "Fattura 0002/014654 del 03/06/2026",
    "105872.1 KG2.5 POMOD.PEL. ROSSO GARGANO VC 0,000 3,750 6 22,50 1 22,50 B",
    "GTIN: 8001440574375",
    "Totale Imponibile 22,50",
  ].join("\n");
  const pelati = metro.leggi(testo).righe[0];
  assert.equal(pelati.codice, "105872");
  assert.equal(pelati.gtin, "8001440574375");
  assert.equal(pelati.qta, 15);
});

test("un PDF che non è Metro non inventa righe", function () {
  const f = metro.leggi("BIANCALANI\nFattura 01/0000400\nKG25 FARINA 10 1,10 11,00\n");
  assert.equal(f.ok, false);
  assert.equal(f.righe.length, 0);
  assert.match(f.errore, /non è una fattura Metro/);
});

test("la stessa fattura non si ricarica", function () {
  const elenco = [{ numero: "0194/039765", impronta: "10-abc", fornitore: "metro" }];
  assert.equal(metro.giaCaricata(elenco, { numero: "0194/039765", impronta: "altro" }), true);
  assert.equal(metro.giaCaricata(elenco, { numero: "", impronta: "10-abc" }), true);
  assert.equal(metro.giaCaricata(elenco, { numero: "0001/000001", impronta: "no" }), false);
});
