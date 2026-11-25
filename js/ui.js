/* Interfaccia. I conti stanno in engine.js: qui si scrive e si legge. */
(function () {
  "use strict";

  const NOMI = ["oggi", "conteggio", "giacenza", "spesa", "menu", "magazzino", "ricette", "fattura", "preventivi", "cassa", "food", "dati"];
  const BARRA = [
    ["conteggio", "Conteggio"],
    ["giacenza", "Giacenza"],
    ["spesa", "Spesa"],
    ["menu", "Menu"],
  ];
  const TITOLI = {
    oggi: "Oggi",
    conteggio: "Conteggio",
    giacenza: "Giacenza",
    spesa: "Spesa",
    menu: "Menu",
    magazzino: "Magazzino",
    ricette: "Ricette",
    fattura: "Fattura",
    preventivi: "Preventivi",
    cassa: "Cassa",
    food: "Food cost",
    dati: "Dati",
  };

  let stato = null;
  let spesaPerMe = false;
  let metroExtra = { caricate: [], mappa: {} };
  let bozzaFattura = null;
  let bozzaMano = null;
  let caricoAperto = null;
  let preventiviCaricati = false;
  let preventiviServer = [];
  let linkAppenaCreato = null;
  let basePreventivi = "";
  let copiaAvviso = "";
  let copiaAvvisoUrl = "";
  let preventiviVisti = {};
  let primaLetturaPreventivi = true;
  let categoriePreventivo = {};
  let sceltaCatPiatto = null;
  let sceltaCatIng = null;
  let modificaIng = null;
  let cassaExtra = { id: [] };
  let cassaVista = null;
  let cassaInCorso = false;
  let mailVisti = { id: [] };
  let mailVista = null;
  let mailInCorso = false;
  let mailSeq = 0;
  let menuFattura = null;
  let ritornoNuovo = null;
  let pendingScrollRiga = null;
  let scrollDaTenere = null;
  let mesiAperti = null;
  const gruppiAperti = {};
  let giorniAperti = {};
  let vociAperte = {};
  let banner = "";
  let bannerErrore = false;
  let infoTesti = {};
  let infoN = 0;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function route() {
    const pezzi = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(function (p) {
      try { return decodeURIComponent(p); } catch (e) { return p; }
    });
    const name = NOMI.indexOf(pezzi[0]) >= 0 ? pezzi[0] : "oggi";
    return { name: name, a: pezzi[1] || "", b: pezzi[2] || "" };
  }

  function vai(path) {
    const prossimo = "#/" + path;
    if (location.hash === prossimo) render();
    else location.hash = prossimo;
  }

  const pilaPagine = [];
  let saltoIndietro = false;

  function hashOra() {
    const h = location.hash;
    if (!h || h === "#") return "#/oggi";
    return h;
  }

  function aggiornaTastoIndietro() {
    const b = document.getElementById("indietro");
    if (!b) return;
    b.hidden = pilaPagine.length < 2;
  }

  function registraPagina() {
    const h = hashOra();
    if (saltoIndietro) {
      saltoIndietro = false;
      aggiornaTastoIndietro();
      return;
    }
    if (pilaPagine.length && pilaPagine[pilaPagine.length - 1] === h) {
      aggiornaTastoIndietro();
      return;
    }
    if (pilaPagine.length >= 2 && pilaPagine[pilaPagine.length - 2] === h) pilaPagine.pop();
    else pilaPagine.push(h);
    aggiornaTastoIndietro();
  }

  function tornaIndietro() {
    if (ritornoNuovo && route().name === "magazzino" && route().a === "nuovo") {
      const dest = ritornoNuovo;
      ritornoNuovo = null;
      pendingScrollRiga = dest.riga;
      vai("fattura/scheda/" + encodeURIComponent(dest.numero));
      return;
    }
    if (pilaPagine.length < 2) return;
    const destinazione = pilaPagine[pilaPagine.length - 2];
    pilaPagine.pop();
    saltoIndietro = true;
    if (hashOra() === destinazione) {
      saltoIndietro = false;
      aggiornaTastoIndietro();
      return;
    }
    location.hash = destinazione;
  }

  function oggi() {
    return ErpFormat.oggi();
  }

  function nomeIng(id) {
    const ing = (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === ErpEngine.codice(id); });
    return ing ? ing.nome : id;
  }

  function nomePiatto(id) {
    const p = (stato.piatti || []).find(function (x) { return ErpEngine.codice(x.id) === ErpEngine.codice(id); });
    return p ? p.nome : id;
  }

  function udmIng(id) {
    const ing = (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === ErpEngine.codice(id); });
    return ing ? ing.udm || "" : "";
  }

  function primoIdIngrediente() {
    const lista = (stato.ingredienti || []).filter(function (i) { return i.attivo !== false; })
      .slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), "it"); });
    return lista.length ? lista[0].id : "";
  }

  function opzioniIngredienti() {
    return (stato.ingredienti || []).filter(function (i) { return i.attivo !== false; })
      .slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, "it"); })
      .map(function (i) { return '<option value="' + esc(i.id) + '">' + esc(i.id) + " — " + esc(String(i.nome || "").toLocaleUpperCase("it")) + "</option>"; })
      .join("");
  }

  function opzioniPiatti() {
    return (stato.piatti || []).slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, "it"); })
      .map(function (p) { return '<option value="' + esc(p.id) + '">' + esc(p.nome) + "</option>"; })
      .join("");
  }

  function campo(etichetta, inner, largo) {
    return '<label class="campo' + (largo ? " largo" : "") + '"><span>' + etichetta + "</span>" + inner + "</label>";
  }

  function cifreEuro(digits) {
    digits = String(digits || "").replace(/\D/g, "").replace(/^0+(?=\d)/, "");
    if (!digits) return "";
    while (digits.length < 3) digits = "0" + digits;
    return digits.slice(0, -2) + "," + digits.slice(-2);
  }

  function testoEuro(n) {
    if (n == null || n === "") return "";
    const x = Number(n);
    if (!Number.isFinite(x)) return "";
    return cifreEuro(String(Math.round(Math.abs(x) * 100)));
  }

  function maiuscolaIniziale(s) {
    const t = String(s || "").trim();
    if (!t) return "";
    return t.charAt(0).toLocaleUpperCase("it") + t.slice(1);
  }

  function inputTesto(name, valore, placeholder, voce) {
    const cls = voce === "nome" ? ' class="voce-nome"' : "";
    const data = voce ? ' data-voce="' + voce + '"' : "";
    return '<input name="' + name + '"' + cls + data + ' value="' + esc(valore || "") + '" placeholder="' + esc(placeholder || "") + '" autocomplete="off">';
  }

  function inputNum(name, valore, placeholder, modo) {
    const mode = modo === "decimale" || modo === "euro" ? "decimal" : "numeric";
    return '<input name="' + name + '" data-modo="' + modo + '" inputmode="' + mode + '" value="' + esc(valore || "") + '" placeholder="' + esc(placeholder || "") + '" autocomplete="off">';
  }

  function udmDelForm(form) {
    const scelto = form.querySelector('select[name="udm"]');
    if (scelto && scelto.value) return scelto.value === "L" || scelto.value === "pz" ? scelto.value : "kg";
    const ingSel = form.querySelector('[name="ing"]');
    if (ingSel && ingSel.value) {
      const ing = (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === ErpEngine.codice(ingSel.value); });
      if (ing) return ing.udm === "L" || ing.udm === "pz" ? ing.udm : "kg";
    }
    return "";
  }

  function campoQuantita(base, name, udm, valore) {
    const master = udm ? ErpUnita.master(udm) : "";
    const tasti = master ? ErpUnita.scelte(master).map(function (u) {
      return '<button type="button" class="cat-tasto" data-act="unita-qta" data-unita="' + esc(u) + '" aria-pressed="false">' + esc(u) + "</button>";
    }).join("") : "";
    const memorizzato = valore != null && valore !== "" && Number(valore) !== 0 ? String(valore) : "";
    return '<div class="campo campo-qta largo" data-qta-box="1" data-master="' + esc(master) + '" data-valore="' + esc(memorizzato) + '">'
      + "<span>" + esc(base) + "</span>"
      + (tasti ? '<div class="cat-elenco">' + tasti + "</div>" : '<p class="muto">Prima scegli l\'articolo.</p>')
      + '<input name="' + esc(name) + '" data-qta="1" data-unita="" placeholder="Scegli l\'unità" autocomplete="off" disabled>'
      + "</div>";
  }

  function disegnaTastiUnita(box, udm) {
    const master = udm ? ErpUnita.master(udm) : "";
    const muto = box.querySelector("p.muto");
    if (muto) muto.remove();
    let elenco = box.querySelector(".cat-elenco");
    const input = box.querySelector("[data-qta]");
    if (!elenco) {
      elenco = document.createElement("div");
      elenco.className = "cat-elenco";
      box.insertBefore(elenco, input);
    }
    elenco.innerHTML = master ? ErpUnita.scelte(master).map(function (u) {
      return '<button type="button" class="cat-tasto" data-act="unita-qta" data-unita="' + esc(u) + '" aria-pressed="false">' + esc(u) + "</button>";
    }).join("") : "";
    if (!master && !box.querySelector("p.muto")) {
      const p = document.createElement("p");
      p.className = "muto";
      p.textContent = "Prima scegli l'articolo.";
      box.insertBefore(p, input);
    }
    input.value = "";
    input.disabled = true;
    input.dataset.unita = "";
    input.placeholder = "Scegli l'unità";
    box.dataset.master = master;
    box.dataset.valore = "";
  }

  function testoPrezzoUdm(udm) {
    if (udm === "L") return "Prezzo €/L";
    if (udm === "pz") return "Prezzo €/pz";
    return "Prezzo €/kg";
  }

  function syncPeso(form) {
    const udm = udmDelForm(form);
    form.querySelectorAll("[data-prezzo-label]").forEach(function (el) {
      el.textContent = udm ? testoPrezzoUdm(udm) : "Prezzo";
    });
    form.dataset.unita = udm;
  }

  function tabella(testi, corpo) {
    if (!corpo) return '<p class="muto">Niente da mostrare.</p>';
    return '<div class="scorri"><table class="registro"><thead><tr>'
      + testi.map(function (t) { return "<th>" + t + "</th>"; }).join("")
      + "</tr></thead><tbody>" + corpo + "</tbody></table></div>";
  }

  function bannerHtml() {
    const pezzi = [];
    if (ErpDb.messaggio()) pezzi.push('<p class="banner errore">' + esc(ErpDb.messaggio()) + "</p>");
    if (banner) pezzi.push('<p class="banner' + (bannerErrore ? " errore" : "") + '">' + esc(banner) + "</p>");
    return pezzi.join("");
  }

  function tastoInfo(grafico) {
    infoN += 1;
    const id = "n" + infoN;
    infoTesti[id] = grafico;
    return '<span class="i-angolo" data-info="' + id + '" aria-hidden="true">i</span>';
  }

  function htmlBarre(voci, scala) {
    if (!voci || !voci.length) return "";
    let max = 0;
    voci.forEach(function (v) {
      max = Math.max(max, Math.abs(Number(v.valore) || 0));
    });
    if (scala) max = scala;
    if (!max) max = 1;
    return voci.map(function (v) {
      const n = Math.abs(Number(v.valore) || 0);
      const pct = Math.max(6, Math.round((n / max) * 100));
      return '<div class="g-riga"><span class="g-nome">' + esc(v.nome) + "</span>"
        + '<span class="g-pista"><span class="g-fill" style="width:' + pct + "%;background:" + v.colore + '"></span></span>'
        + '<span class="g-val">' + esc(v.testo) + "</span></div>";
    }).join("");
  }

  function htmlFornitori(lista) {
    if (!lista || !lista.length) return "";
    const schede = lista.map(function (f) {
      return '<div class="g-scheda" style="border-top-color:' + f.colore + '">'
        + '<span class="g-scheda-etichetta" style="color:' + f.colore + '">' + esc(f.etichetta) + "</span>"
        + '<span class="g-scheda-nome">' + esc(f.nome) + "</span>"
        + '<span class="g-scheda-det">' + esc(f.dettaglio) + "</span></div>";
    }).join("");
    return '<div class="g-box"><p class="g-box-titolo">Fornitori</p><div class="g-coppia">' + schede + "</div></div>";
  }

  function htmlGrafico(g) {
    if (!g) return "";
    const titolo = g.titolo ? '<p class="g-titolo' + (g.ingrediente ? " nome-ing" : "") + '">' + esc(g.titolo) + "</p>" : "";
    const barre = htmlBarre(g.voci, g.scala);
    const forn = htmlFornitori(g.fornitori);
    if (!barre && !forn) return titolo;
    if (forn && barre) {
      return titolo + '<div class="g-box"><p class="g-box-titolo">' + esc(g.box || "Dati") + "</p>" + barre + "</div>" + forn;
    }
    return titolo + barre + forn;
  }

  function chiudiFoglio() {
    infoAperto = false;
    const f = document.getElementById("foglio");
    const t = document.getElementById("foglio-corpo");
    if (t) t.innerHTML = "";
    if (f) f.hidden = true;
  }

  function apriFoglio(grafico) {
    const f = document.getElementById("foglio");
    const t = document.getElementById("foglio-corpo");
    if (!f || !t) return;
    t.innerHTML = htmlGrafico(grafico);
    f.hidden = false;
    const x = document.getElementById("foglio-x");
    if (x) x.focus();
  }

  function voce(nome, valore, testo, colore, nota) {
    return { nome: nome, valore: valore, testo: testo, colore: colore, nota: !!nota };
  }

  function ultimoAcquisto(id) {
    const k = ErpEngine.codice(id);
    let scelto = null;
    function valuta(data, fornitore, prezzo) {
      const nome = String(fornitore || "").trim();
      const quando = String(data || "");
      if (!nome || !quando) return;
      const euro = Number(prezzo);
      if (!scelto || quando > scelto.data) {
        scelto = { data: quando, fornitore: nome, prezzo: euro > 0 ? euro : null };
      }
    }
    (stato.carichi || []).forEach(function (c) {
      if (ErpEngine.codice(c.idIngrediente) !== k) return;
      valuta(c.at, c.fornitore, c.prezzoUdm);
    });
    (stato.offerte || []).forEach(function (o) {
      if (ErpEngine.codice(o.idIngrediente) !== k) return;
      if (o.tipo === "preventivo") return;
      valuta(o.data, o.fornitore, o.prezzoUdm);
    });
    return scelto;
  }

  function fornitoriDi(id) {
    const ing = (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === ErpEngine.codice(id); });
    const prezzo = ErpEngine.prezzoIngrediente(stato, id);
    const udm = ing && ing.udm ? "/" + ing.udm : "";
    const ultimo = ultimoAcquisto(id);
    let dettaglioUltimo = "Nessun acquisto";
    if (ultimo) {
      dettaglioUltimo = ErpFormat.dataIT(ultimo.data);
      if (ultimo.prezzo != null) dettaglioUltimo += "\n" + ErpFormat.euro(ultimo.prezzo) + udm;
    }
    return [
      {
        etichetta: "Migliore",
        nome: prezzo ? prezzo.fornitore : "Nessuno",
        dettaglio: prezzo ? ErpFormat.euro(prezzo.prezzoUdm) + udm : "Nessun prezzo",
        colore: "#34d399"
      },
      {
        etichetta: "Comprato",
        nome: ultimo ? ultimo.fornitore : "Nessuno",
        dettaglio: dettaglioUltimo,
        colore: "#fbbf24"
      }
    ];
  }

  function conFornitori(g, id, box) {
    g.fornitori = fornitoriDi(id);
    g.box = box;
    g.ingrediente = true;
    return g;
  }

  function graficoOrdine(r) {
    const udm = r.udm || r.unita || "";
    const voci = [
      voce("In casa", r.giacenza, ErpFormat.qta(r.giacenza) + " " + udm, "#f87171"),
      voce("Servono", r.fabbisogno, ErpFormat.qta(r.fabbisogno) + " " + udm, "#4d9fff"),
      voce("Da comprare", r.daComprare, ErpFormat.qta(r.daComprare) + " " + udm, "#ff9800")
    ];
    if (r.colli != null) {
      voci.push(voce("Collo", r.qtaConfezione, ErpFormat.qta(r.colli) + " × " + ErpFormat.qta(r.qtaConfezione) + " " + udm, "#34d399"));
    }
    return conFornitori({ titolo: r.nome, voci: voci }, r.id, "Ordine");
  }

  function graficoSfrido(id) {
    const s = ErpEngine.sfridoIngrediente(stato, id);
    const nome = nomeIng(id);
    if (!s || s.fonte !== "inventari") {
      return conFornitori({ titolo: nome, voci: [voce("Sfrido", 1, "1", "#9eb4d0")] }, id, "Sfrido");
    }
    const ult = s.periodi[s.periodi.length - 1];
    const voci = [];
    if (ult) {
      voci.push(voce("Ricetta", ult.teorico, ErpFormat.qta(ult.teorico), "#4d9fff"));
      voci.push(voce("Uscito", ult.reale, ErpFormat.qta(ult.reale), ult.reale > ult.teorico ? "#f87171" : "#34d399"));
    }
    return conFornitori({ titolo: nome + "  " + ErpFormat.ita(s.coef, 2), voci: voci }, id, "Sfrido");
  }

  function graficoGiacenza(id) {
    const p = ErpEngine.profiloIngrediente(stato, id, oggi());
    if (!p) return { titolo: "", voci: [] };
    const inv = (stato.inventari || []).filter(function (i) {
      return ErpEngine.codice(i.idIngrediente) === p.id && i.at;
    }).slice().sort(function (a, b) { return String(a.at).localeCompare(String(b.at)); });
    const ultimo = inv.length ? inv[inv.length - 1] : null;
    if (!ultimo) {
      return conFornitori({
        titolo: p.nome,
        voci: [voce("In casa", p.giacenza, ErpFormat.qta(p.giacenza) + " " + p.udm, "#4d9fff")]
      }, p.id, "Giacenza");
    }
    let carichi = 0;
    (stato.carichi || []).forEach(function (c) {
      if (ErpEngine.codice(c.idIngrediente) !== p.id) return;
      if (String(c.at) > String(ultimo.at)) carichi += Number(c.quantita) || 0;
    });
    const uscite = (Number(ultimo.reale) || 0) + carichi - p.giacenza;
    return conFornitori({
      titolo: p.nome,
      voci: [
        voce("Conteggio", ultimo.reale, ErpFormat.qta(ultimo.reale) + " " + p.udm, "#4d9fff"),
        voce("Carichi", carichi, ErpFormat.qta(carichi) + " " + p.udm, "#34d399"),
        voce("Uscite", uscite, ErpFormat.qta(uscite) + " " + p.udm, "#ff9800"),
        voce("In casa", p.giacenza, ErpFormat.qta(p.giacenza) + " " + p.udm, coloreScorte(p))
      ]
    }, p.id, "Giacenza");
  }

  function graficoPiatto(p) {
    const voci = [
      voce("Costo", p.costoReale, ErpFormat.euro(p.costoReale), "#ff9800")
    ];
    if (p.listino != null) voci.push(voce("Listino", p.listino, ErpFormat.euro(p.listino), "#9eb4d0"));
    if (p.incasso != null) voci.push(voce("Incasso", p.incasso, ErpFormat.euro(p.incasso), "#4d9fff"));
    return { titolo: p.nome, voci: voci };
  }

  function graficoRigaPiatto(r) {
    const senzaPrezzo = r.prezzoUdm == null;
    return {
      titolo: r.nome,
      ingrediente: true,
      box: "Costo",
      voci: [
        voce("Ricetta", r.costoTeorico, senzaPrezzo ? "—" : ErpFormat.euro(r.costoTeorico), "#4d9fff"),
        voce("Con sfrido", r.costoReale, senzaPrezzo ? "—" : ErpFormat.euro(r.costoReale), "#ff9800")
      ],
      fornitori: fornitoriDi(r.id)
    };
  }

  function testoNota(n) {
    if (n && n.collezione === "inventari") {
      const nome = nomeIng(n.idIngrediente) || n.idIngrediente || "Un articolo";
      return nome + ": tengo " + ErpFormat.qta(n.tenutoReale) + " del " + ErpFormat.dataIT(String(n.tenutoAt || "").slice(0, 10))
        + ". L'altro conteggio era " + ErpFormat.qta(n.altroReale) + " del " + ErpFormat.dataIT(String(n.altroAt || "").slice(0, 10)) + ".";
    }
    return (n && n.testo) || "Due versioni diverse. Tengo la più recente.";
  }

  function htmlNote() {
    const note = (stato && stato.note) || [];
    if (!note.length) return "";
    return note.map(function (n) {
      return '<article class="blocco-fattura"><p>' + esc(testoNota(n)) + "</p>"
        + '<button type="button" class="tasto-grosso" data-act="nota-vista" data-id="' + esc(n.id) + '">Ho visto</button></article>';
    }).join("");
  }

  function rigaArchivio() {
    if (!window.ErpArchivio) return "";
    if (!ErpArchivio.entrato()) return '<p class="muto">Questo telefono tiene i suoi numeri. Da Dati colleghi l\'archivio, e l\'altro telefono vede gli stessi.</p>';
    if (ErpArchivio.inAttesa()) return '<p class="banner">Non raggiungo l\'archivio. I numeri restano qui e partono quando torna la linea.</p>';
    return '<p class="muto">Archivio collegato' + (ErpArchivio.email() ? " come " + esc(ErpArchivio.email()) : "") + ".</p>";
  }

  function vistaHome() {
    const o = ErpEngine.propostaOrdini(stato, { oggi: oggi() });
    return htmlNote() + rigaArchivio() + '<p class="etichetta">Da ordinare</p>'
      + '<p class="numero-hero">' + ErpFormat.euro(o.totale) + "</p>"
      + '<a class="tasto-grosso" href="#/conteggio">Conteggio</a>'
      + '<a class="tasto-grosso" href="#/giacenza">Giacenza</a>'
      + '<a class="tasto-grosso" href="#/spesa">Spesa</a>';
  }

  const MENU_PIATTI = ["Antipasti", "Primi", "Secondi", "Contorni", "Pizze", "Dolci", "Bevande"];

  function categoriaMerce(nome) {
    const t = String(nome || "").trim();
    if (!t || t.toLocaleLowerCase("it") === "senza categoria") return "Altro";
    return t;
  }

  function categoriaPiattoVisibile(nome) {
    const t = String(nome || "").trim();
    if (!t || t.toLocaleLowerCase("it") === "senza categoria") return "Altro";
    return t.charAt(0).toLocaleUpperCase("it") + t.slice(1);
  }

  function ordinePiatto(nome) {
    const k = String(nome || "").trim().toLocaleLowerCase("it");
    const i = MENU_PIATTI.findIndex(function (c) { return c.toLocaleLowerCase("it") === k; });
    if (i >= 0) return i;
    if (k === "pizza") return MENU_PIATTI.findIndex(function (c) { return c.toLocaleLowerCase("it") === "pizze"; }) + 0.5;
    if (k === "altro") return 200;
    return 100;
  }

  function confrontaMerce(a, b) {
    const aa = a.toLocaleLowerCase("it") === "altro" ? 1 : 0;
    const bb = b.toLocaleLowerCase("it") === "altro" ? 1 : 0;
    if (aa !== bb) return aa - bb;
    return a.localeCompare(b, "it");
  }

  function raggruppa(righe, nomeFn, ordinaNomi) {
    const map = new Map();
    righe.forEach(function (r) {
      const nome = nomeFn(r);
      if (!map.has(nome)) map.set(nome, []);
      map.get(nome).push(r);
    });
    return Array.from(map.keys()).sort(ordinaNomi).map(function (nome) {
      return { nome: nome, righe: map.get(nome) };
    });
  }

  function htmlGruppi(pagina, gruppi, rendiRiga, tipo, apriPrimo) {
    if (!gruppi.length) return "";
    if (!gruppiAperti[pagina]) {
      gruppiAperti[pagina] = {};
      if (apriPrimo !== false && gruppi[0]) gruppiAperti[pagina][gruppi[0].nome] = true;
    }
    return gruppi.map(function (g) {
      const aperto = !!gruppiAperti[pagina][g.nome];
      const n = g.righe.length;
      const parola = tipo === "piatti" ? (n === 1 ? "piatto" : "piatti") : (n === 1 ? "articolo" : "articoli");
      let html = '<article class="blocco-fattura gruppo-cat">';
      html += '<button type="button" class="mese-tasto" data-act="gruppo" data-pagina="' + esc(pagina) + '" data-id="' + esc(g.nome) + '" aria-expanded="' + (aperto ? "true" : "false") + '">'
        + '<span class="mese-nome">' + esc(g.nome) + "</span>"
        + '<span class="gruppo-n">' + n + " " + parola + "</span>"
        + (g.extra || "")
        + '<span class="consumi-freccia" aria-hidden="true">' + (aperto ? "▾" : "▸") + "</span></button>";
      if (aperto) html += '<div class="mese-corpo">' + g.righe.map(rendiRiga).join("") + "</div>";
      html += "</article>";
      return html;
    }).join("");
  }

  function elencoCategoriePiatto() {
    const viste = [];
    function aggiungi(nome) {
      const mostra = categoriaPiattoVisibile(nome);
      if (!mostra || mostra === "Altro") return;
      if (viste.some(function (v) { return v.toLocaleLowerCase("it") === mostra.toLocaleLowerCase("it"); })) return;
      viste.push(mostra);
    }
    MENU_PIATTI.forEach(aggiungi);
    (stato.piatti || []).forEach(function (p) { aggiungi(p.categoria); });
    viste.sort(function (a, b) {
      const oa = ordinePiatto(a);
      const ob = ordinePiatto(b);
      if (oa !== ob) return oa - ob;
      return a.localeCompare(b, "it");
    });
    return viste;
  }

  function sospesoDelGiorno() {
    const s = ErpConteggio.normalizza(stato.impostazioni && stato.impostazioni.conteggioSospeso);
    if (s.giorno !== oggi()) return { giorno: "", righe: [], mappa: {} };
    const mappa = {};
    s.righe.forEach(function (r) { mappa[r.id] = r.reale; });
    return { giorno: s.giorno, righe: s.righe, mappa: mappa };
  }

  function fraseConteggio(da, fatti) {
    const daTxt = da + " da contare";
    const fattiTxt = fatti === 1 ? "1 già contato" : fatti + " già contati";
    if (da && fatti) return daTxt + " · " + fattiTxt;
    if (da) return daTxt;
    return fattiTxt;
  }

  function schedaConteggio(ing, contato) {
    const teorica = ErpEngine.giacenzaIngrediente(stato, ing.id, oggi());
    const udm = ing.udm || "";
    const fatto = contato != null;
    const unita = udm ? " " + esc(udm) : "";
    return '<form data-form="inventario" class="scheda-conta' + (fatto ? " scheda-contata" : "") + '">'
      + '<input type="hidden" name="ing" value="' + esc(ing.id) + '">'
      + '<p class="nome-ing">' + esc(ing.nome) + "</p>"
      + tastoInfo(graficoGiacenza(ing.id))
      + '<p class="etichetta">Giacenza teorica</p>'
      + '<p class="numero-hero">' + ErpFormat.qta(teorica) + unita + "</p>"
      + (fatto ? '<p class="etichetta">Contato</p><p class="numero">' + ErpFormat.qta(contato) + unita + "</p>" : "")
      + campoQuantita(fatto ? "Correggi la quantità" : "Quantità contata", "reale", ing.udm, "")
      + '<div class="azioni"><button type="submit" class="tasto-grosso">' + (fatto ? "Correggi" : "Salva") + "</button></div>"
      + "</form>";
  }

  function vistaConteggioCategoria(nome) {
    const voluta = categoriaMerce(nome);
    const contati = sospesoDelGiorno().mappa;
    const tutti = (stato.ingredienti || []).filter(function (i) {
      return i.attivo !== false && categoriaMerce(i.categoria) === voluta;
    });
    if (!tutti.length) return '<p class="muto">Nessun articolo in questa categoria.</p>';
    const da = [];
    const fatti = [];
    ErpConteggio.ordinaAlfabeto(tutti).forEach(function (i) {
      const id = ErpEngine.codice(i.id);
      if (contati[id] != null) fatti.push(i);
      else da.push(i);
    });
    let html = "<h2>Da contare</h2>";
    if (!da.length) html += '<p class="muto">Niente in fila. I contati si chiudono alle 23:59.</p>';
    else html += '<div class="fila-conta">' + da.map(function (i) { return schedaConteggio(i, null); }).join("") + "</div>";
    if (fatti.length) {
      html += "<h2>Già contati</h2>";
      html += '<div class="fila-conta">' + fatti.map(function (i) {
        return schedaConteggio(i, contati[ErpEngine.codice(i.id)]);
      }).join("") + "</div>";
    }
    return html;
  }

  function vistaConteggio() {
    const r = route();
    if (r.a === "cat" && r.b) return vistaConteggioCategoria(r.b);
    const righe = (stato.ingredienti || []).filter(function (i) { return i.attivo !== false; });
    if (!righe.length) return '<a class="tasto-grosso" href="#/magazzino/nuovo">Nuovo prodotto</a>';
    const contati = sospesoDelGiorno().mappa;
    const gruppi = raggruppa(righe, function (i) { return categoriaMerce(i.categoria); }, confrontaMerce);
    let html = '<p class="muto">Un tocco apre la categoria. Alle 23:59 i contati diventano la giacenza reale. Gli altri restano come sono.</p>';
    html += gruppi.map(function (g) {
      let da = 0;
      let fatti = 0;
      g.righe.forEach(function (i) {
        if (contati[ErpEngine.codice(i.id)] != null) fatti += 1;
        else da += 1;
      });
      return '<a class="blocco-fattura gruppo-cat cat-apri" href="#/conteggio/cat/' + encodeURIComponent(g.nome) + '">'
        + '<span class="mese-nome">' + esc(g.nome) + "</span>"
        + '<span class="gruppo-n">' + esc(fraseConteggio(da, fatti)) + "</span>"
        + '<span class="consumi-freccia" aria-hidden="true">▸</span></a>';
    }).join("");
    html += incolla("inventario", "data;codice;quantità contata", "09/11/2026;LAT-009;6");
    return html;
  }

  function livelloScorte(r) {
    const g = Number(r.giacenza);
    if (!Number.isFinite(g)) return "";
    if (g < 0) return "urgente";
    if (g === 0 || (r.autonomia != null && Number(r.autonomia) < 3)) return "basso";
    return "";
  }

  function coloreScorte(r) {
    const livello = livelloScorte(r);
    if (livello === "urgente") return "#f87171";
    if (livello === "basso") return "#fbbf24";
    return "#4d9fff";
  }

  function vistaGiacenza() {
    const righe = ErpEngine.cruscotto(stato, oggi()).filter(function (r) { return r.attivo; });
    righe.sort(function (a, b) {
      const peso = { urgente: 0, basso: 1 };
      const ua = peso[livelloScorte(a)] == null ? 2 : peso[livelloScorte(a)];
      const ub = peso[livelloScorte(b)] == null ? 2 : peso[livelloScorte(b)];
      if (ua !== ub) return ua - ub;
      return a.nome.localeCompare(b.nome, "it");
    });
    if (!righe.length) return '<p class="etichetta">Nessun prodotto.</p>';
    const gruppi = raggruppa(righe, function (r) { return categoriaMerce(r.categoria); }, confrontaMerce);
    return htmlGruppi("giacenza", gruppi, function (r) {
      const livello = livelloScorte(r);
      return '<div class="riga' + (livello ? " " + livello : "") + '">'
        + '<a class="riga-nome nome-ing" href="#/magazzino/scheda/' + encodeURIComponent(r.id) + '">' + esc(r.nome) + "</a>"
        + '<span class="riga-num">' + ErpFormat.qta(r.giacenza) + " " + esc(r.udm) + "</span>"
        + tastoInfo(graficoGiacenza(r.id))
        + "</div>";
    }, "articoli");
  }

  const STILI = [
    { id: "sistema", nome: "Sistema", nota: "Quello dell'iPhone", font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
    { id: "tondo", nome: "Tondo", nota: "Rotondo", font: "'Avenir Next', Avenir, 'Segoe UI', sans-serif" },
    { id: "menu", nome: "Menu", nota: "Come la carta del ristorante", font: "'Iowan Old Style', Palatino, 'Palatino Linotype', Georgia, serif" },
    { id: "stretto", nome: "Stretto", nota: "Alto e compatto", font: "Futura, 'Century Gothic', 'Trebuchet MS', sans-serif" }
  ];

  function applicaStile(id) {
    const s = STILI.filter(function (x) { return x.id === id; })[0] || STILI[0];
    document.body.dataset.stile = s.id;
    document.body.style.fontFamily = s.font;
    try { localStorage.setItem("erp-leggero-stile", s.id); } catch (e) { /* il telefono può rifiutare */ }
  }

  function articoliUsati() {
    const usati = {};
    (stato.ricette || []).forEach(function (r) {
      const id = ErpEngine.codice(r.idIngrediente);
      if (id) usati[id] = true;
    });
    (stato.carichi || []).forEach(function (c) {
      const id = ErpEngine.codice(c.idIngrediente);
      if (id) usati[id] = true;
    });
    return (stato.ingredienti || []).filter(function (i) { return usati[ErpEngine.codice(i.id)]; })
      .slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), "it"); })
      .map(function (i) {
        const categoria = String(i.categoria || "").trim() || "Senza categoria";
        return { id: i.id, nome: i.nome, udm: i.udm === "L" || i.udm === "pz" ? i.udm : "kg", categoria: categoria };
      });
  }

  function categorieDegliUsati() {
    const viste = {};
    articoliUsati().forEach(function (a) { viste[a.categoria] = true; });
    return Object.keys(viste).sort(function (a, b) { return a.localeCompare(b, "it"); });
  }

  function gruppiPreventivo() {
    const gruppi = {};
    (stato.offerte || []).forEach(function (o) {
      const origine = String(o.origine || "");
      if (origine.indexOf("prev-") !== 0) return;
      if (!gruppi[origine]) gruppi[origine] = [];
      gruppi[origine].push(o);
    });
    return Object.keys(gruppi).map(function (origine) {
      const righe = gruppi[origine].slice().sort(function (a, b) {
        return String(nomeIng(a.idIngrediente)).localeCompare(String(nomeIng(b.idIngrediente)), "it");
      });
      return { origine: origine, righe: righe };
    }).sort(function (a, b) {
      return String(b.righe[0].data || "").localeCompare(String(a.righe[0].data || ""));
    });
  }

  function urlApiPreventivo(path) {
    const origine = (typeof location !== "undefined" && location.origin) || "";
    if (window.ErpPreventiviServer) return ErpPreventiviServer.url(origine, path);
    return path;
  }

  function messaggioPreventivo(e) {
    const t = e && e.message ? String(e.message) : "";
    if (!t || t === "Failed to fetch" || t.indexOf("NetworkError") >= 0 || t.indexOf("Unexpected token") === 0) {
      return "Il computer del locale non risponde. Accendilo e riprova.";
    }
    return t;
  }

  async function leggiRispostaPreventivo(res) {
    const testo = await res.text();
    try {
      return JSON.parse(testo);
    } catch (e) {
      throw new Error("Il computer del locale non risponde. Accendilo e riprova.");
    }
  }

  function urlPreventivo(token) {
    const base = String(basePreventivi || "").replace(/\/$/, "");
    if (!base || !token) return "";
    return base + "/preventivo/r/" + token;
  }

  function testoWhatsAppPreventivo(fornitore, url, scade) {
    const fino = scade ? " Valido fino al " + ErpFormat.dataIT(scade) + "." : "";
    return "Ciao " + fornitore + ", qui il link per il preventivo." + fino + "\n" + url;
  }

  function htmlTastiLink(url, fornitore, token, scade) {
    let html = '<p class="link-prev">' + esc(url) + "</p>";
    if (scade) {
      html += '<p class="etichetta">Valido fino al</p><p class="numero">' + esc(ErpFormat.dataIT(scade)) + "</p>";
    }
    html += '<div class="azioni">';
    html += '<button type="button" class="tasto-grosso" data-act="prev-wa" data-url="' + esc(url) + '" data-fornitore="' + esc(fornitore) + '" data-scade="' + esc(scade || "") + '">WhatsApp</button>';
    html += '<a class="tasto-grosso" href="' + esc(urlApiPreventivo("/api/preventivi/" + encodeURIComponent(token) + "/excel")) + '">Excel</a>';
    html += '<button type="button" class="tasto-grosso tasto-chiaro" data-act="prev-copia" data-url="' + esc(url) + '">Copia link</button>';
    html += "</div>";
    if (copiaAvviso && copiaAvvisoUrl === url) html += '<p class="entra">' + esc(copiaAvviso) + "</p>";
    return html;
  }

  function preventivoGiaNeiPrezzi(token) {
    const origine = "prev-" + token;
    return (stato.offerte || []).some(function (o) { return o.origine === origine; });
  }

  function vistaRevisione(token) {
    if (!preventiviCaricati) {
      preventiviCaricati = true;
      caricaPreventivi();
    }
    const l = (preventiviServer || []).find(function (x) { return x.token === token; });
    let html = '<a class="indietro" href="#/preventivi">Preventivi</a>';
    if (!l) return html + '<p class="muto">Sto aprendo il preventivo.</p>';
    if (!ErpPreventiviServer.daLeggere(l.stato)) return html + '<p class="muto">Questo preventivo non è da controllare.</p>';
    const nomi = {};
    (l.articoli || []).forEach(function (a) { nomi[a.id] = a.nome; });
    html += '<p class="etichetta">Da controllare</p>';
    html += '<h2>' + esc(l.fornitore || "Fornitore") + "</h2>";
    html += '<p class="muto">' + esc(l.inviato ? ErpFormat.dataIT(l.inviato) : "Senza data") + "</p>";
    if (l.note) html += '<p class="muto">Note generali: ' + esc(l.note) + "</p>";
    const associa = (stato.ingredienti || []).filter(function (i) { return i.attivo !== false; })
      .slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), "it"); });
    html += (l.righe || []).map(function (r) {
      const alt = !!r.alternativo;
      const art = (l.articoli || []).find(function (a) { return a.id === r.id; });
      const udm = alt ? (r.udm || "kg") : ((art && art.udm) || "kg");
      const nome = alt ? (r.nome || "Articolo alternativo") : (nomi[r.id] || r.id);
      let scelta = "";
      if (alt) {
        scelta = '<label class="muto">Associa a un articolo già in magazzino</label>'
          + '<select data-associa="' + esc(r.id) + '"><option value="">Non associato</option>'
          + associa.map(function (i) {
            return '<option value="' + esc(i.id) + '">' + esc(i.nome) + "</option>";
          }).join("")
          + "</select>"
          + '<p class="muto">Non crea un articolo nuovo. Entra nel magazzino solo se lo associ e premi Carica.</p>';
      }
      return '<article class="blocco-fattura"><p class="nome-ing">' + esc(nome) + "</p>"
        + (alt ? '<p class="muto">Articolo alternativo, scritto dal fornitore.</p>' : "")
        + '<p class="numero">' + esc(ErpFormat.euro(r.prezzo)) + "/" + esc(udm) + "</p>"
        + '<p class="muto">Collo ' + esc(ErpFormat.qta(r.confezione)) + " " + esc(udm) + "</p>"
        + (r.codice ? '<p class="muto">Codice fornitore ' + esc(r.codice) + "</p>" : "")
        + (r.note ? '<p class="muto">Note: ' + esc(r.note) + "</p>" : "")
        + scelta
        + "</article>";
    }).join("");
    if (preventivoGiaNeiPrezzi(token)) {
      html += '<p class="muto">Questi prezzi sono già nel confronto.</p>';
    } else {
      html += '<button type="button" class="tasto-grosso" data-act="prev-carica" data-token="' + esc(token) + '">Carica</button>';
    }
    if (l.stato === "inviato") {
      html += '<button type="button" class="tasto-grosso tasto-chiaro" data-act="prev-scarta" data-token="' + esc(token) + '">Scarta</button>';
    }
    return html;
  }

  function vistaPreventivi() {
    if (!preventiviCaricati) {
      preventiviCaricati = true;
      caricaPreventivi();
    }
    const articoli = articoliUsati();
    const categorie = categorieDegliUsati();
    const scelte = categorie.filter(function (c) { return categoriePreventivo[c]; });
    const nelLink = articoli.filter(function (a) { return scelte.indexOf(a.categoria) >= 0; });
    const daControllare = (preventiviServer || []).filter(function (l) { return ErpPreventiviServer.daLeggere(l.stato); });
    let html = "";
    if (daControllare.length) {
      html += '<div class="blocco-fattura">';
      html += '<p class="etichetta">Compilato dal fornitore</p>';
      html += '<p class="numero">' + daControllare.length + "</p>";
      html += "<p>" + (daControllare.length === 1 ? "preventivo arrivato. Aprilo e leggi i prezzi. Entra nel confronto solo se premi Carica." : "preventivi arrivati. Aprili e leggi i prezzi. Entrano nel confronto solo se premi Carica.") + "</p>";
      html += "</div>";
      html += daControllare.map(function (l) {
        const n = (l.righe || []).length;
        const gia = preventivoGiaNeiPrezzi(l.token);
        const frase = l.stato === "inviato"
          ? "Da controllare"
          : (gia ? "Già nei prezzi" : "Compilato. Aprilo e premi Carica.");
        return '<a class="blocco-fattura" href="#/preventivi/scheda/' + encodeURIComponent(l.token) + '">'
          + '<p class="riga-nome">' + esc(l.fornitore || "Fornitore") + "</p>"
          + '<p class="muto">' + esc((l.inviato ? ErpFormat.dataIT(l.inviato) + " · " : "") + n + " prezzi") + "</p>"
          + '<p class="muto">' + esc(frase) + "</p></a>";
      }).join("");
    }
    html += '<p class="muto">Crei un link e lo mandi al fornitore. Lui scrive i prezzi degli articoli che usi. Il fornitore apre il link finché il computer del locale è acceso. Il preventivo non entra nei prezzi finché non lo carichi.</p>';
    html += '<form data-form="nuovo-preventivo" class="campi">';
    html += campo("Fornitore", inputTesto("fornitore", "", "Rossi", "testo"));
    html += campo("Quanti giorni resta valido", inputNum("giorni", "", "7", "intero"));
    if (!articoli.length) {
      html += '<p class="banner errore">Non c\'è ancora un articolo in ricetta o in un carico.</p>';
    } else {
      html += '<div class="campo largo"><span>Categorie</span><div class="cat-elenco">' + categorie.map(function (c) {
        const acceso = !!categoriePreventivo[c];
        return '<button type="button" class="cat-tasto" data-act="cat-preventivo" data-nome="' + esc(c) + '" aria-pressed="' + (acceso ? "true" : "false") + '">' + esc(c) + "</button>";
      }).join("") + "</div></div>";
      if (nelLink.length) {
        html += '<p class="muto">Nel link: ' + nelLink.map(function (a) {
          return '<span class="nome-ing">' + esc(a.nome) + "</span>";
        }).join(", ") + ".</p>";
      } else {
        html += '<p class="muto">Scegli almeno una categoria. Un fornitore di ortofrutta non riceve le altre.</p>';
      }
    }
    html += '<div class="azioni largo"><button type="submit" class="tasto-grosso">Crea il link</button></div></form>';
    if (linkAppenaCreato && linkAppenaCreato.url) {
      html += '<p class="frase-mano">Link per <b>' + esc(linkAppenaCreato.fornitore) + "</b></p>";
      html += htmlTastiLink(linkAppenaCreato.url, linkAppenaCreato.fornitore, linkAppenaCreato.token, linkAppenaCreato.scade);
      html += '<p class="muto">Il fornitore apre questo link finché il computer del locale è acceso.</p>';
    }
    const aperti = (preventiviServer || []).filter(function (l) {
      return l.stato === "aperto" && (!linkAppenaCreato || l.token !== linkAppenaCreato.token);
    });
    if (aperti.length) {
      html += "<h2>Link in attesa</h2>";
      html += aperti.map(function (l) {
        const url = urlPreventivo(l.token);
        return '<article class="blocco-fattura"><p class="riga-nome">' + esc(l.fornitore) + "</p>"
          + (url ? htmlTastiLink(url, l.fornitore, l.token, l.scade) : '<p class="muto">Manca l\'indirizzo del link.</p>')
          + "</article>";
      }).join("");
    }
    const arrivati = gruppiPreventivo();
    html += "<h2>Arrivati</h2>";
    if (!arrivati.length) {
      html += '<p class="muto">Nessun preventivo arrivato. Non è un carico: i prezzi non fanno entrare merce.</p>';
      return html;
    }
    html += '<p class="muto">Scorri per toglierlo. La giacenza non cambia.</p>';
    html += arrivati.map(function (g) {
      const prima = g.righe[0];
      const prezzi = g.righe.map(function (o) {
        const udm = udmIng(o.idIngrediente) || "kg";
        const collo = Number(o.qtaConfezione) > 0 ? "collo " + ErpFormat.qta(o.qtaConfezione) + " " + udm : "";
        return '<p class="prezzo-prev"><span class="nome-ing">' + esc(nomeIng(o.idIngrediente)) + '</span>'
          + '<span class="numero-prev">' + esc(ErpFormat.euro(o.prezzoUdm)) + "/" + esc(udm) + "</span></p>"
          + (collo ? '<p class="muto">' + esc(collo) + "</p>" : "");
      }).join("");
      return rigaTogli(
        "preventivo",
        g.origine,
        "Togliere il preventivo di " + prima.fornitore + "?",
        '<span class="riga-nome">' + esc(prima.fornitore) + "</span>"
          + '<span class="riga-meta">' + esc(ErpFormat.dataIT(prima.data)) + "</span>"
          + prezzi,
        "riga-preventivo"
      );
    }).join("");
    return html;
  }

  function vistaMenu() {
    return [
      ["magazzino", "Magazzino"],
      ["fattura", "Fattura"],
      ["preventivi", "Preventivi"],
      ["cassa", "Cassa"],
      ["ricette", "Ricette"],
      ["food", "Food cost"],
      ["dati", "Dati"],
    ].map(function (v) {
      return '<a class="tasto-grosso" href="#/' + v[0] + '">' + v[1] + "</a>";
    }).join("");
  }

  function rigaTogli(tipo, id, domanda, dentro, classe) {
    return '<div class="scorri" data-togli="' + esc(tipo) + '" data-id="' + esc(id) + '" data-domanda="' + esc(domanda) + '">'
      + '<div class="scorri-fondo" aria-hidden="true">Togli</div>'
      + '<div class="riga scorri-faccia' + (classe ? " " + classe : "") + '">' + dentro + "</div></div>";
  }

  function rigaCompatta(nome, href, numero, testo, livello, togli, ingrediente) {
    const cls = "riga-nome" + (ingrediente ? " nome-ing" : "");
    const marca = livello === true ? "urgente" : (livello || "");
    const corpo = (href ? '<a class="' + cls + '" href="' + href + '">' + esc(nome) + "</a>" : '<span class="' + cls + '">' + esc(nome) + "</span>")
      + '<span class="riga-num">' + numero + "</span>"
      + tastoInfo(testo);
    if (!togli) {
      return '<div class="riga' + (marca ? " " + marca : "") + '">' + corpo + "</div>";
    }
    return rigaTogli(togli.tipo, togli.id, togli.domanda, corpo, marca);
  }

  function vistaMagazzino() {
    const righe = ErpEngine.cruscotto(stato, oggi());
    const vivi = righe.filter(function (r) { return r.attivo; });
    const spenti = righe.filter(function (r) { return !r.attivo; });
    let html = '<a class="tasto-grosso" href="#/magazzino/nuovo">Nuovo prodotto</a>';
    const gruppi = raggruppa(vivi, function (r) { return categoriaMerce(r.categoria); }, confrontaMerce);
    html += htmlGruppi("magazzino", gruppi, function (r) {
      return rigaCompatta(
        r.nome,
        "#/magazzino/scheda/" + encodeURIComponent(r.id),
        ErpFormat.qta(r.giacenza) + " " + esc(r.udm),
        graficoGiacenza(r.id),
        livelloScorte(r),
        null,
        true
      );
    }, "articoli");
    if (spenti.length) {
      html += "<h2>Archiviati</h2>";
      const spentiGruppi = raggruppa(spenti, function (r) { return categoriaMerce(r.categoria); }, confrontaMerce);
      html += htmlGruppi("magazzino-archivio", spentiGruppi, function (r) {
        return rigaCompatta(r.nome, "#/magazzino/scheda/" + encodeURIComponent(r.id), ErpFormat.qta(r.giacenza) + " " + esc(r.udm), graficoGiacenza(r.id), false, null, true);
      }, "articoli", false);
    }
    return html;
  }

  function unitaSalvata(ing) {
    if (!ing) return { unita: "", testo: "" };
    const udm = ing.udm === "L" || ing.udm === "pz" ? ing.udm : "kg";
    const unita = udm === "L" ? "L" : (udm === "pz" ? "PZ" : "kg");
    const n = Number(ing.qtaConfezione);
    return { unita: unita, testo: n > 0 ? ErpUnita.testo(n, unita) : "" };
  }

  function categoriaCorrente(ing) {
    const id = ErpEngine.codice(ing.id);
    const elenco = elencoCategorieMerce();
    const sua = maiuscolaIniziale(ing.categoria);
    const nota = elenco.find(function (c) { return c.toLocaleLowerCase("it") === sua.toLocaleLowerCase("it"); });
    if (!modificaIng || modificaIng.id !== id) modificaIng = { id: id, cat: nota || sua || "" };
    if (modificaIng.cat && modificaIng.cat !== "__nuova" && elenco.indexOf(modificaIng.cat) < 0 && modificaIng.cat !== (nota || sua)) {
      modificaIng.cat = nota || sua || "";
    }
    return modificaIng.cat;
  }

  function elencoCategorieMerce() {
    const viste = [];
    function aggiungi(nome) {
      const t = String(nome || "").trim();
      if (!t || t.toLocaleLowerCase("it") === "senza categoria" || t.toLocaleLowerCase("it") === "altro") return;
      const mostra = t.charAt(0).toLocaleUpperCase("it") + t.slice(1);
      if (viste.some(function (v) { return v.toLocaleLowerCase("it") === mostra.toLocaleLowerCase("it"); })) return;
      viste.push(mostra);
    }
    (stato.ingredienti || []).forEach(function (i) { aggiungi(i.categoria); });
    viste.sort(confrontaMerce);
    return viste;
  }

  function campoFormato(unita, valore) {
    const unitaOk = ["g", "kg", "L", "cl", "PZ"].indexOf(unita) >= 0 ? unita : "";
    const tasti = ["g", "kg", "L", "cl", "PZ"].map(function (u) {
      return '<button type="button" class="unita-tasto" data-act="unita-formato" data-unita="' + u + '" aria-pressed="' + (u === unitaOk ? "true" : "false") + '">' + u + "</button>";
    }).join("");
    const modo = unitaOk === "g" || unitaOk === "PZ" ? "numeric" : "decimal";
    const segna = { g: "500", kg: "15", L: "5", cl: "75", PZ: "6" }[unitaOk] || "Scegli l'unità";
    return '<div class="formato-box" role="group" aria-label="Contenuto di una confezione">'
      + '<input name="qta" data-formato="1" data-qta="1" data-unita="' + esc(unitaOk) + '" inputmode="' + modo + '" placeholder="' + segna + '" autocomplete="off" value="' + esc(valore || "") + '"' + (unitaOk ? "" : " disabled") + ">"
      + '<div class="formato-unita">' + tasti + "</div></div>";
  }

  function formSchedaIng(opts) {
    const elenco = elencoCategorieMerce();
    const scelta = opts.scelta || "";
    const nuova = scelta === "__nuova";
    let tasti = elenco.map(function (c) {
      const acceso = c === scelta;
      return '<button type="button" class="cat-tasto" data-act="cat-ing" data-nome="' + esc(c) + '" aria-pressed="' + (acceso ? "true" : "false") + '">' + esc(c) + "</button>";
    }).join("");
    tasti += '<button type="button" class="cat-tasto" data-act="cat-ing" data-nome="__nuova" aria-pressed="' + (nuova ? "true" : "false") + '">Nuova</button>';
    const tempo = opts.tipo === "TEMPO";
    return '<form data-form="ingrediente" class="campi">'
      + (opts.id ? '<input type="hidden" name="id" value="' + esc(opts.id) + '">' : "")
      + '<div class="campo largo"><span>Categoria</span><div class="cat-elenco">' + tasti + "</div></div>"
      + '<div class="campo largo"' + (nuova ? "" : " hidden") + ' id="cat-nuova">'
      + "<span>Nome della categoria</span>"
      + inputTesto("categoria-nuova", opts.categoriaNuova || "", "Ortofrutta", "testo")
      + "</div>"
      + '<div class="campo largo"><span>Codice</span><p class="numero"' + (opts.id ? "" : ' id="codice-visibile"') + ">" + esc(opts.codice || "—") + "</p></div>"
      + campo("Nome", inputTesto("nome", opts.nome || "", "PELATI", "nome"))
      + campo("Consumo", '<select name="tipo"><option value="POS"' + (tempo ? "" : " selected") + '>Da ricetta (POS)</option><option value="TEMPO"' + (tempo ? " selected" : "") + ">A tempo (detersivo, carta)</option></select>")
      + '<div class="campo largo"><span>Contenuto di una confezione</span>'
      + campoFormato(opts.unita || "", opts.qta || "")
      + '<p class="muto">15 e kg sono 15 kg. 500 e g sono 0,5 kg. 75 e cl sono 0,75 L. 6 e PZ sono 6 pezzi.</p></div>'
      + '<label class="campo largo spunta"><input type="checkbox" name="sfuso"' + (opts.sfuso ? " checked" : "") + "> Lo compro a peso, senza colli (carne, prosciutto al taglio)</label>"
      + '<div class="azioni largo"><button type="submit" class="btn btn-rosso">' + esc(opts.invio) + "</button></div>"
      + "</form>";
  }

  function formNuovoIng() {
    const elenco = elencoCategorieMerce();
    if (sceltaCatIng && sceltaCatIng !== "__nuova" && elenco.indexOf(sceltaCatIng) < 0) sceltaCatIng = null;
    const nuova = sceltaCatIng === "__nuova";
    const codice = !sceltaCatIng || nuova
      ? ""
      : ErpCodicePiatto.prossimoCodiceIngrediente(stato.ingredienti, sceltaCatIng, ErpEngine.codice);
    return formSchedaIng({
      scelta: sceltaCatIng,
      codice: codice,
      tipo: "POS",
      invio: "Crea il prodotto",
    });
  }

  function formIngrediente(ing) {
    const scelta = categoriaCorrente(ing);
    const pack = unitaSalvata(ing);
    return formSchedaIng({
      id: ing.id,
      scelta: scelta,
      codice: ing.id,
      nome: ing.nome ? String(ing.nome).toLocaleUpperCase("it") : "",
      tipo: ing.tipo === "TEMPO" ? "TEMPO" : "POS",
      unita: pack.unita,
      qta: pack.testo,
      sfuso: !!ing.acquistoSfuso,
      invio: "Salva anagrafica",
    });
  }

  function ricordaNuovoIng(form) {
    const el = form && form.querySelector("[data-formato]");
    const tipo = form && form.querySelector('[name="tipo"]');
    const nome = form && form.querySelector('[name="nome"]');
    const nuova = form && form.querySelector('[name="categoria-nuova"]');
    const sfuso = form && form.querySelector('[name="sfuso"]');
    return {
      nome: nome ? nome.value : "",
      nuova: nuova ? nuova.value : "",
      tipo: tipo ? tipo.value : "POS",
      sfuso: !!(sfuso && sfuso.checked),
      qta: el ? el.value : "",
      unita: el && el.dataset ? (el.dataset.unita || "") : "",
    };
  }

  function applicaUnitaFormato(form, unita, valore) {
    if (!form || ["g", "kg", "L", "cl", "PZ"].indexOf(unita) < 0) return;
    const box = form.querySelector(".formato-box");
    const input = box && box.querySelector("[data-formato]");
    if (!input) return;
    box.querySelectorAll(".unita-tasto").forEach(function (b) {
      b.setAttribute("aria-pressed", b.dataset.unita === unita ? "true" : "false");
    });
    input.disabled = false;
    input.dataset.unita = unita;
    input.setAttribute("inputmode", unita === "g" || unita === "PZ" ? "numeric" : "decimal");
    input.placeholder = { g: "500", kg: "15", L: "5", cl: "75", PZ: "6" }[unita];
    input.value = valore || "";
  }

  function ripristinaNuovoIng(r) {
    const form = document.querySelector('form[data-form="ingrediente"]');
    if (!form || !r) return;
    const edit = !!form.querySelector('input[type="hidden"][name="id"]');
    const nome = form.querySelector('[name="nome"]');
    const tipo = form.querySelector('[name="tipo"]');
    const nuova = form.querySelector('[name="categoria-nuova"]');
    const sfuso = form.querySelector('[name="sfuso"]');
    if (nome && r.nome) nome.value = r.nome;
    if (tipo && r.tipo) tipo.value = r.tipo;
    if (sfuso) sfuso.checked = !!r.sfuso;
    if (nuova && r.nuova) {
      nuova.value = r.nuova;
      if (!edit) aggiornaCodiceCategoria(r.nuova);
    }
    applicaUnitaFormato(form, r.unita, r.qta);
  }

  function vistaNuovoIng() {
    let html = "<h2>Nuovo prodotto</h2>";
    if (ritornoNuovo) {
      html += '<p class="muto">Lo crei per la fattura ' + esc(ritornoNuovo.numero) + ". Salva e torni su quella riga, già scelto. Indietro non associa nulla.</p>";
    }
    return html + formNuovoIng();
  }

  function tempoPrezzo(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return 0;
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }

  function ggmm(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
    if (!m) return "";
    return m[3] + "/" + m[2];
  }

  function serieAndamento(id) {
    const k = ErpEngine.codice(id);
    const preventivo = [];
    const reale = [];
    (stato.offerte || []).forEach(function (o) {
      if (ErpEngine.codice(o.idIngrediente) !== k) return;
      const prezzo = Number(o.prezzoUdm);
      if (!(prezzo > 0)) return;
      if (String(o.data || "").length < 10) return;
      const punto = {
        data: String(o.data),
        prezzo: prezzo,
        fornitore: String(o.fornitore || "").trim(),
      };
      if (o.tipo === "preventivo") preventivo.push(punto);
      else reale.push(punto);
    });
    const perData = function (a, b) { return String(a.data).localeCompare(String(b.data)); };
    preventivo.sort(perData);
    reale.sort(perData);
    return { preventivo: preventivo, reale: reale };
  }

  function svgAndamento(preventivo, reale) {
    const tutti = preventivo.concat(reale);
    if (!tutti.length) return "";
    const W = 360;
    const H = 210;
    const L = 48;
    const R = 16;
    const T = 16;
    const B = 34;
    const pw = W - L - R;
    const ph = H - T - B;
    let minP = tutti[0].prezzo;
    let maxP = tutti[0].prezzo;
    let minT = tempoPrezzo(tutti[0].data);
    let maxT = minT;
    tutti.forEach(function (p) {
      if (p.prezzo < minP) minP = p.prezzo;
      if (p.prezzo > maxP) maxP = p.prezzo;
      const t = tempoPrezzo(p.data);
      if (t < minT) minT = t;
      if (t > maxT) maxT = t;
    });
    const veroMin = minP;
    const veroMax = maxP;
    if (maxP - minP < 0.05) {
      minP -= 0.15;
      maxP += 0.15;
    } else {
      const pad = (maxP - minP) * 0.22;
      minP -= pad;
      maxP += pad;
    }
    if (minP < 0) minP = 0;
    function x(data) {
      if (maxT === minT) return L + pw / 2;
      return L + ((tempoPrezzo(data) - minT) / (maxT - minT)) * pw;
    }
    function y(prezzo) {
      return T + (1 - (prezzo - minP) / (maxP - minP)) * ph;
    }
    function serie(punti, colore) {
      if (!punti.length) return "";
      let s = "";
      if (punti.length > 1) {
        const d = punti.map(function (p) {
          return x(p.data).toFixed(1) + "," + y(p.prezzo).toFixed(1);
        }).join(" ");
        s += '<polyline points="' + d + '" fill="none" stroke="' + colore + '" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>';
      }
      punti.forEach(function (p) {
        s += '<circle cx="' + x(p.data).toFixed(1) + '" cy="' + y(p.prezzo).toFixed(1) + '" r="5.5" fill="' + colore + '"/>';
      });
      return s;
    }
    const giorni = [];
    tutti.slice().sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); }).forEach(function (p) {
      const g = String(p.data).slice(0, 10);
      if (!giorni.some(function (q) { return q === g; })) giorni.push(g);
    });
    const mostra = giorni.length <= 5 ? giorni : [giorni[0], giorni[giorni.length - 1]];
    let date = "";
    mostra.forEach(function (g) {
      const xx = x(g);
      let ancora = "middle";
      let px = xx;
      if (xx < L + 22) { ancora = "start"; px = L; }
      else if (xx > L + pw - 22) { ancora = "end"; px = L + pw; }
      date += '<text x="' + px.toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + ancora + '" fill="#9eb4d0" font-size="12">' + ggmm(g) + "</text>";
    });
    const base = T + ph;
    const asse = '<line x1="' + L + '" y1="' + base.toFixed(1) + '" x2="' + (L + pw) + '" y2="' + base.toFixed(1) + '" stroke="#2a4a6e"/>';
    const scala = '<text x="' + (L - 8) + '" y="' + (y(veroMax) + 4).toFixed(1) + '" text-anchor="end" fill="#9eb4d0" font-size="12">' + esc(ErpFormat.ita(veroMax, 2)) + "</text>"
      + (Math.abs(veroMax - veroMin) < 0.001 ? "" : '<text x="' + (L - 8) + '" y="' + (y(veroMin) + 4).toFixed(1) + '" text-anchor="end" fill="#9eb4d0" font-size="12">' + esc(ErpFormat.ita(veroMin, 2)) + "</text>");
    return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(testoAndamento(preventivo, reale)) + '">'
      + asse + scala + serie(preventivo, "#34d399") + serie(reale, "#ff9800") + date + "</svg>";
  }

  function testoAndamento(preventivo, reale) {
    function frase(nome, punti) {
      if (!punti.length) return "";
      return nome + ": " + punti.map(function (p) {
        return ggmm(p.data) + " " + (p.fornitore || "") + " " + ErpFormat.euro(p.prezzo);
      }).join(", ");
    }
    return ["Andamento prezzi", frase("Preventivo", preventivo), frase("Reale", reale)].filter(Boolean).join(". ");
  }

  function htmlAndamento(id, udm) {
    const serie = serieAndamento(id);
    const unita = "€/" + (udm || "kg");
    let html = '<p class="etichetta">Andamento ' + esc(unita) + "</p>";
    html += '<div class="andamento">';
    if (!serie.preventivo.length && !serie.reale.length) {
      html += '<p class="muto">Nessun prezzo nel confronto.</p>';
    } else {
      html += svgAndamento(serie.preventivo, serie.reale);
      html += '<p class="leggenda">';
      if (serie.reale.length) html += '<span><i class="leg-reale"></i>Reale</span>';
      if (serie.preventivo.length) html += '<span><i class="leg-prev"></i>Preventivo</span>';
      html += "</p>";
    }
    html += "</div>";
    return html;
  }

  function rigaPrezzo(etichetta, numero, sotto) {
    return '<div class="riga riga-prezzo">'
      + '<span class="riga-nome">' + esc(etichetta) + "</span>"
      + '<span class="riga-num">' + numero + "</span>"
      + '<span class="riga-sotto">' + sotto + "</span></div>";
  }

  function vistaSchedaIng(id) {
    const ing = (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === ErpEngine.codice(id); });
    if (!ing) return '<p class="banner errore">Prodotto non trovato.</p><p><a href="#/magazzino">Torna al magazzino</a></p>';
    const p = ErpEngine.profiloIngrediente(stato, ing.id, oggi());
    let html = '<a class="indietro" href="#/magazzino">Magazzino</a>';
    html += '<div class="riga">'
      + '<span class="riga-nome">Giacenza</span>'
      + '<span class="riga-num">' + ErpFormat.qta(p.giacenza) + " " + esc(p.udm) + "</span>"
      + tastoInfo(graficoGiacenza(ing.id))
      + "</div>";
    html += '<div class="riga">'
      + '<span class="riga-nome">' + (p.tipo === "TEMPO" ? "Al giorno" : "Sfrido") + "</span>"
      + '<span class="riga-num">' + (p.tipo === "TEMPO" ? ErpFormat.qta(p.consumoMedio) : ErpFormat.ita(p.coef, 2)) + "</span>"
      + tastoInfo(p.tipo === "TEMPO"
        ? { titolo: ing.nome, voci: [voce("Al giorno", p.consumoMedio, ErpFormat.qta(p.consumoMedio) + " " + p.udm, "#4d9fff")] }
        : graficoSfrido(ing.id))
      + "</div>";
    html += htmlAndamento(ing.id, p.udm);
    const unita = "/" + p.udm;
    const serie = serieAndamento(ing.id);
    const ultimo = serie.reale.length ? serie.reale[serie.reale.length - 1] : null;
    html += rigaPrezzo(
      "Più conveniente",
      p.prezzo ? ErpFormat.euro(p.prezzo.prezzoUdm) + unita : "—",
      p.prezzo ? p.prezzo.fornitore : "Nessun prezzo"
    );
    html += rigaPrezzo(
      "Ultimo reale",
      ultimo ? ErpFormat.euro(ultimo.prezzo) + unita : "—",
      ultimo ? ErpFormat.dataIT(ultimo.data) + (ultimo.fornitore ? " · " + ultimo.fornitore : "") : "Nessuna fattura"
    );
    html += "<h2>Anagrafica</h2>" + formIngrediente(ing);
    html += '<div class="azioni"><button type="button" class="btn" data-act="archivia" data-id="' + esc(p.id) + '">'
      + (ing.attivo === false ? "Rimetti in uso" : "Archivia") + "</button></div>";
    return html;
  }

  function vistaRicette() {
    const food = ErpEngine.foodCost(stato);
    let html = '<a class="tasto-grosso" href="#/ricette/nuovo">Nuovo piatto</a>';
    const gruppi = raggruppa(food.piatti, function (p) { return categoriaPiattoVisibile(p.categoria); }, function (a, b) { return ordinePiatto(a) - ordinePiatto(b); });
    html += htmlGruppi("ricette", gruppi, function (p) {
      return rigaCompatta(
        nomePiattoVisibile(p.nome),
        "#/ricette/scheda/" + encodeURIComponent(p.id),
        ErpFormat.pct(p.fcIncasso),
        graficoPiatto(p),
        false,
        { tipo: "piatto", id: p.id, domanda: "Eliminare " + p.nome + " e la sua ricetta?" }
      );
    }, "piatti");
    return html;
  }

  function formPiatto(p) {
    const nuovo = !p;
    if (!nuovo) {
      return '<form data-form="piatto" class="campi">'
        + '<input type="hidden" name="id" value="' + esc(p.id) + '">'
        + '<p class="muto largo">Codice <strong>' + esc(p.id) + "</strong></p>"
        + campo("Nome", inputTesto("nome", p.nome, "Margherita", "testo"))
        + campo("Categoria", inputTesto("categoria", p.categoria, "Pizza", "testo"))
        + campo("Prezzo di listino €", inputNum("listino", p.prezzoListino != null ? testoEuro(p.prezzoListino) : "", "8,00", "euro"))
        + '<div class="azioni largo"><button type="submit" class="btn btn-rosso">Salva il piatto</button></div></form>';
    }
    const elenco = elencoCategoriePiatto();
    if (!sceltaCatPiatto || (sceltaCatPiatto !== "__nuova" && elenco.indexOf(sceltaCatPiatto) < 0)) {
      const pizza = elenco.find(function (c) { return c.toLocaleLowerCase("it") === "pizza"; });
      sceltaCatPiatto = pizza || elenco[0] || "__nuova";
    }
    const nuova = sceltaCatPiatto === "__nuova";
    const codice = nuova ? "" : ErpCodicePiatto.prossimoCodice(stato.piatti, sceltaCatPiatto, ErpEngine.codice);
    let tasti = elenco.map(function (c) {
      const acceso = c === sceltaCatPiatto;
      return '<button type="button" class="cat-tasto" data-act="cat-piatto" data-nome="' + esc(c) + '" aria-pressed="' + (acceso ? "true" : "false") + '">' + esc(c) + "</button>";
    }).join("");
    tasti += '<button type="button" class="cat-tasto" data-act="cat-piatto" data-nome="__nuova" aria-pressed="' + (nuova ? "true" : "false") + '">Nuova</button>';
    return '<form data-form="piatto" class="campi">'
      + '<div class="campo largo"><span>Codice</span><p class="numero" id="codice-visibile">' + esc(codice || "—") + "</p></div>"
      + campo("Nome", inputTesto("nome", "", "Margherita", "testo"))
      + '<div class="campo largo"><span>Categoria</span><div class="cat-elenco">' + tasti + "</div></div>"
      + '<div class="campo largo"' + (nuova ? "" : " hidden") + ' id="cat-nuova">'
      + "<span>Nome della categoria</span>"
      + inputTesto("categoria-nuova", "", "Dolci", "testo")
      + "</div>"
      + campo("Prezzo di listino €", inputNum("listino", "", "8,00", "euro"))
      + '<div class="azioni largo"><button type="submit" class="btn btn-rosso">Crea il piatto</button></div></form>';
  }

  function vistaSchedaPiatto(id) {
    const p = (stato.piatti || []).find(function (x) { return ErpEngine.codice(x.id) === ErpEngine.codice(id); });
    if (!p) return '<p class="banner errore">Piatto non trovato.</p>';
    const food = ErpEngine.foodCost(stato).piatti.find(function (x) { return x.id === ErpEngine.codice(p.id); });
    let html = '<a class="indietro" href="#/ricette">Ricette</a>';
    if (food) {
      html += '<div class="riga riga-piatto">'
        + '<span class="riga-nome">' + esc(p.nome) + "</span>"
        + '<span class="riga-num">' + ErpFormat.pct(food.fcIncasso) + "</span>"
        + tastoInfo(graficoPiatto(food))
        + "</div>";
      html += '<div class="sotto">' + food.righe.map(function (r) {
        const costo = r.prezzoUdm == null ? "—" : ErpFormat.euro(r.costoTeorico);
        return '<div class="scorri" data-togli="riga" data-piatto="' + esc(p.id) + '" data-ing="' + esc(r.id) + '" data-nome="' + esc(r.nome) + '" data-domanda="' + esc("Togliere " + r.nome + " dalla ricetta?") + '">'
          + '<div class="scorri-fondo" aria-hidden="true">Togli</div>'
          + '<div class="riga riga-figlio scorri-faccia">'
          + '<a class="riga-nome nome-ing" href="#/magazzino/scheda/' + encodeURIComponent(r.id) + '">' + esc(r.nome) + "</a>"
          + '<span class="riga-num">' + ErpFormat.qta(r.quantita) + " " + esc(r.udm) + "</span>"
          + '<span class="riga-euro">' + costo + "</span>"
          + tastoInfo(graficoRigaPiatto(r))
          + "</div></div>";
      }).join("") + "</div>";
    }
    if (!(stato.ingredienti || []).length) html += '<p class="muto">Prima serve un prodotto in magazzino.</p>';
    else {
      html += '<form data-form="riga" class="campi"><input type="hidden" name="piatto" value="' + esc(p.id) + '">'
        + campo("Aggiungi", '<select name="ing">' + opzioniIngredienti() + "</select>")
        + campoQuantita("Quantità in ricetta", "qta", udmIng(primoIdIngrediente()), "")
        + '<div class="azioni largo"><button type="submit" class="btn">Aggiungi</button></div></form>';
    }
    html += "<h2>Piatto</h2>" + formPiatto(p);
    html += '<div class="azioni"><button type="button" class="btn" data-act="elimina-piatto" data-id="' + esc(p.id) + '">Elimina il piatto</button></div>';
    return html;
  }

  function foodPiatto(id) {
    const trovato = ErpEngine.foodCost(stato).piatti.find(function (p) {
      return p.id === ErpEngine.codice(id);
    });
    return trovato || { nome: nomePiatto(id), costoReale: null };
  }

  function colliTesto(n) {
    const x = Number(n);
    if (!Number.isFinite(x) || x <= 0) return "";
    const t = ErpFormat.qta(x);
    return t + (Math.abs(x - 1) < 1e-9 ? " collo" : " colli");
  }

  function fraseCaricoMano(b) {
    const nome = String(b.nome || "").toLocaleUpperCase("it");
    const qta = ErpFormat.qta(b.quantita) + (b.udm ? " " + b.udm : "");
    const prezzo = ErpFormat.euro(b.prezzo) + (b.udm ? "/" + b.udm : "");
    return "Entrano " + qta + " di " + nome + " da " + b.fornitore + " a " + prezzo;
  }

  function vistaCaricoMano() {
    const b = bozzaMano;
    const scelto = b ? b.id : "";
    const ing = (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === ErpEngine.codice(scelto); });
    const udm = ing ? (ing.udm === "L" || ing.udm === "pz" ? ing.udm : "kg") : "kg";
    const opzioni = '<option value="">Scegli il prodotto</option>' + (stato.ingredienti || []).filter(function (i) { return i.attivo !== false; })
      .slice().sort(function (a, c) { return String(a.nome).localeCompare(String(c.nome), "it"); })
      .map(function (i) {
        const sel = ErpEngine.codice(i.id) === ErpEngine.codice(scelto) ? " selected" : "";
        return '<option value="' + esc(i.id) + '"' + sel + ">" + esc(String(i.nome || i.id).toLocaleUpperCase("it")) + "</option>";
      }).join("");
    let html = '<p class="muto">Merce pagata senza fattura. Entra in magazzino e non cambia il confronto dei prezzi.</p>';
    html += '<form data-form="mano" class="campi">';
    html += campo("Articolo", '<select class="lista-ing" name="ing">' + opzioni + "</select>", true);
    html += campo("Fornitore", inputTesto("fornitore", b ? b.fornitore : "", "Biancalani", "testo"));
    html += campo("Data", '<input name="data" type="date" value="' + esc(b ? b.data : oggi()) + '" required>');
    html += campoQuantita("Quantità", "qta", ing ? udm : "", b ? b.quantita : "");
    html += '<label class="campo"><span data-prezzo-label="1">' + esc(testoPrezzoUdm(udm)) + "</span>"
      + inputNum("prezzo", b && b.prezzo != null ? testoEuro(b.prezzo) : "", "110", "euro") + "</label>";
    html += '<div class="azioni largo"><button type="submit" class="tasto-grosso">Controlla</button></div></form>';
    if (b && !b.stale) {
      html += '<div id="mano-ok"><p class="frase-mano">Entrano <b>' + esc(ErpFormat.qta(b.quantita) + (b.udm ? " " + b.udm : "")) + "</b> di "
        + '<span class="nome-ing">' + esc(b.nome) + "</span> da " + esc(b.fornitore) + " a <b>"
        + esc(ErpFormat.euro(b.prezzo) + (b.udm ? "/" + b.udm : "")) + "</b></p>";
      html += '<button type="button" class="tasto-grosso" data-act="conferma-mano">Conferma</button></div>';
    }
    const fatti = (stato.carichi || []).filter(function (c) { return c.diretto; })
      .slice().sort(function (a, c) { return String(c.at).localeCompare(String(a.at)); }).slice(0, 20);
    if (fatti.length) {
      html += "<h2>Senza fattura</h2>";
      html += '<p class="muto">Per toglierne uno, scorri la riga.</p>';
      html += fatti.map(rigaCaricoEntrato).join("");
    }
    return html;
  }

  function allineaOffertaDelCarico(c) {
    const collegate = (stato.offerte || []).filter(function (o) { return o.origine === c.id; });
    if (c.diretto || !(c.prezzoUdm > 0) || !c.fornitore) {
      if (collegate.length) stato.offerte = (stato.offerte || []).filter(function (o) { return o.origine !== c.id; });
      return;
    }
    if (collegate.length) {
      collegate.forEach(function (o) {
        o.idIngrediente = ErpEngine.codice(c.idIngrediente);
        o.fornitore = c.fornitore;
        o.prezzoUdm = c.prezzoUdm;
        o.data = c.at;
        o.qtaConfezione = c.qtaConfezione || 0;
      });
      return;
    }
    ErpAzioni.registraOfferta(stato, {
      idIngrediente: c.idIngrediente,
      fornitore: c.fornitore,
      tipo: "fattura",
      data: c.at,
      prezzoUdm: c.prezzoUdm,
      qtaConfezione: c.qtaConfezione,
      origine: c.id,
    });
  }

  function formModificaCarico(c) {
    const ing = (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === ErpEngine.codice(c.idIngrediente); });
    const udm = ing ? (ing.udm === "L" || ing.udm === "pz" ? ing.udm : "kg") : "kg";
    const opzioni = (stato.ingredienti || []).filter(function (i) {
      return i.attivo !== false || ErpEngine.codice(i.id) === ErpEngine.codice(c.idIngrediente);
    }).slice().sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), "it"); })
      .map(function (i) {
        const sel = ErpEngine.codice(i.id) === ErpEngine.codice(c.idIngrediente) ? " selected" : "";
        return '<option value="' + esc(i.id) + '"' + sel + ">" + esc(String(i.nome || i.id).toLocaleUpperCase("it")) + "</option>";
      }).join("");
    const giorno = String(c.at || "").slice(0, 10);
    return '<form data-form="modifica-carico" class="campi blocco-fattura" data-unita="' + esc(udm) + '">'
      + '<input type="hidden" name="id" value="' + esc(c.id) + '">'
      + campo("Articolo", '<select class="lista-ing" name="ing">' + opzioni + "</select>", true)
      + campoQuantita("Quantità", "qta", udm, c.quantita)
      + '<label class="campo"><span data-prezzo-label="1">' + esc(testoPrezzoUdm(udm)) + "</span>"
      + inputNum("prezzo", c.prezzoUdm != null ? testoEuro(c.prezzoUdm) : "", "110", "euro") + "</label>"
      + campo("Fornitore", inputTesto("fornitore", c.fornitore, "Biancalani", "testo"))
      + campo("Data", '<input name="data" type="date" value="' + esc(giorno) + '">')
      + '<div class="azioni largo"><button type="submit" class="tasto-grosso">Salva</button>'
      + '<button type="button" class="tasto-grosso tasto-chiaro" data-act="annulla-carico">Annulla</button></div></form>';
  }

  function rigaCaricoEntrato(c) {
    if (caricoAperto === c.id) return formModificaCarico(c);
    const nome = nomeIng(c.idIngrediente);
    const udm = udmIng(c.idIngrediente);
    const qta = ErpFormat.qta(c.quantita) + (udm ? " " + udm : "");
    const giorno = ErpFormat.dataIT(String(c.at || "").slice(0, 10));
    const fornitore = c.fornitore || "Senza fornitore";
    const faccia = '<span class="riga-nome nome-ing">' + esc(nome) + "</span>"
      + '<span class="riga-num">' + esc(qta) + "</span>"
      + '<span class="riga-meta">' + esc(fornitore) + (giorno ? " · " + esc(giorno) : "") + "</span>"
      + '<button type="button" class="btn" data-act="modifica-carico" data-id="' + esc(c.id) + '">Modifica</button>';
    return rigaTogli(
      "carico",
      c.id,
      "Togliere il carico di " + String(nome).toLocaleUpperCase("it") + ", " + qta + "?",
      faccia,
      "riga-carico"
    );
  }

  function listaCarichiFattura() {
    const lista = (stato.carichi || []).slice().sort(function (a, b) { return String(b.at).localeCompare(String(a.at)); });
    let html = "<h2>Già in magazzino</h2>";
    if (!lista.length) return html + '<p class="muto">Nessun carico in magazzino.</p>';
    html += '<p class="muto">Modifica corregge una riga sbagliata. Scorri per toglierla dal magazzino.</p>';
    return html + lista.map(rigaCaricoEntrato).join("");
  }

  function nomeMittente(s) {
    const t = String(s || "").replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
    return t || "Senza mittente";
  }

  function mailGiaVista(p) {
    const id = (mailVisti && mailVisti.id) || [];
    if (p.messageId && id.indexOf("m:" + p.messageId) >= 0) return true;
    if (p.id && id.indexOf("s:" + p.id) >= 0) return true;
    return false;
  }

  function paginaFattura() {
    const r = route();
    return r.name === "fattura" && r.a !== "mano";
  }

  function htmlPosta() {
    let html = '<p class="muto">Ogni mattina alle 7, ora di Roma, Google controlla vicodelcarmine1@gmail.com e mette il PDF Metro nella cartella Drive Fatture Metro. Qui lo vedi quando apri la pagina. Carica solo se premi Carica.</p>';
    html += '<button type="button" class="tasto-grosso" data-act="mail-aggiorna">Aggiorna</button>';
    if (mailInCorso && !mailVista) {
      html += '<p class="muto">Sto guardando la cartella Fatture Metro…</p>';
      return html;
    }
    if (!mailVista || mailVista.ok === false) {
      html += '<p class="banner errore">' + esc((mailVista && mailVista.errore) || "Non raggiungo la cartella Drive Fatture Metro.") + "</p>";
      return html;
    }
    const caselle = (mailVista.caselle || []).filter(Boolean);
    html += '<p class="muto">Solo i PDF che Google ha messo in Fatture Metro, dalla casella ' + esc(caselle[0] || "vicodelcarmine1@gmail.com")
      + ". Prima controlli le righe, poi le carichi.</p>";
    const lista = (mailVista.pdf || []).filter(function (p) { return !p.nascosto && !mailGiaVista(p); });
    if (!lista.length) {
      html += '<p class="muto">' + esc((mailVista && mailVista.messaggio) || "Nessuna mail nuova.") + "</p>";
      return html;
    }
    html += '<p class="etichetta">' + lista.length + " PDF da controllare</p>";
    lista.forEach(function (p) {
      html += '<article class="blocco-fattura">';
      html += '<p class="etichetta">' + esc(p.data ? ErpFormat.dataIT(p.data) : "Senza data") + "</p>";
      html += '<p class="riga-nome">' + esc(nomeMittente(p.mittente)) + "</p>";
      if (p.oggetto) html += '<p class="muto">' + esc(p.oggetto) + "</p>";
      html += '<p class="letto">' + esc(p.nome || "PDF") + "</p>";
      if (!p.letto) html += '<p class="muto">Leggo il PDF…</p>';
      else if (!p.letto.ok) html += '<p class="banner errore">' + esc(p.letto.errore || "Questa non è una fattura Metro.") + "</p>";
      else if (p.letto.numero) html += '<a class="tasto-grosso" href="#/fattura/scheda/' + encodeURIComponent(p.letto.numero) + '">Apri la fattura</a>';
      else html += '<button type="button" class="tasto-grosso" data-act="apri-mail" data-id="' + esc(p.id) + '">Controlla</button>';
      html += "</article>";
    });
    return html;
  }

  function elencoFatture() {
    if (!Array.isArray(stato.fatture)) stato.fatture = [];
    return stato.fatture;
  }

  function trovaFattura(numero) {
    const n = String(numero || "");
    return elencoFatture().find(function (f) { return String(f.numero || "") === n; }) || null;
  }

  function rigaGiaAssociata(r) {
    if (!r || r.caricata) return false;
    if (r.idMaster && r.idMaster !== "__nuovo") return true;
    if (r.idMaster === "__nuovo" && ErpEngine.codice(r.codiceNuovo)) return true;
    return false;
  }

  function contiFattura(f) {
    const righe = (f && f.righe) || [];
    let caricate = 0;
    let daAssociare = 0;
    let escluse = 0;
    righe.forEach(function (r) {
      if (r.caricata) caricate += 1;
      else if (r.esclusa) escluse += 1;
      else if (!rigaGiaAssociata(r)) daAssociare += 1;
    });
    return { caricate: caricate, daAssociare: daAssociare, escluse: escluse, totale: righe.length };
  }

  function differenzaFattura(f) {
    if (!f || f.imponibile == null || f.sommaRighe == null) return null;
    const d = Math.round((Number(f.sommaRighe) - Number(f.imponibile)) * 100) / 100;
    return Number.isFinite(d) ? d : null;
  }

  function caricoPerRigaFattura(fattura, riga) {
    const numero = String(fattura.numero || "");
    const codice = String(riga.codice || riga.gtin || "");
    if (!numero || !codice) return null;
    return (stato.carichi || []).find(function (c) {
      const nota = String(c.note || "");
      return nota.indexOf(numero) >= 0 && nota.indexOf(codice) >= 0;
    }) || null;
  }

  function copiaRigaFattura(r, precedente) {
    const prec = precedente || null;
    return {
      descrizione: r.descrizione || (prec && prec.descrizione) || "",
      codice: r.codice || (prec && prec.codice) || "",
      gtin: r.gtin || (prec && prec.gtin) || "",
      qta: r.qta == null ? (prec ? prec.qta : null) : r.qta,
      udm: r.udm || (prec && prec.udm) || "",
      prezzoUdm: r.prezzoUdm == null ? (prec ? prec.prezzoUdm : null) : r.prezzoUdm,
      qtaConfezione: r.qtaConfezione || (prec && prec.qtaConfezione) || 0,
      colli: r.colli == null ? (prec ? prec.colli : null) : r.colli,
      pezzi: r.pezzi == null ? (prec ? prec.pezzi : null) : r.pezzi,
      prezzo: r.prezzo == null ? (prec ? prec.prezzo : null) : r.prezzo,
      importo: r.importo == null ? (prec ? prec.importo : null) : r.importo,
      qtaFattura: r.qtaFattura == null ? (prec ? prec.qtaFattura : null) : r.qtaFattura,
      udmFattura: r.udmFattura || (prec && prec.udmFattura) || "",
      pesoVariabile: r.pesoVariabile != null ? !!r.pesoVariabile : !!(prec && prec.pesoVariabile),
      anomala: r.anomala != null ? !!r.anomala : !!(prec && prec.anomala),
      nota: r.nota || (prec && prec.nota) || "",
      scontoValore: r.scontoValore == null ? (prec ? prec.scontoValore : null) : r.scontoValore,
      scontoPct: r.scontoPct == null ? (prec ? prec.scontoPct : null) : r.scontoPct,
      idMaster: (prec && prec.idMaster) || "",
      codiceNuovo: (prec && prec.codiceNuovo) || "",
      caricata: !!(prec && prec.caricata),
      esclusa: !!(prec && prec.esclusa),
      caricoId: (prec && prec.caricoId) || "",
    };
  }

  function accogliFattura(fattura) {
    if (!fattura || !(fattura.righe || []).length || !fattura.numero) return null;
    const lista = elencoFatture();
    const salvata = trovaFattura(fattura.numero);
    const vecchie = salvata ? (salvata.righe || []) : [];
    const righe = fattura.righe.map(function (r) {
      const prec = vecchie.find(function (v) {
        if (r.codice && v.codice && String(v.codice) === String(r.codice)) return true;
        if (r.gtin && v.gtin && String(v.gtin) === String(r.gtin)) return true;
        return false;
      }) || null;
      const copia = copiaRigaFattura(r, prec);
      if (!copia.caricata) {
        const carico = caricoPerRigaFattura(fattura, copia);
        if (carico) {
          copia.caricata = true;
          copia.caricoId = carico.id;
          copia.idMaster = carico.idIngrediente;
        } else if (!copia.idMaster) {
          const noto = ErpCodici.trova(stato.codici || [], {
            ean: copia.gtin,
            codice: copia.codice,
            fornitore: fattura.fornitore || "Metro",
          });
          if (noto.id) copia.idMaster = noto.id;
        }
      }
      return copia;
    });
    const doc = {
      fornitore: fattura.fornitore || (salvata && salvata.fornitore) || "Metro",
      numero: fattura.numero,
      data: fattura.data || (salvata && salvata.data) || "",
      imponibile: fattura.imponibile != null ? fattura.imponibile : (salvata ? salvata.imponibile : null),
      sommaRighe: fattura.sommaRighe != null ? fattura.sommaRighe : (salvata ? salvata.sommaRighe : null),
      nomeFile: fattura.nomeFile || (salvata && salvata.nomeFile) || "",
      righe: righe,
    };
    if (salvata) lista[lista.indexOf(salvata)] = doc;
    else lista.push(doc);
    stato.fatture = lista;
    return doc;
  }

  function fraseContiFattura(c) {
    const escluse = c.escluse === 1 ? "1 esclusa" : (c.escluse || 0) + " escluse";
    return c.caricate + " caricate · " + c.daAssociare + " da associare · " + escluse;
  }

  function htmlListaFatture() {
    const lista = elencoFatture().slice().sort(function (a, b) {
      return String(b.data || "").localeCompare(String(a.data || "")) || String(b.numero || "").localeCompare(String(a.numero || ""));
    });
    let html = "<h2>Fatture arrivate</h2>";
    if (!lista.length) return html + '<p class="muto">Nessuna fattura arrivata.</p>';
    html += '<p class="muto">Restano in questo elenco anche nei giorni dopo.</p>';
    lista.forEach(function (f) {
      const c = contiFattura(f);
      html += '<a class="blocco-fattura fattura-lista" href="#/fattura/scheda/' + encodeURIComponent(f.numero || "") + '">';
      html += '<p class="etichetta">' + esc(f.fornitore || "Metro") + "</p>";
      html += '<p class="riga-nome">' + esc(f.numero || "Senza numero") + "</p>";
      if (f.imponibile != null) html += '<p class="numero">' + ErpFormat.euro(f.imponibile) + "</p>";
      html += '<p class="letto">' + (f.data ? esc(ErpFormat.dataIT(f.data)) : "Senza data") + "</p>";
      html += '<p class="muto">' + fraseContiFattura(c) + "</p>";
      html += "</a>";
    });
    return html;
  }

  function htmlRigaFattura(f, r, i) {
    const master = r.idMaster && r.idMaster !== "__nuovo" ? masterDi(r.idMaster) : null;
    const eff = ErpMetro.effettoCarico(r, master || (r.idMaster === "__nuovo" ? masterPerCarico(r) : null));
    const letto = [];
    if (r.colli) letto.push(colliTesto(r.colli));
    if (r.pesoVariabile && r.qtaFattura != null) letto.push(ErpFormat.qta(r.qtaFattura) + " kg");
    else if (r.qtaFattura != null && !(r.colli && Math.abs(r.qtaFattura - r.colli) <= 0.02)) {
      letto.push(ErpFormat.qta(r.qtaFattura) + (r.udmFattura ? " " + r.udmFattura : ""));
    }
    if (r.prezzo != null) letto.push(ErpFormat.euro(r.prezzo));
    if (r.importo != null) letto.push("totale " + ErpFormat.euro(r.importo));
    let corpo = '<p class="riga-nome">' + esc(r.descrizione || "Riga non letta") + "</p>";
    if (r.gtin) corpo += '<p class="muto">Codice a barre ' + esc(r.gtin) + "</p>";
    if (r.codice && ErpCodici.eEan(r.codice) && !r.gtin) corpo += '<p class="muto">Codice a barre ' + esc(r.codice) + "</p>";
    else if (r.codice) corpo += '<p class="muto">Codice Metro ' + esc(r.codice) + "</p>";
    if (letto.length) corpo += '<p class="letto">In fattura: ' + esc(letto.join(" · ")) + "</p>";
    if (r.qta != null && r.udm) {
      corpo += '<p class="numero">' + ErpFormat.qta(r.qta) + " " + esc(r.udm) + "</p>";
      if (r.prezzoUdm != null) corpo += '<p class="letto">' + ErpFormat.euro(r.prezzoUdm) + " / " + esc(r.udm) + (r.qtaConfezione > 0 ? " · confezione " + ErpFormat.qta(r.qtaConfezione) + " " + esc(r.udm) : "") + "</p>";
    } else if (r.nota) corpo += '<p class="fuori">' + esc(r.nota) + "</p>";
    if (r.scontoValore != null) corpo += '<p class="muto">Sconto ' + ErpFormat.euro(r.scontoValore) + " a collo, non scalato dal prezzo.</p>";
    if (r.scontoPct != null) corpo += '<p class="muto">Sconto ' + esc(ErpFormat.qta(r.scontoPct)) + "%, non scalato dal prezzo.</p>";
    if (r.caricata) {
      const nome = master ? master.nome : nomeIng(r.idMaster);
      corpo += '<p class="entra">Già caricata in <span class="nome-ing">' + esc(nome || r.idMaster || "") + "</span></p>";
      corpo += '<p class="muto">Non la rimetto una seconda volta.</p>';
      return '<article class="blocco-fattura">' + corpo + "</article>";
    }
    if (r.esclusa) {
      corpo += '<p class="fuori">Esclusa dal carico. Resta in fattura e non entra in magazzino.</p>';
      corpo += '<button type="button" class="tasto-grosso tasto-escludi" data-act="fattura-escludi" data-riga="' + i + '">Rimetti</button>';
      return '<article class="blocco-fattura" id="riga-fattura-' + i + '">' + corpo + "</article>";
    }
    if (eff.entra && master) corpo += '<p class="entra">Pronta per <span class="nome-ing">' + esc(master.nome) + "</span>. Entra solo se premi Carica.</p>";
    else if (!r.idMaster || r.idMaster === "__nuovo") corpo += '<p class="fuori">Da associare. Scegli l\'articolo, poi carica.</p>';
    else corpo += '<p class="fuori">' + esc(eff.motivo || "Da associare.") + "</p>";
    corpo += htmlSceltaFattura(f, r, i);
    return '<article class="blocco-fattura" id="riga-fattura-' + i + '">' + corpo + "</article>";
  }

  function htmlSceltaFattura(f, r, i) {
    const aperto = !!(menuFattura && menuFattura.numero === f.numero && menuFattura.riga === i);
    const master = r.idMaster && r.idMaster !== "__nuovo" ? masterDi(r.idMaster) : null;
    let html = '<div class="coppia-fattura">';
    html += '<button type="button" class="tasto-grosso tasto-chiaro" data-act="fattura-menu" data-riga="' + i + '" aria-expanded="' + (aperto ? "true" : "false") + '">';
    html += master ? '<span class="nome-ing">' + esc(master.nome) + "</span>" : "Scegli il prodotto";
    html += "</button>";
    html += '<button type="button" class="tasto-grosso tasto-escludi" data-act="fattura-escludi" data-riga="' + i + '">Escludi dal carico</button>';
    html += "</div>";
    if (!aperto) return html;
    const vivi = (stato.ingredienti || []).filter(function (ing) { return ing.attivo !== false; });
    const gruppi = raggruppa(vivi, function (ing) { return categoriaMerce(ing.categoria); }, confrontaMerce);
    gruppi.forEach(function (g) {
      g.righe.sort(function (a, b) { return String(a.nome).localeCompare(String(b.nome), "it"); });
    });
    const pagina = "fattura-scelta-" + i;
    html += htmlGruppi(pagina, gruppi, function (ing) {
      const scelto = master && ErpEngine.codice(ing.id) === ErpEngine.codice(master.id);
      return '<button type="button" class="riga scelta-art" data-act="fattura-scegli" data-riga="' + i + '" data-id="' + esc(ing.id) + '">'
        + '<span class="riga-nome nome-ing">' + esc(ing.nome) + "</span>"
        + (scelto ? '<span class="entra">Scelto</span>' : "")
        + "</button>";
    }, "articoli", false);
    html += '<button type="button" class="tasto-grosso" data-act="fattura-nuovo" data-riga="' + i + '">Nuovo prodotto</button>';
    return html;
  }

  function htmlSchedaFattura(f) {
    bozzaFattura = f;
    const conti = contiFattura(f);
    const diff = differenzaFattura(f);
    let html = '<a class="indietro" href="#/fattura">Fatture</a>';
    html += '<p class="etichetta">' + esc(f.fornitore || "Metro") + (f.numero ? " · " + esc(f.numero) : "") + (f.data ? " · " + esc(ErpFormat.dataIT(f.data)) : "") + "</p>";
    html += '<div class="blocco-fattura">';
    html += '<p class="etichetta">Imponibile</p>';
    html += '<p class="numero">' + (f.imponibile != null ? ErpFormat.euro(f.imponibile) : "—") + "</p>";
    html += '<p class="etichetta">Somma righe</p>';
    html += '<p class="numero">' + (f.sommaRighe != null ? ErpFormat.euro(f.sommaRighe) : "—") + "</p>";
    html += '<p class="etichetta">Differenza</p>';
    html += '<p class="numero differenza">' + (diff != null ? ErpFormat.euro(Math.abs(diff)) : "—") + "</p>";
    if (diff != null && Math.abs(diff) > 0.05) {
      html += '<p class="fuori">La somma delle righe non torna con l\'imponibile. Controlla, poi decidi tu se caricare.</p>';
    }
    html += "</div>";
    html += '<p class="muto">' + fraseContiFattura(conti) + ". Le già caricate non entrano di nuovo. Le escluse restano in fattura.</p>";
    html += (f.righe || []).map(function (r, i) { return htmlRigaFattura(f, r, i); }).join("");
    const pronte = (f.righe || []).filter(function (r) {
      if (r.caricata || r.esclusa) return false;
      const master = r.idMaster === "__nuovo" ? masterPerCarico(r) : masterDi(r.idMaster);
      return ErpMetro.effettoCarico(r, master || null).entra;
    }).length;
    if (pronte) {
      html += '<p class="muto">' + pronte + (pronte === 1 ? " riga pronta." : " righe pronte.") + " Le altre restano in fattura finché non le associ.</p>";
      html += '<button type="button" class="tasto-grosso" data-act="carica-fattura">Carica nel magazzino</button>';
    }
    return html;
  }

  function vistaFatturaScheda(numero) {
    const f = trovaFattura(numero);
    if (!f) return '<p class="banner errore">Questa fattura non è nell\'elenco.</p><a class="indietro" href="#/fattura">Fatture</a>';
    return htmlSchedaFattura(f);
  }

  function vistaFattura() {
    if (route().a === "mano") return vistaCaricoMano();
    if (route().a === "scheda") return vistaFatturaScheda(route().b);
    if (!mailVista && !mailInCorso) {
      mailInCorso = true;
      scaricaMail(false);
    }
    let html = htmlListaFatture();
    html += htmlPosta();
    html += '<label class="tasto-grosso">Scegli il PDF Metro<input id="file-fattura" type="file" accept="application/pdf,.pdf" hidden></label>';
    html += '<a class="tasto-grosso tasto-chiaro" href="#/fattura/mano">Senza fattura</a>';
    if (bozzaFattura && bozzaFattura.errore && !(bozzaFattura.righe || []).length) {
      html += '<p class="banner errore">' + esc(bozzaFattura.errore) + "</p>";
    }
    html += '<p class="muto">Leggo solo le fatture Metro. Le righe le associ tu, poi le carichi.</p>';
    return html + listaCarichiFattura();
  }

  function qtaCassa(n) {
    const x = Math.round(Number(n) * 1000) / 1000;
    if (!Number.isFinite(x)) return "—";
    const vicina = Math.abs(x * 1000 - Math.round(x * 100) * 10) < 1e-6;
    return ErpFormat.ita(x, vicina ? 2 : 3);
  }

  function nomePiattoVisibile(nome) {
    const t = String(nome || "").trim().toLocaleLowerCase("it");
    if (!t) return "";
    return t.charAt(0).toLocaleUpperCase("it") + t.slice(1);
  }

  function compattaNome(nome) {
    return String(nome || "").toLocaleLowerCase("it").replace(/[^a-z0-9àèéìòù]/g, "");
  }

  function piattoPerRigaPos(riga) {
    const id = ErpEngine.codice(riga.idPiatto);
    const piatti = stato.piatti || [];
    if (id) {
      const perId = piatti.find(function (p) { return ErpEngine.codice(p.id) === id; });
      if (perId) return perId;
    }
    const nome = compattaNome(riga.descrizione || "");
    if (nome.length < 3) return null;
    const uguali = piatti.filter(function (p) { return compattaNome(p.nome) === nome; });
    return uguali.length === 1 ? uguali[0] : null;
  }

  function vistaCassa() {
    if (!cassaVista && !cassaInCorso) {
      cassaInCorso = true;
      scaricaCassa(false);
    }
    let html = '<p class="etichetta">Chiusure del Drive</p>';
    html += '<button type="button" class="tasto-grosso" data-act="cassa-aggiorna">Aggiorna dal Drive</button>';
    if (cassaInCorso && !cassaVista) {
      html += '<p class="muto">Sto leggendo il foglio Drive…</p>';
      return html;
    }
    if (!cassaVista || !cassaVista.ok) {
      html += '<p class="banner errore">' + esc((cassaVista && cassaVista.errore) || "Non raggiungo il foglio Drive.") + "</p>";
      return html;
    }
    const fogli = cassaVista.fogli || [];
    if (!fogli.length) {
      html += '<p class="banner">Nel foglio Drive non ci sono vendite.</p>';
      return html;
    }
    html += '<p class="muto">' + fogli.length + " chiusure sul Drive. Una riga già entrata non si scarica due volte.</p>";
    if (cassaVista.errore) html += '<p class="fuori">' + esc(cassaVista.errore) + "</p>";
    const mesi = mesiDelleChiusure(fogli);
    if (!mesiAperti) {
      mesiAperti = {};
      const primo = mesi.find(function (m) { return m.chiave !== "0000-00"; }) || mesi[0];
      if (primo) mesiAperti[primo.chiave] = true;
    }
    mesi.forEach(function (m) { html += htmlMese(m); });
    return html;
  }

  function spostaGiorno(iso, delta) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) return "";
    const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    dt.setUTCDate(dt.getUTCDate() + delta);
    const z = function (n) { return String(n).padStart(2, "0"); };
    return dt.getUTCFullYear() + "-" + z(dt.getUTCMonth() + 1) + "-" + z(dt.getUTCDate());
  }

  function buchiMese(dateAsc) {
    const buchi = [];
    for (let i = 1; i < dateAsc.length; i++) {
      let d = spostaGiorno(dateAsc[i - 1], 1);
      while (d && d < dateAsc[i]) {
        buchi.push(d);
        d = spostaGiorno(d, 1);
      }
    }
    return buchi;
  }

  function mesiDelleChiusure(fogli) {
    const mesi = new Map();
    (fogli || []).forEach(function (f) {
      const data = String(f.data || "");
      const chiave = /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.slice(0, 7) : "0000-00";
      if (!mesi.has(chiave)) mesi.set(chiave, new Map());
      const giorno = chiave === "0000-00" ? "senza" : data;
      const giorni = mesi.get(chiave);
      if (!giorni.has(giorno)) giorni.set(giorno, []);
      giorni.get(giorno).push(f);
    });
    return Array.from(mesi.keys()).sort().reverse().map(function (chiave) {
      const giorni = mesi.get(chiave);
      const date = Array.from(giorni.keys()).filter(function (d) { return d !== "senza"; }).sort();
      return {
        chiave: chiave,
        giorni: giorni,
        date: date,
        buchi: chiave === "0000-00" ? [] : buchiMese(date),
      };
    });
  }

  function nomeMese(chiave) {
    const nomi = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const m = /^(\d{4})-(\d{2})$/.exec(chiave);
    if (!m) return "Senza data";
    return nomi[Number(m[2]) - 1] + " " + m[1];
  }

  function testoMancano(n) {
    if (n === 1) return "manca 1 giorno";
    return "mancano " + n + " giorni";
  }

  function htmlMese(m) {
    const aperto = !!mesiAperti[m.chiave];
    let html = '<article class="blocco-fattura">';
    html += '<button type="button" class="mese-tasto" data-act="mese" data-id="' + esc(m.chiave) + '" aria-expanded="' + (aperto ? "true" : "false") + '">'
      + '<span class="mese-nome">' + esc(nomeMese(m.chiave)) + "</span>";
    if (m.buchi.length) html += '<span class="manca-segno">' + esc(testoMancano(m.buchi.length)) + "</span>";
    html += '<span class="consumi-freccia" aria-hidden="true">' + (aperto ? "▾" : "▸") + "</span></button>";
    if (aperto) {
      html += '<div class="mese-corpo">';
      const date = m.date.slice().reverse();
      date.forEach(function (data, i) {
        html += htmlGiorno(data, m.giorni.get(data) || []);
        const dopo = date[i + 1];
        if (!dopo) return;
        let d = spostaGiorno(data, -1);
        while (d && d > dopo) {
          html += '<p class="buco">Manca la chiusura del ' + esc(ErpFormat.dataIT(d)) + "</p>";
          d = spostaGiorno(d, -1);
        }
      });
      if (m.giorni.has("senza")) html += htmlGiorno("", m.giorni.get("senza") || []);
      html += "</div>";
    }
    html += "</article>";
    return html;
  }

  function htmlGiorno(data, fogli) {
    const id = data || "senza";
    const aperto = !!giorniAperti[id];
    const voci = [];
    let fuori = 0;
    fogli.forEach(function (f) {
      (f.righe || []).forEach(function (r) {
        const piatto = piattoPerRigaPos(r);
        if (!piatto) { fuori += 1; return; }
        voci.push({
          idPiatto: piatto.id,
          nome: nomePiattoVisibile(piatto.nome),
          quantita: r.quantita,
        });
      });
    });
    let html = '<div class="giorno">';
    html += '<button type="button" class="giorno-tasto" data-act="giorno" data-id="' + esc(id) + '" aria-expanded="' + (aperto ? "true" : "false") + '">'
      + '<span class="giorno-data">' + esc(data ? ErpFormat.dataIT(data) : "Data non letta") + "</span>"
      + '<span class="consumi-freccia" aria-hidden="true">' + (aperto ? "▾" : "▸") + "</span></button>";
    if (aperto) {
      html += '<div class="giorno-corpo">';
      if (!data) html += '<p class="fuori">Senza una data nel nome del foglio non lo scarico.</p>';
      if (fuori) html += '<p class="fuori">' + fuori + " vendite non sono nel menu di questo telefono: non le scarico.</p>";
      voci.forEach(function (v, i) {
        html += htmlVoceScarico(id + ":" + i, v);
      });
      html += "</div>";
    }
    html += "</div>";
    return html;
  }

  function htmlVoceScarico(id, voce) {
    const aperto = !!vociAperte[id];
    const n = Number(voce.quantita);
    const pezzi = ErpFormat.qta(n) + (Math.abs(n - 1) < 1e-9 ? " pezzo" : " pezzi");
    let html = '<div class="consumi">';
    html += '<button type="button" class="consumi-tasto" data-act="voce" data-id="' + esc(id) + '" aria-expanded="' + (aperto ? "true" : "false") + '">'
      + '<span class="voce-nome">' + esc(voce.nome) + " " + esc(pezzi) + "</span>"
      + '<span class="consumi-freccia" aria-hidden="true">' + (aperto ? "▾" : "▸") + "</span>"
      + '<span class="i-angolo" aria-hidden="true">i</span></button>';
    if (aperto) {
      html += '<div class="consumi-corpo">';
      const ante = ErpCassa.anteprima(stato, [{ idPiatto: voce.idPiatto, quantita: voce.quantita }]);
      const p = (ante.piatti || [])[0];
      if (!p || p.vuoto) {
        html += '<p class="fuori">' + esc(voce.nome) + " non ha ricetta: non consuma nulla.</p>";
      } else {
        (p.righe || []).forEach(function (r) {
          if (r.tempo) {
            html += '<p class="fuori">' + esc(r.nome) + " non esce con la cassa.</p>";
            return;
          }
          if (!(r.qta > 0)) return;
          html += '<p class="nome-ing">' + esc(r.nome) + "</p>";
          html += '<p class="numero">' + esc(qtaCassa(r.qta) + (r.udm ? " " + r.udm : "")) + "</p>";
          html += '<p class="letto">' + esc(ErpFormat.qta(p.quantita) + " × " + ErpFormat.qta(r.qtaRicetta) + (r.udm ? " " + r.udm : "")) + "</p>";
        });
      }
      html += "</div>";
    }
    html += "</div>";
    return html;
  }


  function incolla(tipo, colonne, esempio) {
    return '<details class="noprint"><summary>Incolla</summary>'
      + '<form data-form="incolla" data-tipo="' + tipo + '"><textarea name="testo" rows="4" placeholder="' + esc(esempio) + '"></textarea>'
      + '<div class="azioni"><button type="submit" class="btn">Importa</button></div></form></details>';
  }

  function testoQuantitaOrdine(r) {
    if (r.colli != null && Number(r.qtaConfezione) > 0) {
      const n = Number(r.colli);
      const colli = ErpFormat.qta(n) + (Math.abs(n - 1) < 1e-9 ? " collo" : " colli");
      return colli + " da " + ErpFormat.qta(r.qtaConfezione) + (r.udm ? " " + r.udm : "");
    }
    return ErpFormat.qta(r.quantita) + (r.unita ? " " + r.unita : "");
  }

  function soloCifreTelefono(valore) {
    let t = String(valore || "").replace(/\D/g, "");
    if (t.indexOf("00") === 0) t = t.slice(2);
    if (t.length < 8 || t.length > 15) return "";
    return t;
  }

  function telefonoFornitore(nome) {
    const mappa = stato.impostazioni && stato.impostazioni.telefoniFornitori;
    if (!mappa || typeof mappa !== "object") return "";
    const chiave = String(nome || "").trim().toLocaleLowerCase("it");
    const chiavi = Object.keys(mappa);
    for (let i = 0; i < chiavi.length; i++) {
      if (String(chiavi[i]).trim().toLocaleLowerCase("it") === chiave) return soloCifreTelefono(mappa[chiavi[i]]);
    }
    return "";
  }

  function rigaDocumentoSpesa(r) {
    const scelto = ErpCodici.codicePerFornitore(stato.codici || [], r.id, r.fornitore);
    return {
      quantita: testoQuantitaOrdine(r),
      codice: scelto.codice ? scelto.codice : "codice mancante",
      manca: !scelto.codice,
      nome: String(r.nome || "").toLocaleUpperCase("it"),
    };
  }

  function testoWhatsAppSpesa(fornitore, righe) {
    const linee = [String(fornitore || ""), ErpFormat.dataIT(oggi()), ""];
    righe.forEach(function (r) {
      linee.push(r.quantita);
      linee.push(r.codice);
      linee.push(r.nome);
      linee.push("");
    });
    return linee.join("\n").replace(/\s+$/, "");
  }

  function htmlVoceSpesa(r, conCodice) {
    let html = '<article class="voce-spesa">';
    html += '<p class="numero">' + esc(r.quantita) + "</p>";
    if (conCodice) html += '<p class="codice-voce' + (r.manca ? " codice-manca" : "") + '">' + esc(r.codice) + "</p>";
    html += '<p class="nome-ing">' + esc(r.nome) + "</p></article>";
    return html;
  }

  function htmlVoceMia(r, preso) {
    return '<div class="scorri scorri-preso" data-togli="preso" data-id="' + esc(r.id) + '">'
      + '<div class="scorri-fondo" aria-hidden="true">' + (preso ? "Su" : "Preso") + "</div>"
      + '<div class="voce-spesa voce-mia scorri-faccia' + (preso ? " voce-presa" : "") + '" aria-pressed="' + (preso ? "true" : "false") + '">'
      + '<p class="numero">' + esc(r.quantita) + "</p>"
      + '<p class="nome-ing">' + esc(r.nome) + "</p></div></div>";
  }

  async function segnaPreso(idGrezzo) {
    const id = ErpEngine.codice(idGrezzo);
    if (!id) return;
    const gia = idsPresiOggi();
    const i = gia.indexOf(id);
    if (i >= 0) gia.splice(i, 1);
    else gia.push(id);
    if (gia.length) stato.impostazioni.spesaPresi = { giorno: oggi(), ids: gia };
    else delete stato.impostazioni.spesaPresi;
    spesaPerMe = true;
    if (navigator.vibrate) navigator.vibrate(20);
    await persisti();
  }

  function idsPresiOggi() {
    const s = stato.impostazioni && stato.impostazioni.spesaPresi;
    if (!s || s.giorno !== oggi() || !Array.isArray(s.ids)) return [];
    const visti = {};
    const out = [];
    s.ids.forEach(function (id) {
      const c = ErpEngine.codice(id);
      if (!c || visti[c]) return;
      visti[c] = true;
      out.push(c);
    });
    return out;
  }

  function togliPresiScaduti() {
    const s = stato.impostazioni && stato.impostazioni.spesaPresi;
    if (!s || s.giorno === oggi()) return false;
    delete stato.impostazioni.spesaPresi;
    return true;
  }

  function nomeFileSpesa(fornitore) {
    const base = String(fornitore || "spesa").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "") || "spesa";
    return "spesa-" + base + "-" + oggi() + ".pdf";
  }

  function scaricaBytes(bytes, nome, tipo) {
    const blob = new Blob([bytes], { type: tipo });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
  }

  function copiaConTextarea(testo) {
    const ta = document.createElement("textarea");
    ta.value = testo;
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  function righeDelFornitore(nome) {
    const o = ErpEngine.propostaOrdini(stato, { oggi: oggi() });
    const chiave = String(nome || "").trim().toLocaleLowerCase("it");
    const g = (o.gruppi || []).find(function (x) {
      return String(x.fornitore || "").trim().toLocaleLowerCase("it") === chiave;
    });
    return g ? g.righe.map(rigaDocumentoSpesa) : [];
  }

  async function mandaWhatsApp(fornitore, tel) {
    const righe = righeDelFornitore(fornitore);
    if (!righe.length) { msg("Niente da mandare.", true); render(); return; }
    const testo = testoWhatsAppSpesa(fornitore, righe);
    const numero = soloCifreTelefono(tel);
    if (numero) {
      window.open("https://wa.me/" + numero + "?text=" + encodeURIComponent(testo), "_blank", "noopener");
      return;
    }
    let copiato = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(testo);
        copiato = true;
      }
    } catch (e) { copiato = false; }
    if (!copiato) copiato = copiaConTextarea(testo);
    if (navigator.share) {
      try { await navigator.share({ text: testo }); } catch (e) { /* foglio chiuso */ }
    }
    msg(copiato ? "Testo copiato. Incollalo su WhatsApp." : "Non sono riuscito a copiare il testo.", !copiato);
    render();
  }

  function vistaSpesa() {
    const imp = stato.impostazioni;
    const o = ErpEngine.propostaOrdini(stato, { oggi: oggi() });
    let html = '<form data-form="copertura" class="giorni noprint">'
      + '<label>Giorni<input name="giorni" data-modo="intero" inputmode="numeric" value="' + esc(String(imp.giorniCopertura)) + '"></label>'
      + '<label>Indietro<input name="storico" data-modo="intero" inputmode="numeric" value="' + esc(String(imp.giorniStorico)) + '"></label>'
      + tastoInfo({
        titolo: "Giorni",
        voci: [
          voce("Ricette", imp.giorniCopertura, String(imp.giorniCopertura), "#4d9fff"),
          voce("Indietro", imp.giorniStorico, String(imp.giorniStorico), "#9eb4d0")
        ]
      })
      + '<button type="submit" class="btn">Ok</button></form>';
    html += '<p class="numero-hero">' + ErpFormat.euro(o.totale) + "</p>";
    if (!(stato.inventari || []).length) {
      html += '<p class="muto">Non c\'è ancora un conteggio. La lista è solo il consumo degli ultimi ' + esc(String(imp.giorniStorico)) + " giorni, per " + esc(String(imp.giorniCopertura)) + " giorni. Non ricompra i mesi già venduti.</p>";
    }
    html += '<button type="button" class="tasto-grosso tasto-chiaro" data-act="spesa-per-me" aria-expanded="' + (spesaPerMe ? "true" : "false") + '">Per me</button>';
    if (togliPresiScaduti()) ErpDb.salva(stato);
    if (!o.righe.length) {
      html += '<p class="etichetta">Niente da comprare.</p>';
      return html;
    }
    if (spesaPerMe) {
      const presi = {};
      idsPresiOggi().forEach(function (id) { presi[id] = true; });
      const ordinati = o.righe.slice().sort(function (a, b) {
        return String(a.nome || "").localeCompare(String(b.nome || ""), "it");
      });
      const sopra = [];
      const sotto = [];
      ordinati.forEach(function (r) {
        const doc = rigaDocumentoSpesa(r);
        doc.id = ErpEngine.codice(r.id);
        if (presi[doc.id]) sotto.push(doc);
        else sopra.push(doc);
      });
      html += '<section class="lista-mia"><h2>Per me</h2>';
      html += '<p class="muto">Scorri a sinistra quando lo prendi: va in fondo. Sulla riga già presa, scorri di nuovo per riportarla su.</p>';
      sopra.forEach(function (r) { html += htmlVoceMia(r, false); });
      sotto.forEach(function (r) { html += htmlVoceMia(r, true); });
      html += "</section>";
    }
    const tanti = o.gruppi.length > 2;
    const pagina = "spesa-fornitori";
    if (tanti && !gruppiAperti[pagina]) {
      gruppiAperti[pagina] = {};
      if (o.gruppi[0]) gruppiAperti[pagina][o.gruppi[0].fornitore] = true;
    }
    o.gruppi.forEach(function (g) {
      const righe = g.righe.map(rigaDocumentoSpesa);
      const tel = telefonoFornitore(g.fornitore);
      const aperto = !tanti || !!(gruppiAperti[pagina] && gruppiAperti[pagina][g.fornitore]);
      let corpo = "";
      if (aperto) {
        righe.forEach(function (r) { corpo += htmlVoceSpesa(r, true); });
        corpo += '<button type="button" class="tasto-grosso" data-act="spesa-wa" data-fornitore="' + esc(g.fornitore) + '"'
          + (tel ? ' data-tel="' + esc(tel) + '"' : "") + ">"
          + (tel ? "WhatsApp" : "Copia per WhatsApp") + "</button>";
        corpo += '<button type="button" class="tasto-grosso tasto-chiaro" data-act="spesa-pdf" data-fornitore="' + esc(g.fornitore) + '">PDF</button>';
      }
      html += '<section class="fornitore-spesa">';
      if (tanti) {
        const n = g.righe.length;
        html += '<button type="button" class="mese-tasto" data-act="gruppo" data-pagina="' + pagina + '" data-id="' + esc(g.fornitore) + '" aria-expanded="' + (aperto ? "true" : "false") + '">'
          + '<span class="mese-nome">' + esc(g.fornitore) + "</span>"
          + '<span class="gruppo-n">' + n + (n === 1 ? " articolo" : " articoli") + "</span>"
          + '<span class="consumi-freccia" aria-hidden="true">' + (aperto ? "▾" : "▸") + "</span></button>";
        if (aperto) html += '<div class="mese-corpo">' + corpo + "</div>";
      } else {
        html += "<h2>" + esc(g.fornitore) + "</h2>" + corpo;
      }
      html += "</section>";
    });
    return html;
  }

  function voceCosto(etichetta, importo, tipo) {
    return '<span class="voce-costo' + (tipo ? " voce-" + tipo : "") + '"><span class="voce-costo-nome">' + etichetta + '</span> <span class="voce-costo-euro">' + ErpFormat.euro(importo) + "</span></span>";
  }

  function vistaFood() {
    const food = ErpEngine.foodCost(stato);
    const gruppi = raggruppa(food.piatti, function (p) { return categoriaPiattoVisibile(p.categoria); }, function (a, b) { return ordinePiatto(a) - ordinePiatto(b); });
    gruppi.forEach(function (g) {
      const tot = (food.categorie || []).find(function (c) {
        return categoriaPiattoVisibile(c.categoria).toLocaleLowerCase("it") === g.nome.toLocaleLowerCase("it");
      });
      if (!tot) return;
      const reale = tot.ricavo > 0 ? voceCosto("Reale", tot.costo, "reale") : "";
      g.extra = '<span class="gruppo-food"><span class="pct-cat">' + ErpFormat.pct(tot.fc) + "</span>" + reale + "</span>";
    });
    return htmlGruppi("food", gruppi, function (p) {
      return '<div class="riga riga-food riga-food-piatto">'
        + '<a class="riga-nome" href="#/ricette/scheda/' + encodeURIComponent(p.id) + '">' + esc(nomePiattoVisibile(p.nome)) + "</a>"
        + '<span class="costi-food">'
        + '<span class="riga-num">' + ErpFormat.pct(p.fcIncasso) + "</span>"
        + voceCosto("Ricetta", p.costoTeorico, "ricetta")
        + voceCosto("Reale", p.costoReale, "reale")
        + "</span>"
        + tastoInfo(graficoPiatto(p))
        + "</div>";
    }, "piatti");
  }

  function vistaDati() {
    const imp = stato.impostazioni;
    let html = '<div class="azioni"><button type="button" class="btn btn-rosso" data-act="backup">Scarica il backup</button>'
      + '<label class="btn">Carica un backup<input id="file-backup" type="file" accept="application/json,.json" hidden></label></div>';
    html += '<form data-form="impostazioni" class="campi">'
      + campo("Nome", inputTesto("nome", imp.nomeLocale, "Pizzeria", "testo"))
      + campo("Giorni ricette", inputNum("giorni", String(imp.giorniCopertura), "7", "intero"))
      + campo("Giorni indietro", inputNum("storico", String(imp.giorniStorico), "30", "intero"))
      + campo("Allerta prezzo %", inputNum("soglia", String(Math.round(imp.sogliaAllerta * 1000) / 10).replace(".", ","), "10", "decimale"))
      + '<div class="azioni largo"><button type="submit" class="btn btn-rosso">Salva</button></div></form>';
    const cfg = window.ErpArchivio ? ErpArchivio.config() : { url: "", chiave: "" };
    html += '<h2>Archivio unico</h2>';
    html += '<p class="muto">I due telefoni leggono le stesse righe. Incolla l\'indirizzo del progetto e la chiave anon. La chiave segreta di servizio non va qui.</p>';
    html += '<form data-form="archivio" class="campi">'
      + campo("Indirizzo", inputTesto("url", cfg.url, "https://xxxx.supabase.co", "url"))
      + campo("Chiave anon", inputTesto("chiave", cfg.chiave, "eyJ...", "testo"))
      + campo("Email", inputTesto("email", ErpArchivio.email(), "vicodelcarmine1@gmail.com", "email"))
      + campo("Password", '<input name="password" type="password" autocomplete="current-password">')
      + '<div class="azioni largo"><button type="submit" class="btn btn-rosso">Collega</button></div></form>';
    if (ErpArchivio.entrato()) {
      html += '<p class="muto">Sei dentro' + (ErpArchivio.email() ? " come " + esc(ErpArchivio.email()) : "") + ".</p>";
      html += '<button type="button" class="tasto-grosso tasto-chiaro" data-act="archivio-esci">Esci dall\'archivio</button>';
    }
    if (ErpArchivio.errore()) html += '<p class="banner errore">' + esc(ErpArchivio.errore()) + "</p>";
    return html;
  }

  function corpo() {
    const r = route();
    if (r.name === "magazzino" && r.a === "nuovo") return vistaNuovoIng();
    if (r.name === "magazzino" && r.a === "scheda") return vistaSchedaIng(r.b);
    if (r.name === "ricette" && r.a === "nuovo") return "<h2>Nuovo piatto</h2>" + formPiatto(null);
    if (r.name === "ricette" && r.a === "scheda") return vistaSchedaPiatto(r.b);
    if (r.name === "conteggio") return vistaConteggio();
    if (r.name === "giacenza") return vistaGiacenza();
    if (r.name === "menu") return vistaMenu();
    if (r.name === "magazzino") return vistaMagazzino();
    if (r.name === "ricette") return vistaRicette();
    if (r.name === "fattura") return vistaFattura();
    if (r.name === "preventivi" && r.a === "scheda") return vistaRevisione(r.b);
    if (r.name === "preventivi") return vistaPreventivi();
    if (r.name === "cassa") return vistaCassa();
    if (r.name === "spesa") return vistaSpesa();
    if (r.name === "food") return vistaFood();
    if (r.name === "dati") return vistaDati();
    return vistaHome();
  }

  function titolo() {
    const r = route();
    if (r.name === "magazzino" && r.a === "scheda") return String(nomeIng(r.b) || "").toLocaleUpperCase("it");
    if (r.name === "ricette" && r.a === "scheda") return nomePiatto(r.b);
    if (r.name === "ricette" && r.a === "nuovo") return "Nuovo piatto";
    if (r.name === "fattura" && r.a === "mano") return "Senza fattura";
    if (r.name === "preventivi" && r.a === "scheda") return "Preventivo";
    if (r.name === "conteggio" && r.a === "cat") return r.b || "Conteggio";
    return TITOLI[r.name] || "Oggi";
  }

  function render() {
    const prima = (location.hash.replace(/^#\/?/, "").split("/")[0] || "");
    if (prima === "movimenti") {
      location.hash = "#/fattura";
      return;
    }
    if (prima === "sfridi") {
      location.hash = "#/magazzino";
      return;
    }
    if (prima === "stili") {
      location.hash = "#/menu";
      return;
    }
    chiediChiusura();
    const vista = document.getElementById("vista");
    const barra = document.getElementById("barra");
    const h = document.getElementById("titolo");
    const dove = document.getElementById("dove");
    infoTesti = {};
    infoN = 0;
    chiudiFoglio();
    registraPagina();
    try {
      const r = route();
      if (r.name !== "preventivi") {
        preventiviCaricati = false;
        togliAvvisoComputer();
      }
      if (h) {
        h.textContent = titolo();
        const nomeIngrediente = r.name === "magazzino" && r.a === "scheda";
        h.classList.toggle("nome-ing", !!nomeIngrediente);
      }
      if (dove) dove.textContent = (stato.impostazioni && stato.impostazioni.nomeLocale) || "";
      document.title = titolo() + " · ERP leggero";
      if (barra) {
        barra.innerHTML = BARRA.map(function (v) {
          const acceso = v[0] === r.name;
          return '<a href="#/' + v[0] + '"' + (acceso ? ' aria-current="page"' : "") + ">" + v[1] + "</a>";
        }).join("");
      }
      if (vista) vista.innerHTML = bannerHtml() + corpo();
      if (vista) vista.querySelectorAll("form").forEach(syncPeso);
      if (vista && pendingScrollRiga != null && r.name === "fattura" && r.a === "scheda") {
        const n = pendingScrollRiga;
        pendingScrollRiga = null;
        const el = document.getElementById("riga-fattura-" + n);
        if (el) el.scrollIntoView({ block: "center" });
      } else if (scrollDaTenere != null) {
        const y = scrollDaTenere;
        scrollDaTenere = null;
        window.scrollTo(0, y);
      }
    } catch (e) {
      if (vista) vista.innerHTML = '<p class="banner errore">Errore nel disegno della pagina: ' + esc(e.message) + "</p>";
    }
  }

  function numeroConteggio(form) {
    const el = form.elements.reale;
    const box = el && el.closest ? el.closest("[data-qta-box]") : null;
    const unita = el && el.dataset ? (el.dataset.unita || "") : "";
    const raw = String(el && el.value != null ? el.value : "").trim();
    if (!unita) return { errore: "Scegli l'unità della quantità contata." };
    if (!raw) return { errore: "Manca la quantità contata." };
    const n = ErpFormat.parseNumero(raw);
    if (n == null) return { errore: "La quantità contata: scrivi solo numeri." };
    if (n < 0) return { errore: "La giacenza contata non può essere negativa." };
    if (n === 0) return { valore: 0 };
    const esito = ErpUnita.converti(raw, unita, box ? box.dataset.master : "");
    if (esito.errore) return { errore: "La quantità contata: " + esito.errore };
    return { valore: esito.valore };
  }

  function numeroQta(form, nome, obbligatorio, etichetta) {
    const el = form.elements[nome];
    const box = el && el.closest ? el.closest("[data-qta-box]") : null;
    const unita = el && el.dataset ? (el.dataset.unita || "") : "";
    const raw = String(el && el.value != null ? el.value : "").trim();
    if (!unita) {
      if (!raw && !obbligatorio) return { valore: "" };
      return { errore: "Scegli l'unità di " + etichetta + "." };
    }
    if (!raw) return obbligatorio ? { errore: "Manca " + etichetta + "." } : { valore: "" };
    const esito = ErpUnita.converti(raw, unita, box ? box.dataset.master : "");
    if (esito.errore) return { errore: etichetta + ": " + esito.errore };
    return { valore: esito.valore };
  }

  function numeroCampo(form, nome, obbligatorio, etichetta) {
    const el = form.elements[nome];
    const raw = String(el && el.value != null ? el.value : "").trim();
    if (!raw) return obbligatorio ? { errore: "Manca " + etichetta + "." } : { valore: "" };
    const n = ErpFormat.parseNumero(raw);
    const modo = el && el.dataset ? el.dataset.modo : "";
    if (n == null) {
      const esempio = modo === "grammi" ? "145" : (modo === "euro" ? "2150" : "1,5");
      return { errore: etichetta + ": scrivi solo numeri, per esempio " + esempio + "." };
    }
    if (modo === "grammi") return { valore: Math.round(n) / 1000 };
    if (modo === "intero") return { valore: Math.round(n) };
    return { valore: n };
  }

  function msg(testo, errore) {
    banner = testo;
    bannerErrore = !!errore;
  }

  function avvisoComputer(testo) {
    return testo === "Il computer del locale non risponde. Accendilo e riprova.";
  }

  function togliAvvisoComputer() {
    if (!avvisoComputer(banner)) return false;
    banner = "";
    bannerErrore = false;
    return true;
  }

  async function persisti() {
    try {
      await ErpDb.salva(stato);
    } catch (e) {
      msg("Non sono riuscito a salvare in questo browser. Scarica il backup da Dati.", true);
    }
    render();
  }

  let timerChiusura = 0;
  let chiusuraInCorso = false;

  function avvisaChiusura(chiuso) {
    if (!chiuso) return;
    msg("Conteggio chiuso alle 23:59. Giacenza, sfrido e spesa usano i quantitativi contati.", false);
    render();
    programmaChiusura();
  }

  function chiediChiusura() {
    if (!stato || !stato.impostazioni || chiusuraInCorso) return;
    if (!ErpConteggio.chiusura(stato.impostazioni.conteggioSospeso, new Date())) return;
    chiudiConteggioSeScade().then(avvisaChiusura);
  }

  async function chiudiConteggioSeScade() {
    if (!stato || !stato.impostazioni || chiusuraInCorso) return false;
    const piano = ErpConteggio.chiusura(stato.impostazioni.conteggioSospeso, new Date());
    if (!piano) return false;
    chiusuraInCorso = true;
    const resti = [];
    try {
      piano.righe.forEach(function (r) {
        const esito = ErpAzioni.registraInventario(stato, {
          idIngrediente: r.id,
          reale: r.reale,
          at: piano.at,
        });
        if (!esito.ok) resti.push(r);
      });
      if (resti.length) stato.impostazioni.conteggioSospeso = { giorno: piano.giorno, righe: resti };
      else delete stato.impostazioni.conteggioSospeso;
      await ErpDb.salva(stato);
      return resti.length === 0;
    } catch (e) {
      msg("Non sono riuscito a salvare la chiusura del conteggio.", true);
      return false;
    } finally {
      chiusuraInCorso = false;
    }
  }

  function programmaChiusura() {
    if (timerChiusura) {
      clearTimeout(timerChiusura);
      timerChiusura = 0;
    }
    if (!stato || !stato.impostazioni) return;
    const s = ErpConteggio.normalizza(stato.impostazioni.conteggioSospeso);
    if (!s.giorno || s.giorno !== oggi() || !s.righe.length) return;
    const ms = ErpConteggio.millisecondiAllaChiusura(new Date());
    if (!(ms > 0)) return;
    timerChiusura = setTimeout(function () {
      timerChiusura = 0;
      chiudiConteggioSeScade().then(avvisaChiusura);
    }, ms);
  }

  function leggiAt(fd) {
    return ErpFormat.componiAt(fd.get("data"), fd.get("ora"));
  }

  async function caricaPreventivi() {
    let data = null;
    try {
      const res = await fetch(urlApiPreventivo("/api/preventivi"));
      data = await leggiRispostaPreventivo(res);
      if (!res.ok || !data.ok) throw new Error(data.errore || "Non leggo i preventivi.");
    } catch (e) {
      preventiviServer = [];
      msg(messaggioPreventivo(e), true);
      render();
      return;
    }
    if (data.base) basePreventivi = data.base;
    preventiviServer = data.link || [];
    notaArriviPreventivi(preventiviServer);
    togliAvvisoComputer();
    render();
  }

  function notaArriviPreventivi(lista) {
    const nuovi = [];
    (lista || []).forEach(function (l) {
      if (l.stato !== "inviato" || preventiviVisti[l.token]) return;
      if (!primaLetturaPreventivi) nuovi.push(l);
      preventiviVisti[l.token] = true;
    });
    primaLetturaPreventivi = false;
    if (!nuovi.length) return;
    const testo = nuovi.length === 1
      ? "È arrivato un preventivo da controllare."
      : "Sono arrivati " + nuovi.length + " preventivi da controllare.";
    if (typeof Notification === "function" && Notification.permission === "granted") {
      try { new Notification("Preventivo", { body: testo }); } catch (e) { /* il browser non la mostra */ }
    } else if (typeof Notification === "function" && Notification.permission === "default") {
      Notification.requestPermission().catch(function () {});
    }
  }

  function staScrivendo() {
    const el = document.activeElement;
    if (!el || !el.tagName) return false;
    return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
  }

  async function aggiornaPreventivi() {
    let data = null;
    try {
      const res = await fetch(urlApiPreventivo("/api/preventivi"));
      data = await leggiRispostaPreventivo(res);
      if (!res.ok || !data.ok) return;
    } catch (e) { return; }
    const vaTolto = avvisoComputer(banner);
    if (data.base) basePreventivi = data.base;
    const prima = JSON.stringify((preventiviServer || []).map(function (l) {
      return [l.token, l.stato, l.inviato];
    }));
    const dopo = JSON.stringify((data.link || []).map(function (l) {
      return [l.token, l.stato, l.inviato];
    }));
    preventiviServer = data.link || [];
    notaArriviPreventivi(preventiviServer);
    if (staScrivendo()) return;
    if (vaTolto) togliAvvisoComputer();
    if (prima === dopo && !vaTolto) return;
    if (route().name === "preventivi") render();
  }

  async function onSubmit(form) {
    const tipo = form.dataset.form;
    const fd = new FormData(form);
    if (tipo === "archivio") {
      const url = String(fd.get("url") || "").trim();
      const chiave = String(fd.get("chiave") || "").trim();
      const mail = String(fd.get("email") || "").trim();
      const password = String(fd.get("password") || "");
      if (!url || !chiave) { msg("Incolla l'indirizzo e la chiave anon.", true); render(); return; }
      if (!mail || !password) { msg("Scrivi email e password dell'archivio.", true); render(); return; }
      ErpArchivio.salvaConfig(url, chiave);
      try {
        await ErpArchivio.entra(mail, password);
        const esito = await ErpArchivio.sincronizza(stato);
        msg(esito.errore || "Archivio collegato. L'altro telefono, con gli stessi dati, vede queste righe.", !!esito.errore);
      } catch (e) {
        msg(e && e.message ? e.message : "Non raggiungo l'archivio.", true);
      }
      render();
      return;
    }
    if (tipo === "nuovo-preventivo") {
      const fornitore = maiuscolaIniziale(fd.get("fornitore"));
      const scelti = articoliUsati().filter(function (a) { return categoriePreventivo[a.categoria]; });
      const giorni = numeroCampo(form, "giorni", true, "i giorni");
      const ricorda = String(fd.get("fornitore") || "");
      const ricordaGiorni = String(fd.get("giorni") || "");
      const dopo = function () {
        render();
        const el = document.querySelector('form[data-form="nuovo-preventivo"] [name="fornitore"]');
        const g = document.querySelector('form[data-form="nuovo-preventivo"] [name="giorni"]');
        if (el && ricorda) el.value = ricorda;
        if (g && ricordaGiorni) g.value = ricordaGiorni;
      };
      if (!fornitore) { msg("Scrivi il nome del fornitore.", true); dopo(); return; }
      if (giorni.errore || !(giorni.valore >= 1) || giorni.valore > 365) {
        msg("Scrivi quanti giorni resta valido, per esempio 7.", true);
        dopo();
        return;
      }
      if (!scelti.length) { msg("Scegli almeno una categoria.", true); dopo(); return; }
      let data = null;
      try {
        const res = await fetch(urlApiPreventivo("/api/preventivi"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fornitore: fornitore,
            giorni: giorni.valore,
            locale: (stato.impostazioni && stato.impostazioni.nomeLocale) || "Pizzeria",
            articoli: scelti.map(function (a) { return { id: a.id, nome: a.nome, udm: a.udm }; }),
          }),
        });
        data = await leggiRispostaPreventivo(res);
        if (!res.ok || !data.ok) throw new Error(data.errore || "Non sono riuscito a creare il link.");
      } catch (e) {
        msg(messaggioPreventivo(e), true);
        dopo();
        return;
      }
      if (data.base) basePreventivi = data.base;
      linkAppenaCreato = data;
      copiaAvviso = "";
      preventiviServer = preventiviServer.filter(function (l) { return l.token !== data.token; });
      preventiviServer.unshift({
        token: data.token,
        fornitore: data.fornitore,
        stato: "aperto",
        scade: data.scade,
        righe: [],
      });
      msg("", false);
      render();
      return;
    }
    if (tipo === "ingrediente") {
      const nuovo = !form.querySelector('input[type="hidden"][name="id"]');
      if (nuovo) {
        const ricordi = ricordaNuovoIng(form);
        const fallo = function (testo) {
          msg(testo, true);
          render();
          ripristinaNuovoIng(ricordi);
        };
        let categoria;
        if (sceltaCatIng === "__nuova") {
          categoria = maiuscolaIniziale(fd.get("categoria-nuova"));
          if (ErpCodicePiatto.lettereCategoria(categoria).length < 3) {
            fallo("Per una categoria nuova servono almeno 3 lettere.");
            return;
          }
        } else {
          categoria = maiuscolaIniziale(sceltaCatIng);
        }
        if (!categoria) { fallo("Scegli la categoria."); return; }
        const nome = String(fd.get("nome") || "").trim().toLocaleUpperCase("it");
        if (!nome) { fallo("Scrivi il nome."); return; }
        const sfuso = fd.get("sfuso") === "on";
        const el = form.querySelector("[data-formato]");
        const unita = el && el.dataset ? (el.dataset.unita || "") : "";
        const raw = el ? String(el.value || "").trim() : "";
        if (!unita) { fallo("Scegli l'unità della confezione: g, kg, L, cl o PZ."); return; }
        let qta = "";
        let udm = "";
        if (raw) {
          const esito = ErpUnita.daScelta(raw, unita);
          if (esito.errore) { fallo("Confezione: " + esito.errore); return; }
          qta = esito.valore;
          udm = esito.udm;
        } else if (!sfuso) {
          fallo("Scrivi quanto contiene una confezione, oppure segna che lo compri a peso senza colli.");
          return;
        } else {
          udm = ErpUnita.udmDi(unita);
          if (!udm) { fallo("Scegli l'unità della confezione: g, kg, L, cl o PZ."); return; }
        }
        const id = ErpEngine.codice(ErpCodicePiatto.prossimoCodiceIngrediente(stato.ingredienti, categoria, ErpEngine.codice));
        if (!id) { fallo("Non riesco a preparare il codice."); return; }
        if ((stato.ingredienti || []).some(function (i) { return ErpEngine.codice(i.id) === id; })) {
          fallo("Questo codice c'è già.");
          return;
        }
        stato.ingredienti.push({
          id: id,
          attivo: true,
          nome: nome,
          categoria: categoria,
          udm: udm,
          tipo: fd.get("tipo") === "TEMPO" ? "TEMPO" : "POS",
          qtaConfezione: qta === "" ? 0 : qta,
          acquistoSfuso: sfuso,
        });
        stato.scelta = true;
        sceltaCatIng = null;
        msg("Prodotto creato.", false);
        await ErpDb.salva(stato);
        if (ritornoNuovo) {
          const dest = ritornoNuovo;
          ritornoNuovo = null;
          const fat = trovaFattura(dest.numero);
          const riga = fat && fat.righe && fat.righe[dest.riga];
          if (riga && !riga.caricata) {
            riga.idMaster = id;
            memorizzaCodiciRiga(riga, id);
            await ErpDb.salva(stato);
          }
          pendingScrollRiga = dest.riga;
          msg("Prodotto creato. È già scelto sulla riga.", false);
          vai("fattura/scheda/" + encodeURIComponent(dest.numero));
          return;
        }
        vai("magazzino/scheda/" + encodeURIComponent(id));
        return;
      }
      const id = ErpEngine.codice(fd.get("id"));
      const ricordi = ricordaNuovoIng(form);
      const fallo = function (testo) {
        msg(testo, true);
        render();
        ripristinaNuovoIng(ricordi);
      };
      if (!id) { fallo("Prodotto non trovato."); return; }
      let categoria;
      if (modificaIng && modificaIng.id === id && modificaIng.cat === "__nuova") {
        categoria = maiuscolaIniziale(fd.get("categoria-nuova"));
        if (ErpCodicePiatto.lettereCategoria(categoria).length < 3) {
          fallo("Per una categoria nuova servono almeno 3 lettere.");
          return;
        }
      } else if (modificaIng && modificaIng.id === id) {
        categoria = maiuscolaIniziale(modificaIng.cat);
      }
      if (!categoria) { fallo("Scegli la categoria."); return; }
      const nome = String(fd.get("nome") || "").trim().toLocaleUpperCase("it");
      if (!nome) { fallo("Scrivi il nome."); return; }
      const sfuso = fd.get("sfuso") === "on";
      const el = form.querySelector("[data-formato]");
      const unita = el && el.dataset ? (el.dataset.unita || "") : "";
      const raw = el ? String(el.value || "").trim() : "";
      if (!unita) { fallo("Scegli l'unità della confezione: g, kg, L, cl o PZ."); return; }
      let qta = "";
      let udm = "";
      if (raw) {
        const esito = ErpUnita.daScelta(raw, unita);
        if (esito.errore) { fallo("Confezione: " + esito.errore); return; }
        qta = esito.valore;
        udm = esito.udm;
      } else if (!sfuso) {
        fallo("Scrivi quanto contiene una confezione, oppure segna che lo compri a peso senza colli.");
        return;
      } else {
        udm = ErpUnita.udmDi(unita);
        if (!udm) { fallo("Scegli l'unità della confezione: g, kg, L, cl o PZ."); return; }
      }
      const ing = (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === id; });
      if (!ing) { fallo("Prodotto non trovato."); return; }
      ing.nome = nome;
      ing.categoria = categoria;
      ing.udm = udm;
      ing.tipo = fd.get("tipo") === "TEMPO" ? "TEMPO" : "POS";
      ing.qtaConfezione = qta === "" ? 0 : qta;
      ing.acquistoSfuso = sfuso;
      modificaIng = { id: id, cat: categoria };
      stato.scelta = true;
      msg("Anagrafica salvata.", false);
      await persisti();
      return;
    }
    if (tipo === "piatto") {
      const nome = maiuscolaIniziale(fd.get("nome"));
      const listino = numeroCampo(form, "listino", false, "il listino");
      if (!nome) { msg("Scrivi il nome del piatto.", true); render(); return; }
      if (listino.errore) { msg(listino.errore, true); render(); return; }
      const nuovo = !form.querySelector('input[type="hidden"][name="id"]');
      let id;
      let categoria;
      if (nuovo) {
        if (sceltaCatPiatto === "__nuova") {
          categoria = maiuscolaIniziale(fd.get("categoria-nuova"));
          if (ErpCodicePiatto.lettereCategoria(categoria).length < 3) {
            msg("Per una categoria nuova servono almeno 3 lettere.", true);
            render();
            return;
          }
        } else {
          categoria = maiuscolaIniziale(sceltaCatPiatto);
        }
        if (!categoria) { msg("Scegli la categoria.", true); render(); return; }
        id = ErpEngine.codice(ErpCodicePiatto.prossimoCodice(stato.piatti, categoria, ErpEngine.codice));
      } else {
        id = ErpEngine.codice(fd.get("id"));
        categoria = maiuscolaIniziale(fd.get("categoria"));
      }
      if (!id) { msg("Non riesco a preparare il codice.", true); render(); return; }
      let p = (stato.piatti || []).find(function (x) { return ErpEngine.codice(x.id) === id; });
      if (nuovo && p) { msg("Questo codice c'è già.", true); render(); return; }
      if (!p) {
        p = { id: id };
        stato.piatti.push(p);
      }
      p.nome = nome;
      p.categoria = categoria;
      p.prezzoListino = listino.valore === "" ? 0 : listino.valore;
      stato.scelta = true;
      msg(nuovo ? "Piatto creato." : "Piatto salvato.", false);
      if (nuovo) {
        sceltaCatPiatto = null;
        await ErpDb.salva(stato);
        vai("ricette/scheda/" + encodeURIComponent(p.id));
        return;
      }
      await persisti();
      return;
    }
    if (tipo === "riga") {
      const qta = numeroQta(form, "qta", true, "la quantità in ricetta");
      if (qta.errore) { msg(qta.errore, true); render(); return; }
      if (!(qta.valore > 0)) { msg("La quantità in ricetta deve essere maggiore di zero.", true); render(); return; }
      const piatto = ErpEngine.codice(fd.get("piatto"));
      const ing = ErpEngine.codice(fd.get("ing"));
      const i = (stato.ricette || []).findIndex(function (r) {
        return ErpEngine.codice(r.idPiatto) === piatto && ErpEngine.codice(r.idIngrediente) === ing;
      });
      if (i >= 0) stato.ricette[i].quantita = qta.valore;
      else stato.ricette.push({ idPiatto: piatto, idIngrediente: ing, quantita: qta.valore });
      msg("Ricetta aggiornata.", false);
      await persisti();
      return;
    }
    if (tipo === "mano") {
      syncPeso(form);
      const qta = numeroQta(form, "qta", true, "la quantità");
      const prezzo = numeroCampo(form, "prezzo", true, "il prezzo");
      if (qta.errore || prezzo.errore) { msg(qta.errore || prezzo.errore, true); render(); return; }
      const id = ErpEngine.codice(fd.get("ing"));
      const ing = (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === id; });
      if (!ing) { msg("Scegli il prodotto.", true); render(); return; }
      const fornitore = maiuscolaIniziale(fd.get("fornitore"));
      if (!fornitore) { msg("Scrivi il fornitore.", true); render(); return; }
      if (!(qta.valore > 0)) { msg("La quantità deve essere maggiore di zero.", true); render(); return; }
      if (!(prezzo.valore > 0)) { msg("Il prezzo deve essere maggiore di zero.", true); render(); return; }
      const udm = ing.udm === "L" || ing.udm === "pz" ? ing.udm : "kg";
      bozzaMano = {
        id: ing.id,
        nome: ing.nome,
        udm: udm,
        quantita: qta.valore,
        prezzo: prezzo.valore,
        fornitore: fornitore,
        data: ErpFormat.dataISO(fd.get("data")) || oggi(),
        stale: false,
      };
      msg("", false);
      render();
      return;
    }
    if (tipo === "modifica-carico") {
      syncPeso(form);
      const id = String(fd.get("id") || "");
      const c = (stato.carichi || []).find(function (x) { return x.id === id; });
      if (!c) { msg("Questo carico non c'è più.", true); caricoAperto = null; render(); return; }
      const qta = numeroQta(form, "qta", true, "la quantità");
      const prezzo = numeroCampo(form, "prezzo", false, "il prezzo");
      if (qta.errore || prezzo.errore) { msg(qta.errore || prezzo.errore, true); render(); return; }
      const ingId = ErpEngine.codice(fd.get("ing"));
      const ing = (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === ingId; });
      if (!ing) { msg("Scegli il prodotto.", true); render(); return; }
      if (!(qta.valore > 0)) { msg("La quantità deve essere maggiore di zero.", true); render(); return; }
      const fornitore = maiuscolaIniziale(fd.get("fornitore"));
      if (!c.diretto && prezzo.valore > 0 && !fornitore) {
        msg("Scrivi il fornitore, altrimenti il prezzo non entra nel confronto.", true);
        render();
        return;
      }
      const giorno = ErpFormat.dataISO(fd.get("data")) || String(c.at || "").slice(0, 10);
      const ora = (String(c.at || "").match(/T(\d{2}:\d{2}:\d{2})/) || [])[1] || "12:00:00";
      c.idIngrediente = ing.id;
      c.quantita = qta.valore;
      c.fornitore = fornitore;
      c.prezzoUdm = prezzo.valore === "" ? null : prezzo.valore;
      c.at = giorno + "T" + ora;
      allineaOffertaDelCarico(c);
      caricoAperto = null;
      msg("Carico aggiornato.", false);
      await persisti();
      return;
    }
    if (tipo === "inventario") {
      const reale = numeroConteggio(form);
      if (reale.errore) { msg(reale.errore, true); render(); return; }
      const id = ErpEngine.codice(fd.get("ing"));
      if (!id) { msg("Scegli il prodotto.", true); render(); return; }
      const chiuso = await chiudiConteggioSeScade();
      if (!stato.impostazioni) stato.impostazioni = {};
      const giorno = oggi();
      const attuale = ErpConteggio.normalizza(stato.impostazioni.conteggioSospeso);
      const base = !chiuso && attuale.giorno === giorno ? attuale : { giorno: "", righe: [] };
      stato.impostazioni.conteggioSospeso = ErpConteggio.segna(base, giorno, id, reale.valore);
      msg(chiuso
        ? "Il conteggio precedente è chiuso alle 23:59. Questo resta modificabile fino alle 23:59 di oggi."
        : "Contato. Resta modificabile fino alle 23:59 e non sposta ancora la giacenza.", false);
      programmaChiusura();
      await persisti();
      return;
    }
    if (tipo === "incolla") {
      const esito = ErpAzioni.importaRighe(stato, form.dataset.tipo, fd.get("testo"));
      if (!esito.n && esito.errori.length) { msg(esito.errori.join(" "), true); render(); return; }
      msg("Importate " + esito.n + " righe." + (esito.errori.length ? " " + esito.errori.join(" ") : ""), esito.errori.length > 0);
      await persisti();
      return;
    }
    if (tipo === "copertura" || tipo === "impostazioni") {
      const giorni = numeroCampo(form, "giorni", true, "i giorni");
      const storico = numeroCampo(form, "storico", true, "i giorni indietro");
      if (giorni.errore || storico.errore) { msg(giorni.errore || storico.errore, true); render(); return; }
      if (!(giorni.valore >= 1) || !(storico.valore >= 1)) { msg("I giorni devono essere almeno 1.", true); render(); return; }
      stato.impostazioni.giorniCopertura = Math.round(giorni.valore);
      stato.impostazioni.giorniStorico = Math.round(storico.valore);
      if (tipo === "impostazioni") {
        stato.impostazioni.nomeLocale = maiuscolaIniziale(fd.get("nome")) || "Pizzeria";
        const soglia = numeroCampo(form, "soglia", false, "la soglia");
        if (soglia.errore) { msg(soglia.errore, true); render(); return; }
        if (soglia.valore !== "") stato.impostazioni.sogliaAllerta = Number(soglia.valore) / 100;
      }
      msg("Salvato.", false);
      await persisti();
    }
  }

  async function onClick(act, nodo) {
    if (act === "nota-vista") {
      const id = nodo.dataset.id || "";
      stato.note = (stato.note || []).filter(function (n) { return n.id !== id; });
      await persisti();
      return;
    }
    if (act === "archivio-esci") {
      ErpArchivio.esci();
      msg("Sei uscito dall'archivio. I numeri restano su questo telefono.", false);
      render();
      return;
    }
    if (act === "carica-fattura") {
      await confermaFattura();
      return;
    }
    if (act === "spesa-per-me") {
      spesaPerMe = !spesaPerMe;
      msg("", false);
      render();
      return;
    }
    if (act === "spesa-wa") {
      await mandaWhatsApp(nodo.dataset.fornitore || "", nodo.dataset.tel || "");
      return;
    }
    if (act === "spesa-pdf") {
      const fornitore = nodo.dataset.fornitore || "";
      const righe = righeDelFornitore(fornitore);
      if (!righe.length) { msg("Niente da stampare.", true); render(); return; }
      const bytes = ErpPdfLista.documento({
        fornitore: fornitore,
        data: ErpFormat.dataIT(oggi()),
        righe: righe.map(function (r) { return { quantita: r.quantita, codice: r.codice, nome: r.nome }; }),
      });
      scaricaBytes(bytes, nomeFileSpesa(fornitore), "application/pdf");
      msg("PDF pronto da mandare per email.", false);
      render();
      return;
    }
    if (act === "mail-aggiorna") {
      if (mailInCorso) return;
      mailVista = null;
      bozzaFattura = null;
      mailInCorso = true;
      render();
      scaricaMail(true);
      return;
    }
    if (act === "apri-mail") {
      const id = nodo.dataset.id || "";
      const p = ((mailVista && mailVista.pdf) || []).find(function (x) { return x.id === id; });
      if (!p || !p.letto || !p.letto.numero) return;
      msg("", false);
      vai("fattura/scheda/" + encodeURIComponent(p.letto.numero));
      return;
    }
    if (act === "modifica-carico") {
      caricoAperto = nodo.dataset.id || null;
      msg("", false);
      render();
      return;
    }
    if (act === "annulla-carico") {
      caricoAperto = null;
      msg("", false);
      render();
      return;
    }
    if (act === "conferma-mano") {
      const b = bozzaMano;
      if (!b || b.stale) { msg("Controlla di nuovo prima di confermare.", true); render(); return; }
      const esito = ErpAzioni.registraCarico(stato, {
        at: ErpFormat.componiAt(b.data, ErpFormat.oraAdesso()),
        idIngrediente: b.id,
        quantita: b.quantita,
        fornitore: b.fornitore,
        prezzoUdm: b.prezzo,
        diretto: true,
        note: "Senza fattura",
      });
      if (!esito.ok) { msg(esito.errore, true); render(); return; }
      bozzaMano = null;
      msg("Carico senza fattura registrato. Non entra nel confronto dei prezzi.", false);
      await persisti();
      return;
    }
    if (act === "unita-qta") {
      const box = nodo.closest("[data-qta-box]");
      if (!box) return;
      const unita = nodo.dataset.unita || "";
      box.querySelectorAll("[data-act='unita-qta']").forEach(function (b) {
        b.setAttribute("aria-pressed", b === nodo ? "true" : "false");
      });
      const input = box.querySelector("[data-qta]");
      input.disabled = false;
      input.dataset.unita = unita;
      input.setAttribute("inputmode", unita === "g" || unita === "PZ" ? "numeric" : "decimal");
      input.placeholder = unita === "g" ? "30000" : (unita === "kg" ? "30" : (unita === "cl" ? "75" : (unita === "PZ" ? "6" : "1,5")));
      const memorizzato = box.dataset.valore || "";
      input.value = memorizzato !== "" ? ErpUnita.testo(memorizzato, unita) : "";
      input.focus();
      return;
    }
    if (act === "prev-wa") {
      const url = nodo.dataset.url || "";
      const fornitore = nodo.dataset.fornitore || "";
      if (!url) return;
      const testo = testoWhatsAppPreventivo(fornitore, url, nodo.dataset.scade || "");
      window.open("https://wa.me/?text=" + encodeURIComponent(testo), "_blank", "noopener");
      return;
    }
    if (act === "prev-copia") {
      const url = nodo.dataset.url || "";
      if (!url) return;
      let ok = copiaConTextarea(url);
      if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(url);
          ok = true;
        } catch (e) { ok = false; }
      }
      copiaAvviso = ok ? "Link copiato" : "";
      copiaAvvisoUrl = ok ? url : "";
      msg(ok ? "Link copiato." : "Non sono riuscito a copiare il link.", !ok);
      render();
      return;
    }
    if (act === "prev-carica") {
      const token = nodo.dataset.token || "";
      const l = (preventiviServer || []).find(function (x) { return x.token === token; });
      if (!l || !ErpPreventiviServer.daLeggere(l.stato)) return;
      const origine = "prev-" + token;
      let caricati = 0;
      let saltati = 0;
      (l.righe || []).forEach(function (r) {
        let idIng = r.id;
        if (r.alternativo) {
          const sel = document.querySelector('[data-associa="' + String(r.id).replace(/"/g, "") + '"]');
          idIng = sel ? sel.value : "";
          if (!idIng) { saltati += 1; return; }
        }
        const gia = (stato.offerte || []).some(function (o) {
          return o.origine === origine && ErpEngine.codice(o.idIngrediente) === ErpEngine.codice(idIng);
        });
        if (gia) return;
        const art = (l.articoli || []).find(function (a) { return a.id === idIng; });
        const esito = ErpAzioni.registraOfferta(stato, {
          idIngrediente: idIng,
          fornitore: l.fornitore,
          tipo: "preventivo",
          data: l.inviato,
          prezzoUdm: r.prezzo,
          qtaConfezione: r.confezione,
          origine: origine,
          nome: (art && art.nome) || r.nome,
        });
        if (!esito || esito.ok === false) { saltati += 1; return; }
        caricati += 1;
        if (r.codice) {
          stato.codici = ErpCodici.registra(stato.codici || [], {
            codice: r.codice,
            tipo: "fornitore",
            fornitore: l.fornitore,
            id: idIng,
          });
        }
      });
      if (!caricati) {
        msg(saltati ? "Associa l'articolo alternativo a uno già in magazzino, poi premi Carica." : "Non c'è un prezzo da caricare.", true);
        render();
        return;
      }
      try { await ErpDb.salva(stato); }
      catch (e) { msg("Non sono riuscito a salvare in questo browser. Scarica il backup da Dati.", true); render(); return; }
      try {
        await fetch(urlApiPreventivo("/api/preventivi/" + encodeURIComponent(token) + "/importato"), { method: "POST" });
        l.stato = "importato";
      } catch (e) { /* il prezzo è già nel confronto: al prossimo giro non lo duplico */ }
      msg(saltati
        ? "Prezzi caricati. L'articolo alternativo senza associazione non entra in magazzino."
        : "Preventivo caricato. Entra nel confronto prezzi.", false);
      vai("preventivi");
      return;
    }
    if (act === "prev-scarta") {
      const token = nodo.dataset.token || "";
      try {
        await fetch(urlApiPreventivo("/api/preventivi/" + encodeURIComponent(token) + "/scarta"), { method: "POST" });
      } catch (e) {
        msg("Non sono riuscito a scartarlo. Il computer non risponde.", true);
        render();
        return;
      }
      preventiviServer = (preventiviServer || []).filter(function (x) { return x.token !== token; });
      msg("Preventivo scartato. Non entra nei prezzi.", false);
      vai("preventivi");
      return;
    }
    if (act === "cat-preventivo") {
      const nome = nodo.dataset.nome || "";
      const form = nodo.closest("form");
      const letto = form && form.querySelector('[name="fornitore"]');
      const giorniLetti = form && form.querySelector('[name="giorni"]');
      const ricorda = letto ? letto.value : "";
      const ricordaGiorni = giorniLetti ? giorniLetti.value : "";
      categoriePreventivo[nome] = !categoriePreventivo[nome];
      msg("", false);
      render();
      const dopo = document.querySelector('form[data-form="nuovo-preventivo"] [name="fornitore"]');
      const dopoGiorni = document.querySelector('form[data-form="nuovo-preventivo"] [name="giorni"]');
      if (dopo && ricorda) dopo.value = ricorda;
      if (dopoGiorni && ricordaGiorni) dopoGiorni.value = ricordaGiorni;
      return;
    }
    if (act === "unita-formato") {
      const form = nodo.closest("form");
      const prima = form && form.querySelector("[data-formato]");
      const gia = prima && prima.dataset ? (prima.dataset.unita || "") : "";
      const valore = prima && gia === (nodo.dataset.unita || "") ? prima.value : "";
      applicaUnitaFormato(form, nodo.dataset.unita || "", valore);
      if (prima) prima.focus();
      return;
    }
    if (act === "cat-ing") {
      const form = nodo.closest("form");
      const ricordi = ricordaNuovoIng(form);
      const idNascosto = form && form.querySelector('input[type="hidden"][name="id"]');
      if (idNascosto) modificaIng = { id: ErpEngine.codice(idNascosto.value), cat: nodo.dataset.nome || "" };
      else sceltaCatIng = nodo.dataset.nome || "";
      render();
      ripristinaNuovoIng(ricordi);
      const scelta = idNascosto ? (modificaIng && modificaIng.cat) : sceltaCatIng;
      if (scelta === "__nuova") {
        const campo = document.querySelector('form[data-form="ingrediente"] [name="categoria-nuova"]');
        if (campo) campo.focus();
      }
      return;
    }
    if (act === "cat-piatto") {
      const form = nodo.closest("form");
      const letto = function (nome) {
        const el = form && form.querySelector('[name="' + nome + '"]');
        return el ? el.value : "";
      };
      const ricordi = { nome: letto("nome"), listino: letto("listino"), nuova: letto("categoria-nuova") };
      sceltaCatPiatto = nodo.dataset.nome || "";
      render();
      const dopo = document.querySelector('form[data-form="piatto"]');
      if (dopo) {
        const nome = dopo.querySelector('[name="nome"]');
        const listino = dopo.querySelector('[name="listino"]');
        const campo = dopo.querySelector('[name="categoria-nuova"]');
        if (nome && ricordi.nome) nome.value = ricordi.nome;
        if (listino && ricordi.listino) listino.value = ricordi.listino;
        if (sceltaCatPiatto === "__nuova" && campo) {
          if (ricordi.nuova) campo.value = ricordi.nuova;
          aggiornaCodiceCategoria(campo.value);
          campo.focus();
        }
      }
      return;
    }
    if (act === "fattura-escludi") {
      if (!bozzaFattura || !bozzaFattura.righe) return;
      scrollDaTenere = window.scrollY;
      const i = Number(nodo.dataset.riga);
      const riga = bozzaFattura.righe[i];
      if (!riga || riga.caricata) return;
      riga.esclusa = !riga.esclusa;
      if (menuFattura && menuFattura.riga === i) menuFattura = null;
      render();
      ErpDb.salva(stato).catch(function () {
        msg("Non sono riuscito a salvare in questo browser. Scarica il backup da Dati.", true);
        render();
      });
      return;
    }
    if (act === "fattura-menu") {
      if (!bozzaFattura) return;
      scrollDaTenere = window.scrollY;
      const i = Number(nodo.dataset.riga);
      const stesso = menuFattura && menuFattura.numero === bozzaFattura.numero && menuFattura.riga === i;
      menuFattura = stesso ? null : { numero: bozzaFattura.numero, riga: i };
      if (menuFattura) gruppiAperti["fattura-scelta-" + i] = {};
      render();
      return;
    }
    if (act === "fattura-scegli") {
      if (!bozzaFattura || !bozzaFattura.righe) return;
      const i = Number(nodo.dataset.riga);
      const riga = bozzaFattura.righe[i];
      const id = nodo.dataset.id || "";
      if (!riga || riga.caricata || riga.esclusa || !id) return;
      riga.idMaster = id;
      memorizzaCodiciRiga(riga, id);
      menuFattura = null;
      pendingScrollRiga = i;
      render();
      ErpDb.salva(stato).catch(function () {
        msg("Non sono riuscito a salvare in questo browser. Scarica il backup da Dati.", true);
        render();
      });
      return;
    }
    if (act === "fattura-nuovo") {
      if (!bozzaFattura || !bozzaFattura.righe) return;
      const i = Number(nodo.dataset.riga);
      const riga = bozzaFattura.righe[i];
      if (!riga || riga.caricata || riga.esclusa) return;
      ritornoNuovo = { numero: bozzaFattura.numero, riga: i };
      vai("magazzino/nuovo");
      return;
    }
    if (act === "gruppo") {
      scrollDaTenere = window.scrollY;
      const pagina = nodo.dataset.pagina || "";
      const id = nodo.dataset.id || "";
      if (!gruppiAperti[pagina]) gruppiAperti[pagina] = {};
      gruppiAperti[pagina][id] = !gruppiAperti[pagina][id];
      render();
      return;
    }
    if (act === "mese" || act === "giorno" || act === "voce") {
      const id = nodo.dataset.id || "";
      const mappa = act === "mese" ? mesiAperti : (act === "giorno" ? giorniAperti : vociAperte);
      if (!mappa) return;
      mappa[id] = !mappa[id];
      render();
      return;
    }
    if (act === "cassa-aggiorna") {
      if (cassaInCorso) return;
      cassaVista = null;
      cassaInCorso = true;
      render();
      scaricaCassa(true);
      return;
    }
    if (act === "backup") {
      const blob = new Blob([JSON.stringify(stato, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "erp-leggero-" + oggi() + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      return;
    }
    if (act === "stampa") {
      window.print();
      return;
    }
    if (act === "elimina-carico") {
      if (!window.confirm("Tolgo questo carico? Se aveva un prezzo, tolgo anche quello dal confronto.")) return;
      ErpAzioni.eliminaCarico(stato, nodo.dataset.id);
      msg("Carico tolto.", false);
      await persisti();
      return;
    }
    if (act === "elimina-vendita") {
      if (!window.confirm("Tolgo questa vendita?")) return;
      ErpAzioni.eliminaVendita(stato, nodo.dataset.id);
      msg("Vendita tolta.", false);
      await persisti();
      return;
    }
    if (act === "elimina-inventario") {
      if (!window.confirm("Tolgo questo conteggio? Lo sfrido si ricalcola.")) return;
      ErpAzioni.eliminaInventario(stato, nodo.dataset.id);
      msg("Conteggio tolto.", false);
      await persisti();
      return;
    }
    if (act === "elimina-offerta") {
      if (!window.confirm("Tolgo questo prezzo dal confronto?")) return;
      ErpAzioni.eliminaOfferta(stato, nodo.dataset.id);
      msg("Prezzo tolto.", false);
      await persisti();
      return;
    }
    if (act === "togli-riga") {
      await togliRigaRicetta(nodo.dataset.piatto, nodo.dataset.ing);
      return;
    }
    if (act === "elimina-piatto") {
      if (!window.confirm("Elimino il piatto e la sua ricetta?")) return;
      const id = ErpEngine.codice(nodo.dataset.id);
      stato.piatti = (stato.piatti || []).filter(function (p) { return ErpEngine.codice(p.id) !== id; });
      stato.ricette = (stato.ricette || []).filter(function (r) { return ErpEngine.codice(r.idPiatto) !== id; });
      msg("Piatto eliminato.", false);
      await ErpDb.salva(stato);
      vai("ricette");
      return;
    }
    if (act === "archivia") {
      const id = ErpEngine.codice(nodo.dataset.id);
      const ing = (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === id; });
      if (!ing) return;
      ing.attivo = ing.attivo === false;
      msg(ing.attivo ? "Prodotto rimesso in uso." : "Prodotto archiviato: non entra più nella spesa.", false);
      await persisti();
    }
  }

  async function onFile(file) {
    if (!file) return;
    if ((stato.ingredienti || []).length && !window.confirm("Sostituisco i dati di questo browser con il file?")) return;
    let json;
    try { json = JSON.parse(await file.text()); }
    catch (e) { msg("Questo file non è un JSON.", true); render(); return; }
    try { stato = ErpEngine.normalizzaStato(json); }
    catch (e) { msg(e.message || "File non riconosciuto", true); render(); return; }
    const chiuso = await chiudiConteggioSeScade();
    msg(chiuso ? "Backup caricato. Un conteggio già scaduto è stato chiuso alle 23:59." : "Backup caricato.", false);
    programmaChiusura();
    await persisti();
  }

  document.body.addEventListener("submit", function (e) {
    const form = e.target;
    if (!form || !form.dataset || !form.dataset.form) return;
    e.preventDefault();
    onSubmit(form).catch(function (err) {
      msg(err && err.message ? err.message : "Errore", true);
      render();
    });
  });

  document.body.addEventListener("click", function (e) {
    const nodo = e.target.closest("[data-act]");
    if (!nodo) return;
    onClick(nodo.dataset.act, nodo).catch(function (err) {
      msg(err && err.message ? err.message : "Errore", true);
      render();
    });
  });

  document.body.addEventListener("change", function (e) {
    if (e.target && e.target.id === "file-fattura") {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      apriFattura(file);
      return;
    }
    if (e.target && e.target.id === "file-backup") {
      const file = e.target.files && e.target.files[0];
      e.target.value = "";
      onFile(file);
      return;
    }
    const t = e.target;
    if (t && t.dataset && t.dataset.fatturaRiga != null && bozzaFattura && bozzaFattura.righe) {
      const i = Number(t.dataset.fatturaRiga);
      const r = bozzaFattura.righe[i];
      if (!r || r.caricata) return;
      r.idMaster = t.value;
      if (r.idMaster && r.idMaster !== "__nuovo") memorizzaCodiciRiga(r, r.idMaster);
      render();
      ErpDb.salva(stato).catch(function () {
        msg("Non sono riuscito a salvare in questo browser. Scarica il backup da Dati.", true);
        render();
      });
      return;
    }
    if (t && t.form && t.form.dataset.form === "mano" && bozzaMano && !bozzaMano.stale) {
      bozzaMano.stale = true;
      const box = document.getElementById("mano-ok");
      if (box) box.hidden = true;
    }
    if (!t || !t.form || (t.name !== "udm" && t.name !== "ing")) return;
    const prima = t.form.dataset.unita || "";
    syncPeso(t.form);
    if (t.form.dataset.unita !== prima) {
      t.form.querySelectorAll("[data-qta-box]").forEach(function (box) {
        disegnaTastiUnita(box, t.form.dataset.unita);
      });
    }
  });

  let selezionePronta = null;

  document.addEventListener("focusin", function (e) {
    const el = e.target;
    if (!el || !el.matches || !el.matches("input, textarea")) return;
    const tipo = String(el.getAttribute("type") || "").toLowerCase();
    if (tipo === "checkbox" || tipo === "date" || tipo === "time" || tipo === "file" || tipo === "radio") return;
    selezionePronta = el;
    setTimeout(function () {
      if (selezionePronta !== el || document.activeElement !== el) return;
      try { el.setSelectionRange(0, el.value.length); } catch (err) { /* il campo non accetta la selezione */ }
    }, 0);
  });

  document.addEventListener("input", function (e) {
    const el = e.target;
    if (!el) return;
    if (el.dataset && el.dataset.fatturaNuovo != null && bozzaFattura && bozzaFattura.righe) {
      const i = Number(el.dataset.fatturaNuovo);
      if (bozzaFattura.righe[i]) bozzaFattura.righe[i].codiceNuovo = el.value;
    }
    if (el.form && el.form.dataset.form === "mano" && bozzaMano && !bozzaMano.stale) {
      bozzaMano.stale = true;
      const box = document.getElementById("mano-ok");
      if (box) box.hidden = true;
    }
    if (el.dataset && el.dataset.qta) {
      const u = el.dataset.unita || "";
      let q = el.value;
      if (u === "g" || u === "PZ") q = q.replace(/\D/g, "");
      else {
        q = q.replace(/\./g, ",").replace(/[^\d,]/g, "");
        const iq = q.indexOf(",");
        if (iq >= 0) q = q.slice(0, iq + 1) + q.slice(iq + 1).replace(/,/g, "");
      }
      if (q !== el.value) {
        el.value = q;
        try { el.setSelectionRange(q.length, q.length); } catch (err) { /* ignora */ }
      }
      return;
    }
    if (!el || !el.dataset || (!el.dataset.modo && !el.dataset.voce)) return;
    selezionePronta = null;
    const modo = el.dataset.modo || "";
    const voce = el.dataset.voce || "";
    let v = el.value;
    if (modo === "euro") v = cifreEuro(v);
    else if (modo === "grammi" || modo === "intero") v = v.replace(/\D/g, "");
    else if (modo === "decimale") {
      v = v.replace(/\./g, ",").replace(/[^\d,]/g, "");
      const i = v.indexOf(",");
      if (i >= 0) v = v.slice(0, i + 1) + v.slice(i + 1).replace(/,/g, "");
    }
    if (voce === "nome" || voce === "codice") v = v.toLocaleUpperCase("it");
    else if (voce === "testo" && v) v = v.charAt(0).toLocaleUpperCase("it") + v.slice(1);
    if (v !== el.value) {
      el.value = v;
      try { el.setSelectionRange(v.length, v.length); } catch (err) { /* ignora */ }
    }
    if (el.name === "categoria-nuova") aggiornaCodiceCategoria(el.value);
  });

  function aggiornaCodiceCategoria(nome) {
    const vis = document.getElementById("codice-visibile");
    if (!vis) return;
    const form = vis.closest("form");
    const lettere = ErpCodicePiatto.lettereCategoria(nome);
    if (form && form.dataset.form === "ingrediente") {
      vis.textContent = lettere.length >= 3
        ? ErpCodicePiatto.prossimoCodiceIngrediente(stato.ingredienti, nome, ErpEngine.codice)
        : "—";
      return;
    }
    vis.textContent = lettere.length >= 3
      ? ErpCodicePiatto.prossimoCodice(stato.piatti, nome, ErpEngine.codice)
      : "—";
  }

  window.addEventListener("hashchange", function () {
    const r = route();
    const sulNuovo = r.name === "magazzino" && r.a === "nuovo";
    if (ritornoNuovo && !sulNuovo) {
      const dest = ritornoNuovo;
      ritornoNuovo = null;
      if (r.name === "fattura" && r.a === "scheda" && String(r.b) === String(dest.numero) && pendingScrollRiga == null) {
        pendingScrollRiga = dest.riga;
      }
    }
    render();
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible" || !stato) return;
    const scaduti = togliPresiScaduti();
    const dopo = function () { chiudiConteggioSeScade().then(avvisaChiusura); };
    if (!scaduti) { dopo(); return; }
    ErpDb.salva(stato).then(function () {
      if (route().name === "spesa") render();
      dopo();
    });
  });

  let timerInfo = 0;
  let infoAperto = false;
  let puntatore = "mouse";
  let partenza = null;

  function fermaPressione() {
    clearTimeout(timerInfo);
    timerInfo = 0;
    if (partenza && partenza.riga) partenza.riga.classList.remove("tiene");
    partenza = null;
  }

  let scorri = null;
  let bloccaClick = false;

  async function togliRigaRicetta(piatto, ing) {
    const idPiatto = ErpEngine.codice(piatto);
    const idIng = ErpEngine.codice(ing);
    stato.ricette = (stato.ricette || []).filter(function (r) {
      return !(ErpEngine.codice(r.idPiatto) === idPiatto && ErpEngine.codice(r.idIngrediente) === idIng);
    });
    if (navigator.vibrate) navigator.vibrate(20);
    msg("Ingrediente tolto dalla ricetta.", false);
    await persisti();
  }

  document.addEventListener("pointerdown", function (e) {
    if (e.target.closest(".tasto-i, button, input, select, textarea")) return;
    const box = e.target.closest(".scorri");
    if (!box) return;
    const faccia = box.querySelector(".scorri-faccia");
    if (!faccia) return;
    scorri = { box: box, faccia: faccia, id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, attivo: false, soglia: false };
    box.classList.add("trascina");
  });

  document.addEventListener("pointermove", function (e) {
    if (!scorri || e.pointerId !== scorri.id) return;
    const dx = e.clientX - scorri.x;
    const dy = e.clientY - scorri.y;
    if (!scorri.attivo) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
        scorri.box.classList.remove("trascina");
        scorri = null;
        return;
      }
      if (Math.abs(dx) < 10) return;
      scorri.attivo = true;
    }
    const x = Math.max(-140, Math.min(0, dx));
    scorri.dx = x;
    scorri.faccia.style.transform = "translateX(" + x + "px)";
    const pronto = x < -72;
    if (pronto && !scorri.soglia) {
      scorri.soglia = true;
      if (navigator.vibrate) navigator.vibrate(12);
    }
    if (!pronto) scorri.soglia = false;
    scorri.box.classList.toggle("pronto", pronto);
  });

  function chiudiScorro(e) {
    if (!scorri || (e && e.pointerId !== scorri.id)) return;
    const s = scorri;
    scorri = null;
    s.box.classList.remove("trascina");
    if (s.attivo && s.dx < -72) {
      bloccaClick = true;
      if (s.box.dataset.togli === "preso") {
        s.faccia.style.transform = "";
        s.box.classList.remove("pronto");
        segnaPreso(s.box.dataset.id || "");
        return;
      }
      attendiConferma(s);
      return;
    }
    s.faccia.style.transform = "";
    s.box.classList.remove("pronto");
    if (s.attivo) bloccaClick = true;
  }

  document.addEventListener("pointerup", chiudiScorro);
  document.addEventListener("pointercancel", chiudiScorro);

  document.addEventListener("click", function (e) {
    if (!bloccaClick) return;
    bloccaClick = false;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  let attesa = null;

  function attendiConferma(s) {
    attesa = s;
    const testo = document.getElementById("conferma-testo");
    const box = document.getElementById("conferma");
    if (testo) testo.textContent = s.box.dataset.domanda || ("Togliere " + (s.box.dataset.nome || "questa riga") + "?");
    if (box) box.hidden = false;
  }

  function annullaConferma() {
    const box = document.getElementById("conferma");
    if (box) box.hidden = true;
    if (attesa) {
      attesa.faccia.style.transform = "";
      attesa.box.classList.remove("pronto");
    }
    attesa = null;
  }

  function confermaTogli() {
    const s = attesa;
    const box = document.getElementById("conferma");
    if (box) box.hidden = true;
    attesa = null;
    if (!s) return;
    const tipo = s.box.dataset.togli || "riga";
    if (tipo === "riga") {
      togliRigaRicetta(s.box.dataset.piatto, s.box.dataset.ing);
      return;
    }
    if (tipo === "offerta") {
      ErpAzioni.eliminaOfferta(stato, s.box.dataset.id);
      msg("Prezzo tolto.", false);
    } else if (tipo === "preventivo") {
      const origine = s.box.dataset.id;
      stato.offerte = (stato.offerte || []).filter(function (o) { return o.origine !== origine; });
      const token = String(origine || "").replace(/^prev-/, "");
      fetch(urlApiPreventivo("/api/preventivi/" + encodeURIComponent(token) + "/togli"), { method: "POST" }).catch(function () {});
      msg("Preventivo tolto. La giacenza non cambia.", false);
    } else if (tipo === "carico") {
      ErpAzioni.eliminaCarico(stato, s.box.dataset.id);
      if (caricoAperto === s.box.dataset.id) caricoAperto = null;
      msg("Carico tolto.", false);
    } else if (tipo === "vendita") {
      ErpAzioni.eliminaVendita(stato, s.box.dataset.id);
      msg("Vendita tolta.", false);
    } else if (tipo === "piatto") {
      const id = ErpEngine.codice(s.box.dataset.id);
      stato.piatti = (stato.piatti || []).filter(function (p) { return ErpEngine.codice(p.id) !== id; });
      stato.ricette = (stato.ricette || []).filter(function (r) { return ErpEngine.codice(r.idPiatto) !== id; });
      msg("Piatto eliminato.", false);
    } else {
      return;
    }
    if (navigator.vibrate) navigator.vibrate(20);
    persisti();
  }

  document.addEventListener("pointerdown", function (e) {
    if (e.target.closest("button, input, select, textarea, a.indietro")) return;
    const zona = e.target.closest(".riga, .giorni, .scheda-conta");
    const marca = e.target.closest("[data-info]") || (zona && zona.querySelector("[data-info]"));
    if (!marca) return;
    const riga = marca.closest(".riga, .giorni, .scheda-conta") || marca;
    partenza = { x: e.clientX, y: e.clientY, id: marca.dataset.info, riga: riga };
    riga.classList.add("tiene");
    timerInfo = setTimeout(function () {
      infoAperto = true;
      bloccaClick = true;
      riga.classList.remove("tiene");
      if (navigator.vibrate) navigator.vibrate(15);
      apriFoglio(infoTesti[marca.dataset.info] || "");
      partenza = null;
    }, 2000);
  });

  document.addEventListener("pointermove", function (e) {
    if (!partenza) return;
    if (Math.abs(e.clientX - partenza.x) > 14 || Math.abs(e.clientY - partenza.y) > 14) fermaPressione();
  });

  document.addEventListener("pointerup", function () {
    fermaPressione();
  });
  document.addEventListener("pointercancel", fermaPressione);

  const no = document.getElementById("conferma-no");
  const si = document.getElementById("conferma-si");
  if (no) no.addEventListener("click", annullaConferma);
  if (si) si.addEventListener("click", confermaTogli);

  document.addEventListener("contextmenu", function (e) {
    if (e.target.closest && e.target.closest(".riga, .giorni, .scorri, .scheda-conta")) e.preventDefault();
  });

  try { applicaStile(localStorage.getItem("erp-leggero-stile") || "sistema"); } catch (e) { applicaStile("sistema"); }

  const chiudi = document.getElementById("foglio-x");
  if (chiudi) chiudi.addEventListener("click", chiudiFoglio);
  const tastoIndietro = document.getElementById("indietro");
  if (tastoIndietro) tastoIndietro.addEventListener("click", tornaIndietro);

  function masterDi(id) {
    return (stato.ingredienti || []).find(function (i) { return ErpEngine.codice(i.id) === ErpEngine.codice(id); }) || null;
  }

  function idPerRigaFattura(r) {
    const noto = ErpCodici.trova(stato.codici || [], {
      ean: r.gtin,
      codice: r.codice,
      fornitore: r.fornitore || "Metro",
    });
    if (noto.id) return noto.id;
    return ErpMetro.scegliMaster(r, stato.ingredienti, {}) || "";
  }

  function memorizzaCodiciRiga(r, id) {
    if (r.gtin && ErpCodici.eEan(r.gtin)) {
      stato.codici = ErpCodici.registra(stato.codici || [], { codice: r.gtin, tipo: "ean", id: id });
    }
    if (r.codice && ErpCodici.eEan(r.codice)) {
      stato.codici = ErpCodici.registra(stato.codici || [], { codice: r.codice, tipo: "ean", id: id });
    } else if (r.codice) {
      stato.codici = ErpCodici.registra(stato.codici || [], {
        codice: r.codice,
        tipo: "fornitore",
        fornitore: r.fornitore || "Metro",
        id: id,
      });
    }
    if (r.codice && !r.prova) metroExtra.mappa[r.codice] = id;
  }

  function masterPerCarico(r) {
    if (r.idMaster !== "__nuovo") return masterDi(r.idMaster);
    const id = ErpEngine.codice(r.codiceNuovo);
    if (!id) return null;
    const gia = masterDi(id);
    if (gia) return gia;
    const udm = r.udm === "L" || r.udm === "pz" ? r.udm : "kg";
    return {
      id: id,
      nome: String(r.descrizione || id).trim(),
      categoria: "",
      udm: udm,
      tipo: "POS",
      attivo: true,
      nuovo: true,
    };
  }

  function completaFattura(fattura, bytes, nome) {
    if ((fattura.righe || []).length) {
      fattura.righe.forEach(function (r) {
        r.idMaster = idPerRigaFattura(r);
      });
      if (bytes) fattura.impronta = ErpMetro.impronta(bytes);
      fattura.nomeFile = nome || "";
      fattura.doppia = ErpMetro.giaCaricata(metroExtra.caricate, fattura);
    }
    return fattura;
  }

  async function apriFattura(file) {
    if (!file) return;
    msg("Leggo la fattura…", false);
    render();
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      const testo = await ErpPdf.leggiTesto(bytes.slice());
      const fattura = ErpMetro.leggi(testo);
      if (!fattura.righe.length) {
        bozzaFattura = { errore: fattura.errore || "Non ho letto righe.", righe: [] };
        msg("", false);
        render();
        return;
      }
      completaFattura(fattura, bytes, file.name || "");
      fattura.nomeFile = file.name || "";
      const salvata = accogliFattura(fattura);
      if (!salvata) {
        bozzaFattura = { errore: fattura.errore || "Non ho letto righe.", righe: [] };
        msg("", false);
        render();
        return;
      }
      await ErpDb.salva(stato);
      msg("", false);
      vai("fattura/scheda/" + encodeURIComponent(salvata.numero));
    } catch (e) {
      bozzaFattura = { errore: "Non riesco a leggere questo PDF.", righe: [] };
      msg("", false);
      render();
    }
  }

  async function confermaFattura() {
    const b = bozzaFattura;
    if (!b || !(b.righe || []).length) return;
    const at = (b.data || oggi()) + "T18:00:00";
    let n = 0;
    b.righe.forEach(function (r) {
      if (r.prova || r.caricata || r.esclusa) return;
      const master = masterPerCarico(r);
      const eff = ErpMetro.effettoCarico(r, master && master.nuovo ? master : master);
      if (!eff.entra) return;
      if (master.nuovo) {
        delete master.nuovo;
        stato.ingredienti.push(master);
      }
      const esito = ErpAzioni.registraCarico(stato, {
        at: at,
        idIngrediente: master.id,
        quantita: eff.qta,
        fornitore: b.fornitore || "Metro",
        prezzoUdm: eff.prezzoUdm,
        qtaConfezione: eff.qtaConfezione,
        note: "Fattura Metro " + (b.numero || "") + (r.codice ? " " + r.codice : ""),
      });
      if (!esito.ok) return;
      n += 1;
      r.caricata = true;
      r.caricoId = esito.id;
      r.idMaster = master.id;
      memorizzaCodiciRiga(r, master.id);
    });
    if (!n) {
      msg("Nessuna riga nuova da caricare. Quelle già entrate restano dov'erano.", true);
      render();
      return;
    }
    const giaSegnata = (metroExtra.caricate || []).some(function (c) { return c.numero && c.numero === b.numero; });
    if (!giaSegnata) metroExtra.caricate.push({ fornitore: "metro", numero: b.numero || "", impronta: b.impronta || "", at: at });
    if (b.mailMessageId) mailVisti.id.push("m:" + b.mailMessageId);
    if (b.mailSha) mailVisti.id.push("s:" + b.mailSha);
    if (mailVista && mailVista.pdf && b.mailSha) {
      mailVista.pdf.forEach(function (p) {
        if (p.id === b.mailSha) p.nascosto = true;
      });
    }
    try {
      await ErpDb.salva(stato);
      await ErpDb.salvaMetro(metroExtra);
      if (b.mailMessageId || b.mailSha) await ErpDb.salvaMail(mailVisti);
      if (b.mailMessageId || b.mailSha) {
        try {
          await fetch("fatture-mail/presa", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId: b.mailMessageId || "", id: b.mailSha || "" }),
          });
        } catch (e) { /* la mail resta nascosta in questo browser */ }
      }
    } catch (e) {
      msg("Non sono riuscito a salvare in questo browser. Scarica il backup da Dati.", true);
      render();
      return;
    }
    const conti = contiFattura(b);
    msg("Ho caricato " + n + " righe della fattura Metro" + (b.numero ? " " + b.numero : "") + ". " + conti.caricate + " già in magazzino, " + conti.daAssociare + " ancora da associare.", false);
    render();
  }

  async function scaricaCassa(fresco) {
    cassaInCorso = true;
    let data = null;
    try {
      const res = await fetch("cassa-drive" + (fresco ? "?fresco=1" : ""), { cache: "no-store" });
      data = await res.json();
    } catch (e) {
      data = { ok: false, errore: "Non raggiungo il foglio Drive da questo computer." };
    }
    if (!data || data.ok === false) {
      cassaInCorso = false;
      cassaVista = { ok: false, errore: (data && data.errore) || "Non raggiungo il foglio Drive." };
      render();
      return;
    }
    const noti = {};
    (cassaExtra.id || []).forEach(function (id) { noti[id] = true; });
    (stato.vendite || []).forEach(function (v) {
      if (v && v.id) noti["ven:" + v.id] = true;
    });
    let nuovi = 0;
    (data.fogli || []).forEach(function (f) {
      const giorno = f.data || "";
      if (!giorno) return;
      (f.righe || []).forEach(function (r) {
        const chiave = r.id || ErpCassa.chiaveRiga(r.fileId, r.codice);
        if (!chiave || noti[chiave]) return;
        const piatto = piattoPerRigaPos(r);
        if (!piatto) return;
        const idVendita = "pos-" + String(r.fileId || "") + "-" + String(r.codice || "");
        if (noti["ven:" + idVendita]) {
          noti[chiave] = true;
          cassaExtra.id.push(chiave);
          return;
        }
        const prezzo = r.importo != null && Number(r.quantita) > 0 ? Number(r.importo) / Number(r.quantita) : "";
        const esito = ErpAzioni.registraVendita(stato, {
          id: idVendita,
          idPiatto: piatto.id,
          quantita: r.quantita,
          prezzoUnitario: prezzo,
          at: giorno + "T21:00:00",
        });
        if (!esito.ok) return;
        noti[chiave] = true;
        cassaExtra.id.push(chiave);
        nuovi += 1;
      });
    });
    if (nuovi) {
      try {
        await ErpDb.salva(stato);
        await ErpDb.salvaCassa(cassaExtra);
      } catch (e) {
        msg("Ho letto il Drive ma non sono riuscito a salvare in questo browser.", true);
      }
      if (!banner) msg("Dal Drive sono entrate " + nuovi + " vendite nuove.", false);
    }
    cassaInCorso = false;
    cassaVista = data;
    render();
  }

  async function scaricaMail(fresco) {
    const seq = ++mailSeq;
    mailInCorso = true;
    let data = null;
    try {
      const res = await fetch("fatture-mail" + (fresco ? "?fresco=1" : ""), { cache: "no-store" });
      data = await res.json();
    } catch (e) {
      data = { ok: false, errore: "Non raggiungo la cartella Drive Fatture Metro." };
    }
    if (seq !== mailSeq) return;
    if (!data || data.ok === false) {
      mailInCorso = false;
      mailVista = { ok: false, errore: (data && data.errore) || "Non raggiungo la cartella Drive Fatture Metro.", pdf: [] };
      if (paginaFattura()) render();
      return;
    }
    const pdf = (data.pdf || []).filter(function (p) { return p && p.id && !mailGiaVista(p); }).map(function (p) {
      return {
        id: String(p.id),
        messageId: p.messageId || "",
        nome: p.nome || "",
        mittente: p.mittente || "",
        oggetto: p.oggetto || "",
        data: p.data || "",
        letto: null,
        nascosto: false,
      };
    });
    mailVista = { ok: true, caselle: data.caselle || [], messaggio: data.messaggio || "Nessuna mail nuova.", pdf: pdf };
    mailInCorso = false;
    if (paginaFattura()) render();
    for (let i = 0; i < pdf.length; i++) {
      if (seq !== mailSeq) return;
      const p = pdf[i];
      try {
        const res = await fetch("fatture-mail/" + encodeURIComponent(p.id), { cache: "no-store" });
        if (!res.ok) throw new Error("manca");
        const buf = await res.arrayBuffer();
        const bytes = new Uint8Array(buf);
        const testo = await ErpPdf.leggiTesto(bytes.slice());
        const fattura = ErpMetro.leggi(testo);
        completaFattura(fattura, bytes, p.nome);
        fattura.nomeFile = p.nome;
        fattura.mailMessageId = p.messageId;
        fattura.mailSha = p.id;
        const salvata = accogliFattura(fattura);
        p.letto = salvata || { errore: fattura.errore || "Non ho letto righe.", righe: [] };
        if (salvata) {
          try { await ErpDb.salva(stato); } catch (e) { /* resta in memoria finché un salvataggio riesce */ }
        }
      } catch (e) {
        p.letto = { errore: "Non riesco a leggere questo PDF.", righe: [] };
      }
      if (seq === mailSeq && paginaFattura()) render();
    }
  }

  Promise.all([ErpDb.carica(), ErpDb.caricaMetro(), ErpDb.caricaCassa(), ErpDb.caricaMail()]).then(function (coppia) {
    if (window.ErpArchivio) {
      ErpArchivio.aggancia(ErpDb);
      ErpArchivio.quandoAvvisa(function (testo) { msg(testo, false); render(); });
    }
    stato = coppia[0];
    metroExtra = coppia[1] || { caricate: [], mappa: {} };
    cassaExtra = coppia[2] || { id: [] };
    mailVisti = coppia[3] || { id: [] };
    const primaCodici = JSON.stringify(stato.codici || []);
    stato.codici = ErpCodici.togliProva(stato.codici);
    stato.codici = ErpCodici.assorbiMappaMetro(stato.codici, metroExtra.mappa);
    const codiciCambiati = JSON.stringify(stato.codici) !== primaCodici;
    const presiVecchi = togliPresiScaduti();
    if (!codiciCambiati && !presiVecchi) return chiudiConteggioSeScade();
    return ErpDb.salva(stato).then(function () { return chiudiConteggioSeScade(); });
  }).then(function (chiuso) {
    if (chiuso) msg("Conteggio chiuso alle 23:59. Giacenza, sfrido e spesa usano i quantitativi contati.", false);
    programmaChiusura();
    if (!location.hash) location.hash = "#/oggi";
    render();
    if (window.ErpArchivio && ErpArchivio.entrato()) {
      ErpArchivio.sincronizza(stato).then(function (esito) { if (esito && esito.cambiato) render(); });
    }
    setInterval(function () {
      if (stato && route().name === "preventivi") aggiornaPreventivi();
      if (stato && window.ErpArchivio && ErpArchivio.entrato()) {
        ErpArchivio.sincronizza(stato, { soloSeNovita: true }).then(function (esito) { if (esito && esito.cambiato) render(); });
      }
    }, 8000);
    window.addEventListener("online", function () {
      if (stato && window.ErpArchivio && ErpArchivio.entrato()) {
        ErpArchivio.sincronizza(stato).then(function (esito) { if (esito && esito.cambiato) render(); });
      }
    });
  }).catch(function (e) {
    const vista = document.getElementById("vista");
    if (vista) vista.textContent = "Non riesco ad aprire i dati: " + (e && e.message ? e.message : e);
  });
})();
