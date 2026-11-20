/* Testo di un PDF nel browser, con pdf.js venduto in vendor/.
   Le righe si ricostruiscono dalla posizione delle parole, come fa il Mac con pdfplumber. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ErpPdf = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function (root) {
  "use strict";

  function testoDaElementi(items) {
    const punti = [];
    (items || []).forEach(function (it) {
      if (!it || !it.str || !String(it.str).trim()) return;
      const tr = it.transform || [1, 0, 0, 1, 0, 0];
      punti.push({ x: tr[4], y: tr[5], w: it.width || 0, s: String(it.str) });
    });
    punti.sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    const righe = [];
    punti.forEach(function (p) {
      const ultima = righe[righe.length - 1];
      if (!ultima || Math.abs(ultima.y - p.y) > 3) righe.push({ y: p.y, pezzi: [p] });
      else ultima.pezzi.push(p);
    });
    return righe.map(function (r) {
      r.pezzi.sort(function (a, b) { return a.x - b.x; });
      let s = "";
      let fine = null;
      r.pezzi.forEach(function (p) {
        if (fine != null && p.x - fine > 1.5) s += " ";
        else if (s && !/\s$/.test(s) && !/^\s/.test(p.s)) s += " ";
        s += p.s;
        fine = p.x + (p.w || 0);
      });
      return s.replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").trim();
    }).filter(Boolean).join("\n");
  }

  function libreria() {
    return root && (root.pdfjsLib || root["pdfjs-dist/build/pdf"]);
  }

  async function leggiTesto(buffer) {
    const lib = libreria();
    if (!lib || !lib.getDocument) {
      throw new Error("Manca la libreria per leggere il PDF.");
    }
    if (lib.GlobalWorkerOptions) lib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js?v=78";
    const task = lib.getDocument({ data: buffer, disableWorker: false });
    const doc = await task.promise;
    const parti = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      parti.push("--- PAGINA " + i + " ---");
      parti.push(testoDaElementi(content.items));
    }
    if (doc.destroy) doc.destroy();
    return parti.join("\n");
  }

  return { testoDaElementi: testoDaElementi, leggiTesto: leggiTesto };
});
