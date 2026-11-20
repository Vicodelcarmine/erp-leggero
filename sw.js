var CACHE = "erp-leggero-78";
var FILE = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "css/app.css?v=78",
  "js/format.js?v=78",
  "js/engine.js?v=78",
  "js/demo.js?v=78",
  "js/azioni.js?v=78",
  "vendor/pdf.min.js?v=78",
  "vendor/pdf.worker.min.js?v=78",
  "js/metro.js?v=78",
  "js/pdf_testo.js?v=78",
  "js/db.js?v=78",
  "js/cassa.js?v=78",
  "js/codice_piatto.js?v=78",
  "js/unita_qta.js?v=78",
  "js/conteggio.js?v=78",
  "js/codici.js?v=78",
  "js/archivio_config.js?v=78",
  "js/archivio_sync.js?v=78",
  "js/archivio.js?v=78",
  "js/pdf_lista.js?v=78",
  "js/ui.js?v=78"
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
