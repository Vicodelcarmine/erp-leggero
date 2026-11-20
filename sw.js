var CACHE = "erp-leggero-80";
var FILE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "css/app.css?v=80",
  "js/format.js?v=80",
  "js/engine.js?v=80",
  "js/demo.js?v=80",
  "js/azioni.js?v=80",
  "vendor/pdf.min.js?v=80",
  "vendor/pdf.worker.min.js?v=80",
  "js/metro.js?v=80",
  "js/pdf_testo.js?v=80",
  "js/db.js?v=80",
  "js/cassa.js?v=80",
  "js/codice_piatto.js?v=80",
  "js/unita_qta.js?v=80",
  "js/conteggio.js?v=80",
  "js/codici.js?v=80",
  "js/archivio_config.js?v=80",
  "js/archivio_sync.js?v=80",
  "js/archivio.js?v=80",
  "js/preventivi_server.js?v=80",
  "js/pdf_lista.js?v=80",
  "js/ui.js?v=80"
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
