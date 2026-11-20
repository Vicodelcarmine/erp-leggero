/* Il link del preventivo lo crea il Mac, non GitHub.
   Dal sito pubblico le chiamate vanno all'indirizzo del computer acceso. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ErpPreventiviServer = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const BASE = "https://imac-di-ivo.tail178446.ts.net:8443";

  function baseDi(origine) {
    const o = String(origine || "");
    if (!o || o.indexOf("127.0.0.1") >= 0 || o.indexOf("localhost") >= 0 || o.indexOf("tail178446.ts.net") >= 0) {
      return "";
    }
    return BASE;
  }

  function url(origine, path) {
    return baseDi(origine) + path;
  }

  return { BASE: BASE, baseDi: baseDi, url: url };
});
