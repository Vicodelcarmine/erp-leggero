/* Collegamento all'archivio Supabase. La chiave anon sta nel telefono;
   la chiave service_role no. Senza indirizzo il telefono resta solo suo. */
(function (root) {
  "use strict";

  const CHIAVE_CFG = "erp-leggero-archivio";
  const CHIAVE_SESSIONE = "erp-leggero-sessione";
  const CHIAVE_ACK = "erp-leggero-ack";
  let sessione = null;
  let ack = {};
  let inAttesa = false;
  let occupato = false;
  let coda = Promise.resolve();
  let avvisa = function () {};
  let ultimoErrore = "";

  function memoria() {
    try { return root.localStorage; } catch (e) { return null; }
  }

  function leggiJson(chiave) {
    const box = memoria();
    if (!box) return null;
    try { return JSON.parse(box.getItem(chiave) || "null"); } catch (e) { return null; }
  }

  function scriviJson(chiave, valore) {
    const box = memoria();
    if (!box) return;
    if (valore == null) box.removeItem(chiave);
    else box.setItem(chiave, JSON.stringify(valore));
  }

  function chiavePulita(valore) {
    if (root.ErpArchivioSync && root.ErpArchivioSync.normalizzaChiave) {
      return root.ErpArchivioSync.normalizzaChiave(valore);
    }
    const testo = String(valore || "").trim().replace(/\s+/g, "");
    return testo.replace(/^sb_publishable_/i, "sb_publishable_");
  }

  function configFile() {
    const c = root.ErpArchivioConfig || {};
    return {
      url: String(c.url || "").trim().replace(/\/+$/, ""),
      chiave: chiavePulita(c.chiave),
    };
  }

  function config() {
    const file = configFile();
    const salvata = leggiJson(CHIAVE_CFG) || {};
    return {
      url: file.url || String(salvata.url || "").trim().replace(/\/+$/, ""),
      chiave: file.chiave || chiavePulita(salvata.chiave),
    };
  }

  function configurato() {
    const c = config();
    return !!(c.url && c.chiave);
  }

  function salvaConfig(url, chiave) {
    scriviJson(CHIAVE_CFG, {
      url: String(url || "").trim().replace(/\/+$/, ""),
      chiave: chiavePulita(chiave),
    });
  }

  function caricaSessione() {
    if (sessione) return sessione;
    const s = leggiJson(CHIAVE_SESSIONE);
    if (s && s.access_token) sessione = s;
    return sessione;
  }

  function entrato() {
    return !!(caricaSessione() && caricaSessione().access_token && configurato());
  }

  function email() {
    const s = caricaSessione();
    return s && s.email ? s.email : "";
  }

  function idUtente(token) {
    try {
      const parte = String(token || "").split(".")[1] || "";
      const json = JSON.parse(atob(parte.replace(/-/g, "+").replace(/_/g, "/")));
      return json.sub || "";
    } catch (e) {
      return "";
    }
  }

  function salvaSessione(data, mail) {
    const secondi = Number(data.expires_in) || 3600;
    sessione = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      scade: Date.now() + secondi * 1000,
      email: mail || (sessione && sessione.email) || "",
    };
    scriviJson(CHIAVE_SESSIONE, sessione);
  }

  function esci() {
    sessione = null;
    scriviJson(CHIAVE_SESSIONE, null);
    inAttesa = false;
  }

  function messaggioErrore(stato, corpo) {
    const basso = String(corpo || "").toLowerCase();
    if (basso.indexOf("invalid api key") >= 0) {
      return "La chiave anon non è quella giusta. Ricopiala, deve iniziare con sb_publishable_.";
    }
    if (stato === 400 && (basso.indexOf("invalid") >= 0 || basso.indexOf("credentials") >= 0)) {
      return "Email o password non giuste.";
    }
    if (stato === 404 || basso.indexOf("pgrst205") >= 0 || basso.indexOf("righe") >= 0 && basso.indexOf("schema") >= 0) {
      return "L'archivio non ha ancora la tabella. Esegui lo schema SQL su Supabase.";
    }
    return "Non raggiungo l'archivio.";
  }

  async function chiedi(percorso, opzioni) {
    const c = config();
    const headers = Object.assign({
      apikey: c.chiave,
      "Content-Type": "application/json",
    }, (opzioni && opzioni.headers) || {});
    let res;
    try {
      res = await fetch(c.url + percorso, {
        method: (opzioni && opzioni.method) || "GET",
        headers: headers,
        body: opzioni && opzioni.body != null ? opzioni.body : undefined,
        cache: "no-store",
      });
    } catch (e) {
      throw new Error("Non raggiungo l'archivio.");
    }
    const testo = await res.text();
    if (res.status === 416) return [];
    if (!res.ok) throw new Error(messaggioErrore(res.status, testo));
    if (!testo) return null;
    try { return JSON.parse(testo); } catch (e) { return null; }
  }

  async function rinnova() {
    const s = caricaSessione();
    if (!s || !s.refresh_token) throw new Error("Entra di nuovo da Dati.");
    const data = await chiedi("/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: s.refresh_token }),
    });
    salvaSessione(data, s.email);
  }

  async function token() {
    const s = caricaSessione();
    if (!s || !s.access_token) throw new Error("Entra da Dati.");
    if (s.scade > Date.now() + 60000) return s.access_token;
    await rinnova();
    return sessione.access_token;
  }

  async function entra(mail, password) {
    const data = await chiedi("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email: String(mail || "").trim(), password: String(password || "") }),
    });
    if (!data || !data.access_token) throw new Error("Email o password non giuste.");
    salvaSessione(data, String(mail || "").trim());
    ultimoErrore = "";
    inAttesa = false;
  }

  function inCoda(fn) {
    const run = coda.then(fn, fn);
    coda = run.then(function () {}, function () {});
    return run;
  }

  async function leggiRighe(access) {
    return root.ErpArchivioSync.raccogli(function (da, pagina) {
      return chiedi("/rest/v1/righe?select=collezione,id,corpo&order=collezione.asc,id.asc", {
        headers: {
          Authorization: "Bearer " + access,
          Range: da + "-" + (da + pagina - 1),
        },
      });
    });
  }

  async function scriviRighe(access, utente, invia) {
    if (!invia.length) return;
    const corpo = invia.map(function (r) {
      return { user_id: utente, collezione: r.collezione, id: r.id, corpo: r.corpo };
    });
    await chiedi("/rest/v1/righe?on_conflict=user_id,collezione,id", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + access,
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(corpo),
    });
  }

  async function cancellaRighe(access, togli) {
    const gruppi = {};
    togli.forEach(function (r) {
      if (!gruppi[r.collezione]) gruppi[r.collezione] = [];
      gruppi[r.collezione].push(r.id);
    });
    const nomi = Object.keys(gruppi);
    for (let i = 0; i < nomi.length; i++) {
      const nome = nomi[i];
      const lista = gruppi[nome].map(function (id) { return '"' + String(id).replace(/"/g, "") + '"'; }).join(",");
      await chiedi("/rest/v1/righe?collezione=eq." + encodeURIComponent(nome) + "&id=in.(" + lista + ")", {
        method: "DELETE",
        headers: { Authorization: "Bearer " + access, Prefer: "return=minimal" },
      });
    }
  }

  async function sincronizza(stato) {
    return inCoda(async function () {
      if (!stato || stato.demo || !entrato()) return { cambiato: false, errore: "" };
      if (occupato) return { cambiato: false, errore: "" };
      occupato = true;
      try {
        const access = await token();
        const utente = idUtente(access);
        if (!utente) throw new Error("Entra di nuovo da Dati.");
        const remote = root.ErpArchivioSync.daRighe(await leggiRighe(access));
        ack = leggiJson(CHIAVE_ACK) || ack || {};
        const notePrima = ((stato.note || []).map(function (n) { return n.id; }).sort().join("|"));
        const esito = root.ErpArchivioSync.unisci(stato, remote, ack);
        root.ErpArchivioSync.applica(stato, esito.stato);
        ack = esito.ack;
        for (let i = 0; i < esito.invia.length; i += 200) {
          await scriviRighe(access, utente, esito.invia.slice(i, i + 200));
        }
        if (esito.togli.length) await cancellaRighe(access, esito.togli);
        ack = root.ErpArchivioSync.confermaInvio(ack, esito.invia);
        scriviJson(CHIAVE_ACK, ack);
        inAttesa = false;
        ultimoErrore = "";
        const noteDopo = ((stato.note || []).map(function (n) { return n.id; }).sort().join("|"));
        if (noteDopo !== notePrima) {
          avvisa("C'è un conteggio doppio. Lo trovi in Oggi: tengo il più recente, l'altro è scritto lì.");
        }
        return { cambiato: esito.cambiato, errore: "" };
      } catch (e) {
        inAttesa = true;
        ultimoErrore = e && e.message ? e.message : "Non raggiungo l'archivio.";
        return { cambiato: false, errore: ultimoErrore };
      } finally {
        occupato = false;
      }
    });
  }

  function aggancia(db) {
    if (!db || db._archivio) return;
    const originale = db.salva.bind(db);
    db._archivio = true;
    db.salva = async function (s) {
      await originale(s);
      await sincronizza(s);
      if (inAttesa) return;
    };
  }

  caricaSessione();
  ack = leggiJson(CHIAVE_ACK) || {};

  root.ErpArchivio = {
    configurato: configurato,
    config: config,
    salvaConfig: salvaConfig,
    entrato: entrato,
    email: email,
    entra: entra,
    esci: esci,
    sincronizza: sincronizza,
    aggancia: aggancia,
    inAttesa: function () { return inAttesa; },
    errore: function () { return ultimoErrore; },
    quandoAvvisa: function (fn) { avvisa = typeof fn === "function" ? fn : avvisa; },
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
