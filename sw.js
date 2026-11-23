var CACHE = "erp-leggero-83";
var FILE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "css/app.css?v=83",
  "js/format.js?v=83",
  "js/engine.js?v=83",
  "js/demo.js?v=83",
  "js/azioni.js?v=83",
  "vendor/pdf.min.js?v=83",
  "vendor/pdf.worker.min.js?v=83",
  "js/metro.js?v=83",
  "js/pdf_testo.js?v=83",
  "js/db.js?v=83",
  "js/cassa.js?v=83",
  "js/codice_piatto.js?v=83",
  "js/unita_qta.js?v=83",
  "js/conteggio.js?v=83",
  "js/codici.js?v=83",
  "js/archivio_config.js?v=83",
  "js/archivio_sync.js?v=83",
  "js/archivio.js?v=83",
  "js/preventivi_server.js?v=83",
  "js/pdf_lista.js?v=83",
  "js/ui.js?v=83"
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
