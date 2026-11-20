var CACHE = "erp-leggero-79";
var FILE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "css/app.css?v=79",
  "js/format.js?v=79",
  "js/engine.js?v=79",
  "js/demo.js?v=79",
  "js/azioni.js?v=79",
  "vendor/pdf.min.js?v=79",
  "vendor/pdf.worker.min.js?v=79",
  "js/metro.js?v=79",
  "js/pdf_testo.js?v=79",
  "js/db.js?v=79",
  "js/cassa.js?v=79",
  "js/codice_piatto.js?v=79",
  "js/unita_qta.js?v=79",
  "js/conteggio.js?v=79",
  "js/codici.js?v=79",
  "js/archivio_config.js?v=79",
  "js/archivio_sync.js?v=79",
  "js/archivio.js?v=79",
  "js/preventivi_server.js?v=79",
  "js/pdf_lista.js?v=79",
  "js/ui.js?v=79"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(FILE); }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (chiavi) {
    return Promise.all(chiavi.filter(function (k) { return k !== CACHE; }).map(function (k) {
      return caches.delete(k);
    }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then(function (trovato) {
    return trovato || fetch(e.request);
  }));
});
