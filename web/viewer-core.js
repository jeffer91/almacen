/* Nicole Encajes · lógica de la lista de precios familiar (sin DOM, probada con node --test). */
"use strict";
(function (scope) {
  const PRICE_SHOP = "jefferson";
  const DEFAULT_IVA = 15;

  function normalize(value) {
    return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "")
      .toLowerCase().replace(/[^a-z0-9ñ.,]+/g, " ").trim();
  }
  // Precio guardado = sin IVA (fijado por Jefferson en la app de administración).
  function priceOf(prices, presentationId) {
    const own = (prices || []).find((p) => p.presentation_id === presentationId && p.shop === PRICE_SHOP);
    return own ? Number(own.price) : null;
  }
  const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  function withIva(net, rate) {
    if (net === null || net === undefined) return null;
    return round2(Number(net) * (1 + (Number.isFinite(Number(rate)) ? Number(rate) : DEFAULT_IVA) / 100));
  }
  // Une productos, presentaciones y precios en tarjetas listas para mostrar.
  function buildCards(data) {
    const products = (data?.products || []).filter((p) => p.active !== false);
    const byProduct = new Map();
    for (const pr of data?.presentations || []) {
      if (!byProduct.has(pr.product_id)) byProduct.set(pr.product_id, []);
      byProduct.get(pr.product_id).push(pr);
    }
    const photosBy = new Map();
    for (const ph of data?.photos || []) {
      if (!photosBy.has(ph.product_id)) photosBy.set(ph.product_id, []);
      photosBy.get(ph.product_id).push(ph);
    }
    const rate = data?.iva_rate ?? DEFAULT_IVA;
    return products.map((p) => {
      const items = (byProduct.get(p.id) || [])
        .map((pr) => {
          const net = priceOf(data.prices, pr.id);
          const cost = pr.current_cost === null || pr.current_cost === undefined ? null : Number(pr.current_cost);
          return { id: pr.id, label: pr.label, quantity: pr.quantity, unit: pr.unit, sku: pr.sku || "", net, gross: withIva(net, rate), cost, price: withIva(net, rate) };
        })
        .sort((a, b) => Number(a.quantity) - Number(b.quantity) || String(a.label).localeCompare(String(b.label), "es"));
      const photos = (photosBy.get(p.id) || []).slice()
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || String(a.created_at).localeCompare(String(b.created_at)));
      const haystack = normalize([p.name, p.brand, p.category, ...items.map((i) => i.label + " " + (i.unit || "") + " " + i.sku)].join(" "));
      return { id: p.id, name: p.name, brand: p.brand || "", category: p.category || "", items, photos, haystack };
    }).sort((a, b) => a.name.localeCompare(b.name, "es"));
  }
  // Todas las palabras deben aparecer (en cualquier orden, sin importar tildes o mayúsculas).
  function search(cards, query, category = "") {
    const words = normalize(query).split(" ").filter(Boolean);
    return cards.filter((c) => (!category || c.category === category) &&
      words.every((w) => c.haystack.includes(w)));
  }
  function categories(cards) {
    return [...new Set(cards.map((c) => c.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
  }
  function pendingPhotos(cards, skipped = [], count = 3) {
    const skip = new Set(skipped);
    const missing = cards.filter((c) => !c.photos.length);
    return { total: missing.length, list: missing.filter((c) => !skip.has(c.id)).slice(0, count) };
  }
  function money(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "Pendiente";
    return "$" + Number(value).toFixed(2);
  }
  function rows(cards) {
    const out = [];
    for (const c of cards) {
      if (!c.items.length) out.push({ product: c.name, brand: c.brand, presentation: "—", cost: null, net: null, gross: null });
      for (const i of c.items) out.push({ product: c.name, brand: c.brand, presentation: i.label, cost: i.cost, net: i.net, gross: i.gross });
    }
    return out;
  }

  // ---- PDF mínimo (Helvetica, WinAnsi) sin librerías externas ----
  const W = { " ": 278, ".": 278, ",": 278, "$": 556, "-": 333 };
  function textWidth(text, size) {
    let total = 0;
    for (const ch of text) total += W[ch] ?? (/[0-9]/.test(ch) ? 556 : 600);
    return total * size / 1000;
  }
  function pdfText(text) {
    let out = "";
    for (const ch of String(text)) {
      const code = ch.charCodeAt(0);
      if (ch === "(" || ch === ")" || ch === "\\") out += "\\" + ch;
      else if (code < 32) out += " ";
      else if (code < 128) out += ch;
      else if (code < 256) out += "\\" + code.toString(8).padStart(3, "0");
      else out += "?";
    }
    return out;
  }
  function cut(text, max) {
    const s = String(text ?? "");
    return s.length > max ? s.slice(0, max - 3) + "..." : s;
  }
  function buildPdf(list, dateText = "") {
    const pageH = 842, top = 790, bottom = 50, line = 18;
    const pages = [];
    let ops = [], y = top, n = 0;
    const header = () => {
      ops.push("BT /F2 16 Tf 40 " + (pageH - 45) + " Td (" + pdfText("Nicole Encajes - Lista de precios") + ") Tj ET");
      ops.push("BT /F1 10 Tf 40 " + (pageH - 62) + " Td (" + pdfText(dateText) + ") Tj ET");
      ops.push("BT /F2 10 Tf 40 " + (top - 4) + " Td (Producto) Tj 210 0 Td (" + pdfText("Presentación") + ") Tj ET");
      for (const [label, x] of [["Costo", 395], ["Sin IVA", 475], ["Con IVA", 555]])
        ops.push("BT /F2 10 Tf " + (x - textWidth(label, 10)).toFixed(1) + " " + (top - 4) + " Td (" + pdfText(label) + ") Tj ET");
      ops.push("0.75 G 40 " + (top - 10) + " m 555 " + (top - 10) + " l S");
      y = top - 28;
    };
    header();
    for (const r of list) {
      if (y < bottom) { pages.push(ops.join("\n")); ops = []; header(); }
      if (n++ % 2 === 0) ops.push("0.96 g 36 " + (y - 5) + " 523 " + line + " re f 0 g");
      const name = cut(r.product + (r.brand ? " (" + r.brand + ")" : ""), 38);
      ops.push("BT /F1 10 Tf 40 " + y + " Td (" + pdfText(name) + ") Tj 210 0 Td (" + pdfText(cut(r.presentation, 18)) + ") Tj ET");
      for (const [value, x, bold] of [[r.cost, 395, false], [r.net, 475, false], [r.gross, 555, true]]) {
        const text = money(value);
        ops.push("BT /F" + (bold ? 2 : 1) + " 10 Tf " + (x - textWidth(text, 10)).toFixed(1) + " " + y + " Td (" + pdfText(text) + ") Tj ET");
      }
      y -= line;
    }
    if (!list.length) ops.push("BT /F1 12 Tf 40 " + y + " Td (" + pdfText("Todavía no hay productos.") + ") Tj ET");
    pages.push(ops.join("\n"));

    const objects = [];
    const add = (body) => { objects.push(body); return objects.length; };
    const catalog = add(""), pagesObj = add("");
    const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
    const kids = [];
    pages.forEach((content, i) => {
      const footer = "\nBT /F1 9 Tf 500 25 Td (" + pdfText("Página " + (i + 1) + " de " + pages.length) + ") Tj ET";
      const stream = content + footer;
      const c = add("<< /Length " + latin1Length(stream) + " >>\nstream\n" + stream + "\nendstream");
      kids.push(add("<< /Type /Page /Parent " + pagesObj + " 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 " + f1 + " 0 R /F2 " + f2 + " 0 R >> >> /Contents " + c + " 0 R >>"));
    });
    objects[catalog - 1] = "<< /Type /Catalog /Pages " + pagesObj + " 0 R >>";
    objects[pagesObj - 1] = "<< /Type /Pages /Kids [" + kids.map((k) => k + " 0 R").join(" ") + "] /Count " + kids.length + " >>";
    let pdf = "%PDF-1.4\n";
    const offsets = [];
    objects.forEach((body, i) => { offsets.push(latin1Length(pdf)); pdf += (i + 1) + " 0 obj\n" + body + "\nendobj\n"; });
    const xref = latin1Length(pdf);
    pdf += "xref\n0 " + (objects.length + 1) + "\n0000000000 65535 f \n" +
      offsets.map((o) => String(o).padStart(10, "0") + " 00000 n \n").join("") +
      "trailer\n<< /Size " + (objects.length + 1) + " /Root " + catalog + " 0 R >>\nstartxref\n" + xref + "\n%%EOF";
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 255;
    return bytes;
  }
  function latin1Length(text) { return text.length; }

  const api = Object.freeze({ PRICE_SHOP, normalize, priceOf, withIva, buildCards, search, categories, pendingPhotos, money, rows, buildPdf });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (scope) scope.NICOLE_VIEW = api;
})(typeof window !== "undefined" ? window : null);
