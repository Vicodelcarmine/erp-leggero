/* PDF della lista spesa, fatto nel browser. Solo fornitore, data, quantità, codice e nome. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.ErpPdfLista = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  function byteWin(ch) {
    const c = ch.codePointAt(0);
    if (c >= 32 && c <= 126) return c;
    if (c >= 0xA0 && c <= 0xFF) return c;
    if (c === 0x20AC) return 0x80;
    if (c === 0x2018 || c === 0x2019) return 0x92;
    if (c === 0x201C || c === 0x201D) return 0x94;
    if (c === 0x2013 || c === 0x2014) return 0x96;
    if (c === 0x2026) return 0x85;
    return 0x3F;
  }

  function pdfString(testo) {
    let out = "(";
    const s = String(testo || "");
    for (let i = 0; i < s.length; i++) {
      const b = byteWin(s[i]);
      if (b === 0x28 || b === 0x29 || b === 0x5C) out += "\\" + String.fromCharCode(b);
      else if (b < 32 || b > 126) out += "\\" + b.toString(8).padStart(3, "0");
      else out += String.fromCharCode(b);
    }
    return out + ")";
  }

  function spezza(testo, max) {
    const t = String(testo || "").replace(/\s+/g, " ").trim();
    if (!t) return [""];
    if (t.length <= max) return [t];
    const out = [];
    let resto = t;
    while (resto.length > max) {
      let taglio = resto.lastIndexOf(" ", max);
      if (taglio < 8) taglio = max;
      out.push(resto.slice(0, taglio).trim());
      resto = resto.slice(taglio).trim();
    }
    if (resto) out.push(resto);
    return out;
  }

  function blocchiDi(opts) {
    const out = [];
    function metti(font, size, testo, gap, max) {
      spezza(testo, max).forEach(function (riga, i, tutte) {
        out.push({ font: font, size: size, text: riga, gap: i === tutte.length - 1 ? gap : Math.round(size * 1.25) });
      });
    }
    metti("F1", 22, opts.fornitore || "Spesa", 32, 32);
    metti("F2", 14, opts.data || "", 40, 40);
    (opts.righe || []).forEach(function (r, i) {
      const ultimo = i === (opts.righe.length - 1);
      metti("F1", 16, r.quantita, 22, 42);
      metti("F2", 14, r.codice, 22, 42);
      metti("F1", 16, r.nome, ultimo ? 24 : 34, 36);
    });
    return out;
  }

  function impagina(blocchi) {
    const pagine = [];
    let corrente = [];
    let y = 790;
    blocchi.forEach(function (b) {
      if (y - b.gap < 56 && corrente.length) {
        pagine.push(corrente);
        corrente = [];
        y = 790;
      }
      corrente.push(b);
      y -= b.gap;
    });
    if (corrente.length) pagine.push(corrente);
    if (!pagine.length) pagine.push([]);
    return pagine;
  }

  function streamDi(blocchi) {
    let y = 790;
    let s = "BT\n";
    blocchi.forEach(function (b) {
      s += "/" + b.font + " " + b.size + " Tf\n";
      s += "1 0 0 1 48 " + y + " Tm\n";
      s += pdfString(b.text) + " Tj\n";
      y -= b.gap;
    });
    s += "ET\n";
    return s;
  }

  function documento(opts) {
    const pagine = impagina(blocchiDi(opts || {})).map(streamDi);
    const nPag = pagine.length;
    const fontBold = 3 + nPag * 2;
    const fontReg = fontBold + 1;
    const objects = [];
    const kids = [];
    for (let i = 0; i < nPag; i++) kids.push((3 + i) + " 0 R");
    objects.push("<< /Type /Catalog /Pages 2 0 R >>");
    objects.push("<< /Type /Pages /Kids [" + kids.join(" ") + "] /Count " + nPag + " >>");
    for (let i = 0; i < nPag; i++) {
      const contentId = 3 + nPag + i;
      objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents " + contentId + " 0 R /Resources << /Font << /F1 " + fontBold + " 0 R /F2 " + fontReg + " 0 R >> >> >>");
    }
    pagine.forEach(function (stream) {
      objects.push("<< /Length " + stream.length + " >>\nstream\n" + stream + "endstream");
    });
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    objects.forEach(function (body, i) {
      offsets.push(pdf.length);
      pdf += (i + 1) + " 0 obj\n" + body + "\nendobj\n";
    });
    const xref = pdf.length;
    pdf += "xref\n0 " + (objects.length + 1) + "\n";
    pdf += "0000000000 65535 f \n";
    for (let i = 1; i <= objects.length; i++) {
      pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
    }
    pdf += "trailer\n<< /Size " + (objects.length + 1) + " /Root 1 0 R >>\nstartxref\n" + xref + "\n%%EOF\n";
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(pdf);
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
    return bytes;
  }

  return { documento: documento };
});
