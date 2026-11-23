var CACHE = "erp-leggero-82";
var FILE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "css/app.css?v=82",
  "js/format.js?v=82",
  "js/engine.js?v=82",
  "js/demo.js?v=82",
  "js/azioni.js?v=82",
  "vendor/pdf.min.js?v=82",
  "vendor/pdf.worker.min.js?v=82",
  "js/metro.js?v=82",
  "js/pdf_testo.js?v=82",
  "js/db.js?v=82",
  "js/cassa.js?v=82",
  "js/codice_piatto.js?v=82",
  "js/unita_qta.js?v=82",
  "js/conteggio.js?v=82",
  "js/codici.js?v=82",
  "js/archivio_config.js?v=82",
  "js/archivio_sync.js?v=82",
  "js/archivio.js?v=82",
  "js/preventivi_server.js?v=82",
  "js/pdf_lista.js?v=82",
  "js/ui.js?v=82"
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
