const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const server = require("../js/preventivi_server");

test("dal sito pubblico il link si chiede al Mac", function () {
  assert.equal(
    server.url("https://vicodelcarmine.github.io", "/api/preventivi"),
    server.BASE + "/api/preventivi"
  );
});

test("sul Mac il link resta sulla stessa origine", function () {
  assert.equal(server.baseDi("http://127.0.0.1:8877"), "");
  assert.equal(server.baseDi("https://imac-di-ivo.tail178446.ts.net:8443"), "");
  assert.equal(server.url("http://127.0.0.1:8877", "/api/preventivi"), "/api/preventivi");
});

test("l'indirizzo del Mac è lo stesso del programma che tiene i link", function () {
  const servi = fs.readFileSync(path.join(__dirname, "../servi.py"), "utf8");
  const riga = servi.split("\n").find(function (l) { return l.startsWith("BASE_PUBBLICA = "); });
  assert.equal(riga, 'BASE_PUBBLICA = "' + server.BASE + '"');
});
