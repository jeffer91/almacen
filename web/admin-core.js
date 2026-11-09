/* Nicole Encajes · lógica de administración sin DOM (IVA, validación de cargas). Probada con node --test. */
"use strict";
(function (scope) {
  const DEFAULT_IVA = 15;
  const FIELDS = ["codigo", "producto", "marca", "categoria", "presentacion", "cantidad", "unidad", "proveedor", "costo", "precio_sin_iva", "precio_con_iva"];
  const HEADERS = ["Código", "Producto", "Marca", "Categoría", "Presentación", "Cantidad", "Unidad", "Proveedor", "Costo", "Precio sin IVA", "Precio con IVA"];

  const round = (n, d = 2) => Math.round((Number(n) + Number.EPSILON) * 10 ** d) / 10 ** d;
  const factor = (rate) => 1 + (Number.isFinite(Number(rate)) ? Number(rate) : DEFAULT_IVA) / 100;
  const withIva = (net, rate) => net === null || net === undefined || net === "" ? null : round(Number(net) * factor(rate), 2);
  const withoutIva = (gross, rate) => gross === null || gross === undefined || gross === "" ? null : round(Number(gross) / factor(rate), 4);
  function margin(net, cost) {
    if (net === null || net === undefined || cost === null || cost === undefined || Number(net) <= 0) return null;
    return round((Number(net) - Number(cost)) / Number(net) * 100, 1);
  }
  function norm(value) {
    return String(value ?? "").trim().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ");
  }
  function num(value) {
    if (value === null || value === undefined || String(value).trim() === "") return null;
    const n = Number(String(value).trim().replace(",", "."));
    return Number.isFinite(n) ? n : NaN;
  }

  // Valida filas (de la plantilla o del formulario) y las clasifica contra el catálogo actual.
  // Devuelve { rows: [{...valores, _fila, status: "nuevo"|"actualiza"|"error", errors: [], payload}], counts }.
  function validateRows(rawRows, data, ivaRate = DEFAULT_IVA) {
    const presentations = data?.presentations || [];
    const products = data?.products || [];
    const bySku = new Map(presentations.filter((p) => p.sku).map((p) => [norm(p.sku), p]));
    const productKey = new Map(products.map((p) => [norm(p.name) + "|" + norm(p.brand), p]));
    const seenSku = new Map(), seenKey = new Map();
    const rows = rawRows.map((raw, index) => {
      const row = { _fila: raw._fila ?? index + 2 };
      for (const f of FIELDS) row[f] = raw[f] === undefined || raw[f] === null ? "" : String(raw[f]).trim();
      const errors = [];
      if (!row.producto) errors.push("Falta el producto");
      if (!row.presentacion) errors.push("Falta la presentación");
      if (row.producto.length > 180) errors.push("Nombre de producto muy largo");
      if (row.codigo.length > 40) errors.push("Código muy largo (máx. 40)");
      const qty = num(row.cantidad === "" ? "1" : row.cantidad);
      if (!Number.isFinite(qty) || qty <= 0) errors.push("Cantidad inválida");
      const cost = num(row.costo), net = num(row.precio_sin_iva), gross = num(row.precio_con_iva);
      if (Number.isNaN(cost) || (cost !== null && cost < 0)) errors.push("Costo inválido");
      if (Number.isNaN(net) || (net !== null && net < 0)) errors.push("Precio sin IVA inválido");
      if (Number.isNaN(gross) || (gross !== null && gross < 0)) errors.push("Precio con IVA inválido");
      let price = null;
      if (Number.isFinite(net) && net !== null) {
        price = round(net, 4);
        if (Number.isFinite(gross) && gross !== null && Math.abs(withIva(net, ivaRate) - gross) > 0.011)
          errors.push("Los precios sin y con IVA no coinciden (con IVA debería ser " + withIva(net, ivaRate).toFixed(2) + ")");
      } else if (Number.isFinite(gross) && gross !== null) price = withoutIva(gross, ivaRate);

      const key = norm(row.producto) + "|" + norm(row.marca) + "|" + norm(row.presentacion);
      if (row.codigo) {
        const k = norm(row.codigo);
        if (seenSku.has(k)) errors.push("Código repetido (también en la fila " + seenSku.get(k) + ")");
        else seenSku.set(k, row._fila);
      }
      if (seenKey.has(key)) errors.push("Producto y presentación repetidos (también en la fila " + seenKey.get(key) + ")");
      else seenKey.set(key, row._fila);

      let status = "nuevo", match = null;
      if (row.codigo && bySku.has(norm(row.codigo))) { status = "actualiza"; match = bySku.get(norm(row.codigo)); }
      else {
        const prod = productKey.get(norm(row.producto) + "|" + norm(row.marca));
        const pres = prod && presentations.find((p) => p.product_id === prod.id && norm(p.label) === norm(row.presentacion) && (!row.codigo || !p.sku));
        if (pres) { status = "actualiza"; match = pres; }
      }
      if (errors.length) status = "error";
      row.status = status;
      row.errors = errors;
      row.match = match ? match.id : null;
      row.payload = errors.length ? null : {
        codigo: row.codigo, producto: row.producto, marca: row.marca, categoria: row.categoria,
        presentacion: row.presentacion, cantidad: qty, unidad: row.unidad || "unidad", proveedor: row.proveedor,
        costo: cost === null ? "" : cost, precio: price === null ? "" : price
      };
      return row;
    });
    const counts = { total: rows.length, nuevo: 0, actualiza: 0, error: 0 };
    for (const r of rows) counts[r.status]++;
    return { rows, counts };
  }

  // Filas de la tabla de precios globales.
  function priceRows(data, ivaRate = DEFAULT_IVA) {
    const prices = data?.prices || [];
    const priceOf = (id) => {
      const own = prices.find((p) => p.presentation_id === id && p.shop === "jefferson");
      return own ? Number(own.price) : null;
    };
    const productById = new Map((data?.products || []).map((p) => [p.id, p]));
    const supplierById = new Map((data?.suppliers || []).map((s) => [s.id, s]));
    return (data?.presentations || []).filter((v) => productById.get(v.product_id)?.active !== false).map((v) => {
      const p = productById.get(v.product_id) || {};
      const net = priceOf(v.id);
      const cost = v.current_cost === null || v.current_cost === undefined ? null : Number(v.current_cost);
      return { id: v.id, product_id: v.product_id, sku: v.sku || "", product: p.name || "", brand: p.brand || "", category: p.category || "",
        presentation: v.label, quantity: v.quantity, unit: v.unit, supplier: supplierById.get(v.supplier_id)?.name || "",
        cost, net, gross: withIva(net, ivaRate), margin: margin(net, cost) };
    }).sort((a, b) => a.product.localeCompare(b.product, "es") || String(a.presentation).localeCompare(String(b.presentation), "es"));
  }

  const api = Object.freeze({ DEFAULT_IVA, FIELDS, HEADERS, round, withIva, withoutIva, margin, norm, validateRows, priceRows });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (scope) scope.NICOLE_ADMIN = api;
})(typeof window !== "undefined" ? window : null);
