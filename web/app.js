/* Nicole Encajes — app de administración (Electron). Entra con PIN; pestañas de catálogo, carga, precios, fotos y tienda. */
"use strict";
(() => {
  const role = "jefferson";
  const people = { edgar: "Edgar", gloria: "Gloria", jefferson: "Jefferson" };
  const A = window.NICOLE_ADMIN;
  let apiUrl = String(window.ALMACEN_API_URL || "").trim().replace(/\/$/, "");
  const root = document.getElementById("app");
  const snapshotKey = "almacen-v2-cache-jefferson";
  const SESSION = "nicole-admin-session";
  const empty = { products: [], presentations: [], prices: [], costs: [], suppliers: [], photos: [], settings: {} };
  const TABS = [
    ["catalogo", "Catálogo"], ["cargar", "Cargar productos"], ["precios", "Precios"], ["fotos", "Fotos"],
    ["clientes", "Clientes", true], ["ventas", "Ventas", true], ["tienda", "Tienda"]
  ];
  const state = {
    data: empty, ready: false, online: false, busy: false, error: "", message: "",
    locked: false, pinError: "", tab: "catalogo",
    search: "", product: "", presentation: "", gallery: "", showHistory: false, showForm: "",
    filterCategory: "", filterPresentation: "", filterPrice: "todos", order: "nombre", page: 0,
    batch: null, batchError: "", batchOnlyErrors: false,
    priceSearch: "", priceCategory: ""
  };
  let token = "";
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const money = (value, digits = 2) => value === null || value === undefined || value === "" || !Number.isFinite(Number(value))
    ? "Pendiente" : "$" + Number(value).toLocaleString("es-EC", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  const pct = (v) => v === null || v === undefined ? "—" : v.toLocaleString("es-EC", { maximumFractionDigits: 1 }) + " %";
  const date = (value) => value ? new Date(value).toLocaleDateString("es-EC") : "—";
  const prop = (p, k) => esc(p?.[k] ?? "");
  const iva = () => Number(state.data.settings?.iva_rate ?? A.DEFAULT_IVA);
  const pById = (id) => state.data.products.find((p) => p.id === id);
  const presentations = (id) => state.data.presentations.filter((p) => p.product_id === id);
  const photos = (id) => state.data.photos.filter((p) => p.product_id === id);
  const supplier = (id) => state.data.suppliers.find((s) => s.id === id);
  const netPrice = (presentationId) => {
    const own = state.data.prices.find((p) => p.presentation_id === presentationId && p.shop === "jefferson");
    return own ? Number(own.price) : null;
  };
  const photoMain = (id) => photos(id).find((p) => p.is_primary) || photos(id)[0];
  const inputMoney = (v, d = 2) => v === null || v === undefined || v === "" ? "" : String(A.round(v, d));
  function photoEl(photo, className = "photo") {
    return photo?.signed_url
      ? `<img class="${className}" src="${esc(photo.signed_url)}" alt="${esc(photo.color_label || "Fotografía del producto")}" loading="lazy">`
      : `<div class="${className} no-photo" aria-label="Sin fotografía"><span>▧</span><small>Sin foto</small></div>`;
  }

  // ---------- Sesión con PIN ----------
  async function readToken() {
    try { const t = await window.almacenDesktop?.getAccessKey?.(); if (t) return t; } catch { /* sin Electron */ }
    try { return localStorage.getItem(SESSION) || ""; } catch { return ""; }
  }
  async function saveToken(value) {
    token = value;
    try { localStorage.setItem(SESSION, value); } catch { /* file:// */ }
    try { await window.almacenDesktop?.saveAccessKey?.(value); } catch { /* opcional */ }
  }
  async function clearToken() {
    token = "";
    try { localStorage.removeItem(SESSION); localStorage.removeItem(snapshotKey); } catch { /* file:// */ }
    try { await window.almacenDesktop?.clearAccessKey?.(); } catch { /* opcional */ }
  }
  async function request(action, fields = {}) {
    if (!apiUrl && window.almacenDesktop?.getApiUrl) {
      apiUrl = String(await window.almacenDesktop.getApiUrl() || "").trim().replace(/\/$/, "");
    }
    if (!apiUrl) throw new Error("Supabase aún no está configurado");
    const headers = { "content-type": "application/json" };
    if (token) headers["x-almacen-key"] = token;
    const res = await fetch(apiUrl, { method: "POST", headers, body: JSON.stringify({ action, ...fields }), cache: "no-store" });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && action !== "login") {
      await clearToken(); state.locked = true; state.ready = false; state.data = empty;
      throw new Error("Tu sesión terminó. Ingresa tu PIN.");
    }
    if (!res.ok || !data.ok) throw new Error(data.error || "No fue posible conectar");
    return data;
  }
  async function cacheRead() {
    try {
      if (window.almacenDesktop?.getCachedSnapshot) {
        const d = await window.almacenDesktop.getCachedSnapshot();
        if (d?.products) return d;
      }
      const d = JSON.parse(localStorage.getItem(snapshotKey) || "null");
      return d?.products ? d : null;
    } catch { return null; }
  }
  async function cacheSave(data) {
    try { localStorage.setItem(snapshotKey, JSON.stringify(data)); } catch { /* límite */ }
    try { await window.almacenDesktop?.saveCachedSnapshot?.(data); } catch { /* opcional */ }
  }
  async function load(silent = false) {
    if (!token) { state.locked = true; state.busy = false; return render(); }
    if (!silent) state.busy = true;
    try {
      const result = await request("bootstrap");
      state.data = { ...empty, ...result };
      state.online = true; state.ready = true; state.error = ""; state.locked = false;
      await cacheSave(result);
    } catch (error) {
      state.online = false;
      if (!state.locked) {
        const cache = await cacheRead();
        if (cache) { state.data = { ...empty, ...cache }; state.ready = true; }
      }
      state.error = String(error.message || error);
    } finally { state.busy = false; render(); }
  }

  // ---------- Encabezado y pestañas ----------
  function head() {
    return `<header class="topbar">
      <div class="brand"><div class="brandmark"><img src="../assets/nicole-icon.svg" alt="" width="45" height="45"></div>
        <div><strong>Nicole Encajes</strong><span>Administración</span></div></div>
      <div class="top-actions">
        ${state.locked ? "" : `<span class="status ${state.online ? "connected" : "disconnected"}">${state.online ? "● Conectado" : "○ Sin conexión"}</span>
        <button class="btn btn-quiet" data-act="refresh" title="Actualizar">↻ <span>Actualizar</span></button>`}
      </div></header>
      ${state.locked || !state.ready ? "" : `<nav class="tabs" aria-label="Secciones">${TABS.map(([id, label, soon]) =>
        `<button class="tab ${state.tab === id && !state.product ? "active" : ""}" data-act="tab" data-tab="${id}" ${soon ? 'disabled title="Próximamente"' : ""}>${label}${soon ? " <small>pronto</small>" : ""}</button>`).join("")}</nav>`}`;
  }
  function pinScreen() {
    return `<section class="empty-state pin-card"><span class="empty-icon">🔒</span><h2>Ingresa tu PIN</h2>
      <p class="muted">Solo se pide una vez en esta computadora.</p>
      <form id="pin-form" class="pin-form" autocomplete="off">
        <input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="off" aria-label="PIN" required autofocus>
        <button class="btn btn-primary" type="submit" ${state.busy ? "disabled" : ""}>${state.busy ? "Verificando…" : "Entrar"}</button>
      </form>${state.pinError ? `<p class="pin-error" role="alert">${esc(state.pinError)}</p>` : ""}</section>`;
  }
  function blank() {
    const body = !apiUrl ? `<h2>Falta conectar Supabase</h2><p>Configura la URL de la función en <code>web/config.js</code>.</p>` :
      `<h2>No se pudo conectar</h2><p>${esc(state.error)}</p><p>Comprueba internet y que el proyecto de Supabase esté activo.</p>`;
    return `<section class="empty-state"><span class="empty-icon">◈</span>${body}
      <button class="btn btn-primary" data-act="refresh">Reintentar</button></section>`;
  }
  const normalize = (v) => A.norm(v);

  // ---------- Catálogo ----------
  function tableRows() {
    return state.data.products.filter((p) => p.active !== false).flatMap((p) => {
      const opts = presentations(p.id);
      return (opts.length ? opts : [null]).map((v) => {
        const net = v ? netPrice(v.id) : null;
        const cost = v?.current_cost ?? null;
        return { product: p, variant: v, net, gross: A.withIva(net, iva()), margin: A.margin(net, cost), cost,
          supplierName: v ? supplier(v.supplier_id)?.name || "" : "" };
      });
    });
  }
  function catalog() {
    const all = tableRows();
    const categories = [...new Set(state.data.products.map((x) => x.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    const kinds = [...new Set(state.data.presentations.map((x) => x.label).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    const opt = (values, selected) => values.map((v) => `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(v)}</option>`).join("");
    const terms = normalize(state.search).split(/\s+/).filter(Boolean);
    const list = all.filter(({ product: p, variant: v, net, supplierName }) => {
      const text = normalize([p.name, p.brand, p.category, v?.label, v?.unit, v?.sku, supplierName, ...photos(p.id).map((x) => x.color_label)].join(" "));
      return terms.every((t) => text.includes(t)) &&
        (!state.filterCategory || p.category === state.filterCategory) &&
        (!state.filterPresentation || v?.label === state.filterPresentation) &&
        (state.filterPrice === "todos" || (state.filterPrice === "pendiente" && net === null) || (state.filterPrice === "conprecio" && net !== null));
    }).sort((a, b) => {
      if (state.order === "precio") return (Number(a.net ?? -1) - Number(b.net ?? -1)) || a.product.name.localeCompare(b.product.name, "es");
      if (state.order === "costo") return (Number(a.cost ?? -1) - Number(b.cost ?? -1)) || a.product.name.localeCompare(b.product.name, "es");
      if (state.order === "margen") return (Number(a.margin ?? 999) - Number(b.margin ?? 999)) || a.product.name.localeCompare(b.product.name, "es");
      if (state.order === "reciente") return String(b.product.created_at).localeCompare(String(a.product.created_at));
      return a.product.name.localeCompare(b.product.name, "es") || String(a.variant?.label || "").localeCompare(String(b.variant?.label || ""), "es");
    });
    const total = list.length, perPage = 60, pages = Math.max(1, Math.ceil(total / perPage));
    state.page = Math.min(state.page, pages - 1);
    const rows = list.slice(state.page * perPage, (state.page + 1) * perPage).map(({ product: p, variant: v, net, gross, margin, cost, supplierName }) =>
      `<tr><td class="sku-cell">${esc(v?.sku || "—")}</td>
      <td class="product-name-cell"><button class="table-open" data-act="open" data-id="${p.id}" data-presentation="${v?.id || ""}">
        <span class="name-with-img">${photoEl(photoMain(p.id), "mini-photo")}<strong>${prop(p, "name")}</strong></span></button></td>
      <td>${esc(v?.label || "Pendiente")}</td><td class="quantity-cell">${v ? esc(v.quantity) + " " + esc(v.unit) : "—"}</td>
      <td>${esc(supplierName || "—")}</td><td class="money">${money(cost)}</td>
      <td class="${net === null ? "pending" : "money"}">${money(net)}</td><td class="${gross === null ? "pending" : "money strong"}">${money(gross)}</td>
      <td class="${margin !== null && margin < 0 ? "danger-text" : ""}">${pct(margin)}</td>
      <td><button class="btn btn-secondary view-row" data-act="open" data-id="${p.id}" data-presentation="${v?.id || ""}">Ver</button></td></tr>`).join("");
    return `<div class="page-head"><div><p class="eyebrow">Catálogo</p><h1>Productos, costos y precios</h1>
      <p class="muted">Busca por nombre, código, presentación, marca, proveedor o color.</p></div>
      <div class="toolbar-actions"><button class="btn btn-primary" data-act="tab" data-tab="cargar">＋ Cargar productos</button></div></div>
      <div class="search-wrap"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Nombre, código, color, presentación…" value="${esc(state.search)}" autocomplete="off" aria-label="Buscar producto"></div>
      <div class="filter-bar"><label>Categoría<select data-filter="filterCategory"><option value="">Todas</option>${opt(categories, state.filterCategory)}</select></label>
      <label>Presentación<select data-filter="filterPresentation"><option value="">Todas</option>${opt(kinds, state.filterPresentation)}</select></label>
      <label>Precio<select data-filter="filterPrice">${[["todos", "Todos"], ["conprecio", "Con precio"], ["pendiente", "Sin precio"]].map(([v, l]) => `<option value="${v}" ${state.filterPrice === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <label>Ordenar<select data-filter="order">${[["nombre", "Nombre A-Z"], ["reciente", "Más recientes"], ["precio", "Precio menor"], ["costo", "Costo menor"], ["margen", "Margen menor"]].map(([v, l]) => `<option value="${v}" ${state.order === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      <button class="btn btn-quiet clear-filters" data-act="clear-filters">Limpiar</button></div>
      <div class="table-heading"><strong>${total} ${total === 1 ? "presentación" : "presentaciones"}</strong><span class="muted">IVA ${iva()} % · Margen sobre precio sin IVA</span></div>
      <div class="table-scroll" role="region" aria-label="Catálogo" tabindex="0"><table class="catalog-table">
      <thead><tr><th>Código</th><th>Producto</th><th>Presentación</th><th>Cantidad</th><th>Proveedor</th><th>Costo</th><th>Sin IVA</th><th>Con IVA</th><th>Margen</th><th>Ficha</th></tr></thead>
      <tbody>${rows || '<tr><td class="empty-table" colspan="10">No hay resultados. Prueba otra búsqueda o carga productos.</td></tr>'}</tbody></table></div>
      ${pages > 1 ? `<div class="pagination"><button class="btn btn-quiet" data-act="prev" ${state.page === 0 ? "disabled" : ""}>← Anterior</button>
        <span>Página ${state.page + 1} de ${pages}</span><button class="btn btn-quiet" data-act="next" ${state.page + 1 >= pages ? "disabled" : ""}>Siguiente →</button></div>` : ""}`;
  }

  // ---------- Ficha de producto ----------
  function history(v) {
    const { entries, lowest: low, highest: high } = window.ALMACEN_RULES.summarizeCosts(state.data.costs, v.id);
    if (!entries.length) return '<p class="muted">Todavía no hay costos registrados.</p>';
    const row = (title, entry) => `<div class="history-stat"><span>${title}</span><strong>${money(entry.cost)}</strong><small>${date(entry.recorded_at)}</small></div>`;
    return `<div class="history-highlights">${row("Último", entries[0])}${row("Más bajo", low)}${row("Más alto", high)}</div>
      <div class="history-table">${entries.map((c) => `<div><span>${date(c.recorded_at)}</span><strong>${money(c.cost)}</strong><span>${esc(supplier(c.supplier_id)?.name || "Sin proveedor")}</span></div>`).join("")}</div>`;
  }
  function product() {
    const p = pById(state.product);
    if (!p) { state.product = ""; return tabView(); }
    const variants = presentations(p.id);
    const v = variants.find((x) => x.id === state.presentation) || variants[0];
    if (v) state.presentation = v.id;
    const net = v ? netPrice(v.id) : null;
    const images = photos(p.id);
    const selectedPhoto = images.find((x) => x.id === state.gallery) || photoMain(p.id);
    return `<button class="back-link" data-act="back">← Volver</button>
      <div class="product-layout"><section class="detail-card">
        <div class="gallery-main">${photoEl(selectedPhoto, "detail-image")}</div>
        <div class="thumbnails">${images.map((im) =>
          `<button class="thumb ${selectedPhoto?.id === im.id ? "active" : ""}" data-act="gallery" data-id="${im.id}" title="${esc(im.color_label || "Fotografía")}">${photoEl(im, "thumb-photo")}<span>${im.is_primary ? "★ " : ""}${esc(im.color_label || "Foto")}</span></button>`).join("")}</div>
        ${selectedPhoto ? `<div class="photo-meta"><p class="muted">${selectedPhoto.is_primary ? "★ Foto principal · " : ""}${selectedPhoto.color_label ? "Color: <strong>" + esc(selectedPhoto.color_label) + "</strong> · " : ""}Tomada por ${esc(people[selectedPhoto.created_by] || selectedPhoto.created_by || "—")} · ${date(selectedPhoto.created_at)}</p>
          ${state.online ? `<div class="button-row">${selectedPhoto.is_primary ? "" : `<button class="btn btn-quiet" data-act="photo-primary" data-id="${selectedPhoto.id}">★ Hacer principal</button>`}
          <button class="btn btn-quiet danger-text" data-act="photo-delete" data-id="${selectedPhoto.id}">Eliminar foto</button></div>` : ""}</div>` : ""}
        ${state.online ? `<form id="photo-form" class="mini-form">
          <label>Agregar fotografías</label>
          <input name="color" maxlength="80" placeholder="Color o referencia (opcional)">
          <input name="images" type="file" accept="image/*" multiple required>
          <button class="btn btn-secondary" type="submit">Subir fotografías</button></form>` : ""}
      </section>
      <section class="detail-body"><div class="detail-heading"><p class="eyebrow">Ficha del producto</p><h1>${prop(p, "name")}</h1>
        <p class="muted">${[p.brand, p.category].filter(Boolean).map(esc).join(" · ") || "Sin marca ni categoría"}</p></div>
        <div class="info-panel"><div class="section-title"><h2>Presentación</h2></div>
          ${variants.length ? `<select id="presentation-select" aria-label="Seleccionar presentación">
            ${variants.map((x) => `<option value="${x.id}" ${x.id === v?.id ? "selected" : ""}>${prop(x, "label")}${x.sku ? " · " + esc(x.sku) : ""}</option>`).join("")}</select>
            <p class="muted">Contenido: <strong>${esc(v.quantity)} ${esc(v.unit)}</strong> · Código: <strong>${esc(v.sku || "sin código")}</strong></p>` : `<p class="muted">Añade una presentación para definir cantidades y precios.</p>`}
          ${state.online ? `<div class="button-row"><button class="btn btn-quiet" data-act="add-presentation">＋ Presentación</button>
          <button class="btn btn-quiet" data-act="edit-product">Editar producto</button>
          ${v ? `<button class="btn btn-quiet" data-act="edit-presentation">Editar presentación</button>` : ""}
          <button class="btn btn-quiet danger-text" data-act="archive-product">Retirar producto</button></div>` : ""}
        </div>
        ${v ? `<div class="price-panel"><span class="eyebrow">Precio de venta</span>
          <div class="price-pair"><div><small>Sin IVA</small><div class="sale-price">${money(net)}</div></div>
          <div><small>Con IVA (${iva()} %)</small><div class="sale-price">${money(A.withIva(net, iva()))}</div></div></div>
          <p class="muted">${net === null ? "Todavía no hay precio." : "Margen: <strong>" + pct(A.margin(net, v.current_cost)) + "</strong> · Así lo ven Edgar y Gloria."}</p>
          ${state.online ? '<div class="button-row"><button class="btn btn-primary" data-act="price">Cambiar precio</button></div>' : ""}
        </div>
        <div class="info-panel"><div class="section-title"><h2>Costo de compra</h2></div>
          <div class="cost-value">${money(v.current_cost)}</div>
          <p class="muted">Última actualización: ${date(v.cost_recorded_at)}</p>
          ${v.supplier_id ? `<p>Proveedor: <strong>${esc(supplier(v.supplier_id)?.name || "No encontrado")}</strong></p>` : ""}
          ${state.online ? '<button class="btn btn-secondary" data-act="cost">Registrar nuevo costo</button>' : ""}
          <button class="disclosure" data-act="history">${state.showHistory ? "▾ Ocultar" : "▸ Ver"} historial de costos</button>
          ${state.showHistory ? history(v) : ""}
        </div>` : ""}
        ${state.online ? '<button class="btn btn-quiet" data-act="suppliers">＋ Nuevo proveedor</button>' : ""}
      </section></div>`;
  }
  function modal() {
    const type = state.showForm;
    if (!type) return "";
    const p = pById(state.product);
    const v = state.data.presentations.find((x) => x.id === state.presentation);
    const kinds = ["Pieza", "Rollo", "Gruesa", "Caja", "Kilo", "Metro", "Yarda", "Docena", "Paquete", "Otro"];
    const units = ["unidad", "piezas", "rollos", "metros", "yardas", "kilos", "gramos", "docenas", "cajas"];
    let title = "", body = "";
    if (type === "edit-product") {
      title = "Editar producto";
      body = `<label>Nombre del producto <input name="name" maxlength="180" required value="${prop(p, "name")}"></label>
        <label>Marca (opcional)<input name="brand" maxlength="100" value="${prop(p, "brand")}"></label>
        <label>Categoría (opcional)<input name="category" maxlength="100" value="${prop(p, "category")}"></label>`;
    } else if (type === "add-presentation" || type === "edit-presentation") {
      const edit = type === "edit-presentation";
      title = edit ? "Editar presentación" : "Agregar presentación";
      body = `<label>Tipo de presentación <input list="types" name="label" maxlength="80" value="${edit ? prop(v, "label") : "Pieza"}" required></label>
        <datalist id="types">${kinds.map((x) => `<option value="${x}"></option>`).join("")}</datalist>
        <div class="form-columns"><label>Cantidad contenida <input type="number" name="quantity" min="0.001" step="any" value="${edit ? esc(v?.quantity) : 1}" required></label>
        <label>Unidad <input list="units" name="unit" maxlength="40" value="${edit ? prop(v, "unit") : "unidad"}" required></label></div>
        <datalist id="units">${units.map((x) => `<option value="${x}"></option>`).join("")}</datalist>
        <label>Código / SKU (opcional) <input name="sku" maxlength="40" value="${edit ? prop(v, "sku") : ""}"></label>`;
    } else if (type === "price") {
      const net = netPrice(v?.id);
      title = "Cambiar precio";
      body = `<div class="form-columns" data-iva-pair><label>Precio sin IVA (USD) <input name="net" type="number" min="0" step="0.0001" value="${inputMoney(net, 4)}" data-iva="net"></label>
        <label>Precio con IVA (USD) <input name="gross" type="number" min="0" step="0.01" value="${inputMoney(A.withIva(net, iva()))}" data-iva="gross"></label></div>
        <p class="hint">Llena uno y el otro se calcula con IVA ${iva()} %. Costo actual: ${money(v?.current_cost)}.</p>`;
    } else if (type === "cost") {
      title = "Registrar costo";
      body = `<label>Proveedor <select name="supplier_id"><option value="">Sin proveedor</option>${state.data.suppliers.filter((s) => s.active !== false).map((s) =>
        `<option value="${s.id}" ${s.id === v?.supplier_id ? "selected" : ""}>${prop(s, "name")}</option>`).join("")}</select></label>
        <label>Costo de compra (USD) <input name="cost" type="number" min="0" step="0.0001" required value="${v?.current_cost ?? ""}"></label>
        <p class="hint">El costo anterior queda en el historial con su fecha.</p>`;
    } else if (type === "suppliers") {
      title = "Nuevo proveedor";
      body = `<label>Nombre <input name="name" maxlength="160" required></label><label>Teléfono (opcional) <input name="phone" maxlength="60"></label>`;
    }
    return `<div class="modal-shade" data-act="close"><div class="modal-card" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal-heading"><h2>${title}</h2><button class="icon-button" data-act="close" aria-label="Cerrar">×</button></div>
      <form id="edit-form">${body}<div class="modal-actions"><button class="btn btn-quiet" type="button" data-act="close">Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button></div></form></div></div>`;
  }

  // ---------- Cargar productos ----------
  function datalists() {
    const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    const dl = (id, xs) => `<datalist id="${id}">${uniq(xs).map((x) => `<option value="${esc(x)}"></option>`).join("")}</datalist>`;
    return dl("dl-products", state.data.products.map((p) => p.name)) + dl("dl-brands", state.data.products.map((p) => p.brand)) +
      dl("dl-categories", state.data.products.map((p) => p.category)) + dl("dl-suppliers", state.data.suppliers.map((s) => s.name)) +
      dl("dl-kinds", ["Pieza", "Rollo", "Gruesa", "Caja", "Kilo", "Metro", "Yarda", "Docena", "Paquete", ...state.data.presentations.map((v) => v.label)]) +
      dl("dl-units", ["unidad", "piezas", "rollos", "metros", "yardas", "kilos", "gramos", "docenas", "cajas"]);
  }
  function loadView() {
    return `<div class="page-head"><div><p class="eyebrow">Cargar productos</p><h1>Agregar o actualizar productos</h1>
      <p class="muted">Uno por uno con el formulario, o muchos a la vez con la plantilla de Excel.</p></div></div>
      ${datalists()}
      <section class="info-panel"><div class="section-title"><h2>Uno por uno</h2></div>
      <form id="single-form" class="load-form" autocomplete="off">
        <label>Código / SKU <input name="codigo" maxlength="40" placeholder="Opcional"></label>
        <label class="wide">Producto * <input name="producto" list="dl-products" maxlength="180" required placeholder="Ej.: Encaje Chantilly"></label>
        <label>Marca <input name="marca" list="dl-brands" maxlength="100"></label>
        <label>Categoría <input name="categoria" list="dl-categories" maxlength="100"></label>
        <label>Presentación * <input name="presentacion" list="dl-kinds" maxlength="80" required value="Pieza"></label>
        <label>Cantidad <input name="cantidad" type="number" min="0.001" step="any" value="1"></label>
        <label>Unidad <input name="unidad" list="dl-units" maxlength="40" value="unidad"></label>
        <label>Proveedor <input name="proveedor" list="dl-suppliers" maxlength="160"></label>
        <label>Costo <input name="costo" type="number" min="0" step="0.0001" placeholder="0.00"></label>
        <div class="iva-pair" data-iva-pair>
          <label>Precio sin IVA <input name="precio_sin_iva" type="number" min="0" step="0.0001" data-iva="net" placeholder="0.00"></label>
          <label>Precio con IVA <input name="precio_con_iva" type="number" min="0" step="0.01" data-iva="gross" placeholder="0.00"></label>
        </div>
        <label class="wide">Fotos (opcional) <input name="images" type="file" accept="image/*" multiple></label>
        <label class="wide">Color de las fotos (opcional) <input name="color" maxlength="80"></label>
        <p id="single-status" class="single-status muted wide">Escribe el producto para ver si es nuevo o si actualiza uno existente.</p>
        <div class="button-row wide"><button class="btn btn-primary" type="submit" ${state.online ? "" : "disabled"}>Guardar producto</button>
        <button class="btn btn-quiet" type="reset">Limpiar</button></div>
      </form></section>
      <section class="info-panel"><div class="section-title"><h2>Por lote (Excel)</h2></div>
        <ol class="steps"><li>Descarga la plantilla vacía.</li><li>Llénala: una fila por presentación.</li><li>Súbela, revisa la vista previa y confirma.</li></ol>
        <div class="button-row"><button class="btn btn-secondary" data-act="excel-template">↓ Descargar plantilla</button>
        <button class="btn btn-primary" data-act="excel-upload" ${state.online ? "" : "disabled"}>↑ Subir plantilla</button>
        <input class="sr-only" id="excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></div>
        ${state.batchError ? `<div class="alert warning">${esc(state.batchError)}</div>` : ""}
        ${state.batch ? batchView() : ""}
      </section>`;
  }
  function singleStatus(form) {
    const raw = Object.fromEntries(new FormData(form).entries());
    if (!String(raw.producto || "").trim()) return { text: "Escribe el producto para ver si es nuevo o si actualiza uno existente.", cls: "muted" };
    const r = A.validateRows([raw], state.data, iva()).rows[0];
    if (r.status === "error") return { text: "⚠️ " + r.errors.join(" · "), cls: "danger-text" };
    const price = r.payload.precio === "" ? "" : ` · Precio sin IVA ${money(r.payload.precio, 4)} → con IVA ${money(A.withIva(r.payload.precio, iva()))}`;
    return r.status === "actualiza"
      ? { text: "🔄 Ya existe: se actualizará esa presentación" + price, cls: "status-update" }
      : { text: "✅ Producto o presentación nueva: se creará" + price, cls: "status-new" };
  }
  const FIELD_LABELS = { codigo: "Código", producto: "Producto", marca: "Marca", categoria: "Categoría", presentacion: "Presentación", cantidad: "Cant.", unidad: "Unidad", proveedor: "Proveedor", costo: "Costo", precio_sin_iva: "Sin IVA", precio_con_iva: "Con IVA" };
  function batchView() {
    const { rows, counts } = state.batch;
    const shown = rows.map((r, i) => ({ r, i })).filter(({ r }) => !state.batchOnlyErrors || r.status === "error");
    const badge = (r) => r.status === "error" ? "⚠️ Error" : r.status === "actualiza" ? "🔄 Actualiza" : "✅ Nuevo";
    return `<div class="batch">
      <div class="batch-summary"><strong id="batch-total">${counts.total} filas</strong>
        <span class="chip status-new" id="batch-new">✅ ${counts.nuevo} nuevas</span>
        <span class="chip status-update" id="batch-update">🔄 ${counts.actualiza} actualizan</span>
        <span class="chip ${counts.error ? "danger-chip" : ""}" id="batch-error">⚠️ ${counts.error} con error</span>
        <label class="inline-check"><input type="checkbox" data-act="batch-only-errors" ${state.batchOnlyErrors ? "checked" : ""}> Ver solo errores</label></div>
      <p class="muted">Puedes corregir cualquier celda aquí mismo; el estado se recalcula al salir de la celda.</p>
      <div class="table-scroll batch-scroll"><table class="catalog-table batch-table"><thead><tr><th>Fila</th><th>Estado</th>
        ${A.FIELDS.map((f) => `<th>${FIELD_LABELS[f]}</th>`).join("")}<th></th></tr></thead><tbody>
        ${shown.map(({ r, i }) => `<tr class="batch-row ${r.status}" data-row="${i}"><td>${r._fila}</td>
          <td class="batch-status" id="bs-${i}"><span>${badge(r)}</span>${r.errors.length ? `<small>${esc(r.errors.join(" · "))}</small>` : ""}</td>
          ${A.FIELDS.map((f) => `<td><input class="cell-input ${["producto", "proveedor"].includes(f) ? "w-wide" : ["cantidad", "costo", "precio_sin_iva", "precio_con_iva"].includes(f) ? "w-num" : ""}" data-row="${i}" data-field="${f}" value="${esc(r[f])}" aria-label="${FIELD_LABELS[f]} fila ${r._fila}"></td>`).join("")}
          <td><button class="icon-button" data-act="batch-remove" data-row="${i}" title="Quitar fila" aria-label="Quitar fila ${r._fila}">×</button></td></tr>`).join("")}
      </tbody></table></div>
      <div class="button-row"><button class="btn btn-quiet" data-act="batch-cancel">Cancelar</button>
        <button class="btn btn-primary" id="batch-confirm" data-act="batch-confirm" ${counts.total - counts.error ? "" : "disabled"}>${batchButtonText(counts)}</button></div>
      <p class="muted">Las celdas de costo o precio vacías no borran valores existentes. Las fotos de productos existentes se conservan.</p></div>`;
  }
  function batchButtonText(c) {
    const ok = c.total - c.error;
    return c.error ? `Importar solo las ${ok} filas válidas` : `Confirmar carga de ${ok} filas`;
  }
  function revalidateBatch() {
    const raw = state.batch.rows.map((r) => { const o = { _fila: r._fila }; for (const f of A.FIELDS) o[f] = r[f]; return o; });
    state.batch = A.validateRows(raw, state.data, iva());
  }
  function refreshBatchDom() {
    const { rows, counts } = state.batch;
    rows.forEach((r, i) => {
      const cell = $("bs-" + i);
      if (!cell) return;
      cell.innerHTML = `<span>${r.status === "error" ? "⚠️ Error" : r.status === "actualiza" ? "🔄 Actualiza" : "✅ Nuevo"}</span>${r.errors.length ? `<small>${esc(r.errors.join(" · "))}</small>` : ""}`;
      cell.parentElement.className = "batch-row " + r.status;
    });
    $("batch-total").textContent = counts.total + " filas";
    $("batch-new").textContent = "✅ " + counts.nuevo + " nuevas";
    $("batch-update").textContent = "🔄 " + counts.actualiza + " actualizan";
    $("batch-error").textContent = "⚠️ " + counts.error + " con error";
    $("batch-error").classList.toggle("danger-chip", counts.error > 0);
    const btn = $("batch-confirm");
    btn.textContent = batchButtonText(counts);
    btn.disabled = counts.total - counts.error === 0;
  }

  // ---------- Precios globales ----------
  function pricesView() {
    const all = A.priceRows(state.data, iva());
    const cats = [...new Set(all.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
    const terms = normalize(state.priceSearch).split(/\s+/).filter(Boolean);
    const list = all.filter((r) => (!state.priceCategory || r.category === state.priceCategory) &&
      terms.every((t) => normalize([r.sku, r.product, r.brand, r.presentation, r.supplier].join(" ")).includes(t)));
    const withPrice = all.filter((r) => r.net !== null).length;
    return `<div class="page-head"><div><p class="eyebrow">Precios globales</p><h1>Todos los precios</h1>
      <p class="muted">${all.length} presentaciones · ${withPrice} con precio · ${all.length - withPrice} sin precio. Edita costo o precio directo en la tabla.</p></div>
      <div class="toolbar-actions"><button class="btn btn-secondary" data-act="prices-export" ${all.length ? "" : "disabled"}>↓ Excel</button></div></div>
      <div class="filter-bar"><label class="grow">Buscar<input id="price-search" type="search" value="${esc(state.priceSearch)}" placeholder="Código, producto, marca…" autocomplete="off"></label>
      <label>Categoría<select data-filter="priceCategory"><option value="">Todas</option>${cats.map((c) => `<option ${c === state.priceCategory ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label></div>
      <div class="table-scroll" role="region" aria-label="Precios globales" tabindex="0"><table class="catalog-table price-table">
      <thead><tr><th>Código</th><th>Producto</th><th>Presentación</th><th>Proveedor</th><th>Costo</th><th>Precio sin IVA</th><th>Precio con IVA</th><th>Margen</th><th></th></tr></thead><tbody>
      ${list.map((r) => `<tr data-pid="${r.id}"><td class="sku-cell">${esc(r.sku || "—")}</td>
        <td><button class="table-open" data-act="open" data-id="${r.product_id}" data-presentation="${r.id}"><strong>${esc(r.product)}</strong></button>${r.brand ? `<small class="muted block">${esc(r.brand)}</small>` : ""}</td>
        <td>${esc(r.presentation)} <small class="muted">${esc(r.quantity)} ${esc(r.unit)}</small></td><td>${esc(r.supplier || "—")}</td>
        <td><input class="cell-input w-num" type="number" min="0" step="0.0001" data-price="cost" data-id="${r.id}" value="${inputMoney(r.cost, 4)}" aria-label="Costo"></td>
        <td><input class="cell-input w-num" type="number" min="0" step="0.0001" data-price="net" data-id="${r.id}" value="${inputMoney(r.net, 4)}" aria-label="Precio sin IVA"></td>
        <td><input class="cell-input w-num strong" type="number" min="0" step="0.01" data-price="gross" data-id="${r.id}" value="${inputMoney(r.gross)}" aria-label="Precio con IVA"></td>
        <td class="margin-cell ${r.margin !== null && r.margin < 0 ? "danger-text" : ""}" id="mg-${r.id}">${pct(r.margin)}</td>
        <td class="save-cell" id="sv-${r.id}"></td></tr>`).join("") || '<tr><td class="empty-table" colspan="9">No hay presentaciones.</td></tr>'}
      </tbody></table></div>`;
  }
  async function savePriceCell(input) {
    const id = input.dataset.id, kind = input.dataset.price, mark = $("sv-" + id);
    const raw = input.value.trim();
    if (raw === "") return;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) { mark.textContent = "⚠️"; return; }
    mark.textContent = "…";
    try {
      const v = state.data.presentations.find((x) => x.id === id);
      if (kind === "cost") {
        if (Number(v.current_cost) === value) { mark.textContent = ""; return; }
        await request("setCost", { presentation_id: id, cost: value, supplier_id: v.supplier_id || null });
        v.current_cost = value; v.cost_recorded_at = new Date().toISOString();
      } else {
        const net = kind === "net" ? A.round(value, 4) : A.withoutIva(value, iva());
        await request("setPrice", { presentation_id: id, shop: "jefferson", price: net });
        const own = state.data.prices.find((x) => x.presentation_id === id && x.shop === "jefferson");
        if (own) own.price = net; else state.data.prices.push({ presentation_id: id, shop: "jefferson", price: net, updated_at: new Date().toISOString() });
        const row = input.closest("tr");
        row.querySelector('[data-price="net"]').value = inputMoney(net, 4);
        row.querySelector('[data-price="gross"]').value = inputMoney(A.withIva(net, iva()));
      }
      const m = A.margin(netPrice(id), v.current_cost);
      const mg = $("mg-" + id); mg.textContent = pct(m); mg.classList.toggle("danger-text", m !== null && m < 0);
      mark.textContent = "✓";
      cacheSave(state.data);
    } catch (error) { mark.textContent = "⚠️"; alert("No se guardó: " + String(error.message || error)); }
  }

  // ---------- Fotos ----------
  function photosView() {
    const all = state.data.photos.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const missing = state.data.products.filter((p) => p.active !== false && !photos(p.id).length).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const fromFamily = all.filter((ph) => ph.created_by !== "jefferson").length;
    return `<div class="page-head"><div><p class="eyebrow">Fotos</p><h1>Fotografías</h1>
      <p class="muted">${all.length} fotos · ${fromFamily} tomadas por la familia · ${missing.length} productos sin foto.</p></div></div>
      <section class="info-panel"><div class="section-title"><h2>Fotos recientes</h2></div>
      ${all.length ? `<div class="photo-grid">${all.slice(0, 60).map((ph) => {
        const prod = pById(ph.product_id);
        return `<button class="photo-tile" data-act="open" data-id="${ph.product_id}" data-photo="${ph.id}">${photoEl(ph, "thumb-photo")}
          <strong>${esc(prod?.name || "Producto")}</strong><small>${esc(people[ph.created_by] || ph.created_by)} · ${date(ph.created_at)}${ph.color_label ? " · " + esc(ph.color_label) : ""}</small></button>`;
      }).join("")}</div>` : '<p class="muted">Todavía no hay fotografías.</p>'}</section>
      <section class="info-panel"><div class="section-title"><h2>Productos sin foto (${missing.length})</h2></div>
      ${missing.length ? `<ul class="missing-list">${missing.map((p) => `<li><button class="table-open" data-act="open" data-id="${p.id}">${prop(p, "name")}</button></li>`).join("")}</ul>` : '<p class="muted">Todos los productos tienen foto.</p>'}</section>`;
  }

  // ---------- Tienda ----------
  function storeView() {
    const s = state.data.settings || {};
    return `<div class="page-head"><div><p class="eyebrow">Tienda</p><h1>Datos de la tienda</h1>
      <p class="muted">Aparecerán en las cotizaciones y comprobantes de pedido.</p></div></div>
      <section class="info-panel"><form id="store-form" class="load-form">
        <label class="wide">Nombre comercial <input name="name" maxlength="120" required value="${esc(s.name || "Nicole Encajes")}"></label>
        <label>RUC <input name="ruc" maxlength="13" inputmode="numeric" pattern="[0-9]{10}([0-9]{3})?" value="${esc(s.ruc || "")}" placeholder="13 dígitos"></label>
        <label>Teléfono / WhatsApp <input name="phone" maxlength="40" value="${esc(s.phone || "")}"></label>
        <label class="wide">Dirección <input name="address" maxlength="240" value="${esc(s.address || "")}"></label>
        <label>Correo <input name="email" type="email" maxlength="160" value="${esc(s.email || "")}"></label>
        <label>IVA (%) <input name="iva_rate" type="number" min="0" max="50" step="0.01" required value="${esc(s.iva_rate ?? 15)}"></label>
        <label>Validez de cotización (días) <input name="quote_valid_days" type="number" min="1" max="90" step="1" required value="${esc(s.quote_valid_days ?? 8)}"></label>
        <div class="button-row wide"><button class="btn btn-primary" type="submit" ${state.online ? "" : "disabled"}>Guardar datos</button></div>
      </form></section>
      <section class="info-panel"><div class="section-title"><h2>Sesión</h2></div>
        <p class="muted">Esta computadora recuerda tu PIN. Cierra sesión si vas a dejar de usarla.</p>
        <button class="btn btn-quiet danger-text" data-act="logout">Cerrar sesión</button></section>`;
  }

  function tabView() {
    if (state.tab === "cargar") return loadView();
    if (state.tab === "precios") return pricesView();
    if (state.tab === "fotos") return photosView();
    if (state.tab === "tienda") return storeView();
    return catalog();
  }
  function render() {
    const main = state.locked ? pinScreen() : !state.ready ? (state.busy ? '<p class="muted center">Cargando…</p>' : blank()) : state.product ? product() : tabView();
    const focus = document.activeElement?.id;
    root.innerHTML = `${head()}<main class="container">
      ${!state.locked && !state.online && state.ready ? `<div class="alert warning"><strong>Sin conexión.</strong> Se muestran los últimos datos guardados; para modificar, reconecta. ${esc(state.error)}</div>` : ""}
      ${state.message && !state.locked ? `<div class="alert positive">${esc(state.message)}</div>` : ""}
      ${state.busy && !state.locked ? '<div class="loading-line" aria-label="Cargando"></div>' : ""}
      ${main}</main>${state.locked ? "" : modal()}
      <footer class="footer">Nicole Encajes · Administración</footer>`;
    if (focus && ["search", "price-search"].includes(focus)) {
      const el = $(focus); if (el) { el.focus(); try { el.setSelectionRange(el.value.length, el.value.length); } catch {} }
    }
    if (state.locked) document.querySelector("#pin-form input")?.focus();
  }
  async function mutate(action, payload, successText) {
    state.busy = true; state.message = ""; render();
    try {
      const result = await request(action, payload);
      state.message = successText || "Guardado correctamente";
      state.showForm = "";
      await load(true);
      return result;
    } catch (error) {
      state.busy = false; alert("No se pudo guardar: " + String(error.message || error)); render();
      return null;
    }
  }
  function syncIvaPair(input) {
    const pair = input.closest("[data-iva-pair]");
    if (!pair) return;
    const value = input.value.trim();
    const other = pair.querySelector(`[data-iva="${input.dataset.iva === "net" ? "gross" : "net"}"]`);
    if (value === "" || !Number.isFinite(Number(value))) { other.value = ""; return; }
    other.value = input.dataset.iva === "net" ? inputMoney(A.withIva(Number(value), iva())) : inputMoney(A.withoutIva(Number(value), iva()), 4);
  }

  // ---------- Eventos ----------
  root.addEventListener("input", (event) => {
    const t = event.target;
    if (t.dataset.iva && !t.dataset.price) syncIvaPair(t);
    if (t.closest("#single-form")) {
      const st = singleStatus(t.closest("#single-form")), el = $("single-status");
      el.textContent = st.text; el.className = "single-status wide " + st.cls;
    }
    if (t.id === "search") { state.search = t.value; state.page = 0; return render(); }
    if (t.id === "price-search") { state.priceSearch = t.value; return render(); }
  });
  root.addEventListener("change", async (event) => {
    const t = event.target;
    if (t.dataset.filter) { state[t.dataset.filter] = t.value; state.page = 0; return render(); }
    if (t.dataset.price) return savePriceCell(t);
    if (t.dataset.field && state.batch) {
      state.batch.rows[Number(t.dataset.row)][t.dataset.field] = t.value;
      revalidateBatch(); return refreshBatchDom();
    }
    if (t.dataset.act === "batch-only-errors") { state.batchOnlyErrors = t.checked; return render(); }
    if (t.id === "excel-file") {
      const file = t.files?.[0];
      if (!file) return;
      state.batchError = ""; state.batch = null;
      try {
        const parsed = await window.NICOLE_EXCEL.parse(file);
        state.batch = A.validateRows(parsed.rows, state.data, iva());
      } catch (error) { state.batchError = "No se pudo leer el Excel: " + String(error.message || error); }
      return render();
    }
    if (t.id === "presentation-select") { state.presentation = t.value; state.showHistory = false; render(); }
  });
  root.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-act]");
    if (!target || target.tagName === "INPUT") return;
    if (target.classList.contains("modal-shade") && event.target !== target) return;
    const action = target.dataset.act;
    if (action === "tab") { state.tab = target.dataset.tab; state.product = ""; state.message = ""; state.showForm = ""; return render(); }
    if (action === "refresh") return load();
    if (action === "logout") {
      if (!confirm("¿Cerrar sesión en esta computadora? Tendrás que volver a ingresar el PIN.")) return;
      try { await request("logout"); } catch { /* igual se borra localmente */ }
      await clearToken(); state.locked = true; state.ready = false; state.data = empty; return render();
    }
    if (action === "excel-template") return window.NICOLE_EXCEL.downloadTemplate();
    if (action === "excel-upload") return $("excel-file")?.click();
    if (action === "batch-cancel") { state.batch = null; state.batchError = ""; return render(); }
    if (action === "batch-remove") { state.batch.rows.splice(Number(target.dataset.row), 1); revalidateBatch(); if (!state.batch.rows.length) state.batch = null; return render(); }
    if (action === "batch-confirm" && state.batch && state.online) {
      const rows = state.batch.rows.filter((r) => r.status !== "error").map((r) => r.payload);
      if (!rows.length) return;
      const skipped = state.batch.counts.error;
      if (!confirm(`¿Importar ${rows.length} filas?${skipped ? ` Se omitirán ${skipped} filas con error.` : ""}`)) return;
      const result = await mutate("importExcel", { rows }, "Plantilla importada");
      if (result) {
        const x = result.summary || {};
        state.batch = null;
        state.message = `Importado: ${x.rows} filas · ${x.products} productos nuevos · ${x.presentations} presentaciones nuevas · ${x.updated} actualizadas · ${x.prices} precios · ${x.costs} costos${skipped ? ` · ${skipped} filas omitidas` : ""}.`;
        render();
      }
      return;
    }
    if (action === "prices-export") {
      const rows = A.priceRows(state.data, iva());
      const blob = window.NICOLE_EXCEL.buildTable(["Código", "Producto", "Marca", "Categoría", "Presentación", "Cantidad", "Unidad", "Proveedor", "Costo", "Precio sin IVA", "Precio con IVA", "Margen %"],
        rows.map((r) => [r.sku, r.product, r.brand, r.category, r.presentation, Number(r.quantity), r.unit, r.supplier, r.cost, r.net, r.gross, r.margin]),
        { money: [8, 9, 10], widths: [14, 34, 16, 16, 16, 10, 11, 22, 12, 15, 15, 11], sheet: "PRECIOS" });
      const url = URL.createObjectURL(blob), a = document.createElement("a");
      a.href = url; a.download = "Nicole_Encajes_Precios_" + new Date().toISOString().slice(0, 10) + ".xlsx";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
      return;
    }
    if (action === "clear-filters") { Object.assign(state, { search: "", filterCategory: "", filterPresentation: "", filterPrice: "todos", order: "nombre", page: 0 }); return render(); }
    if (action === "prev") { state.page = Math.max(0, state.page - 1); return render(); }
    if (action === "next") { state.page++; return render(); }
    if (action === "open") { Object.assign(state, { product: target.dataset.id, presentation: target.dataset.presentation || "", gallery: target.dataset.photo || "", showHistory: false, message: "" }); window.scrollTo(0, 0); return render(); }
    if (action === "back") { state.product = ""; state.presentation = ""; state.message = ""; return render(); }
    if (action === "gallery") { state.gallery = target.dataset.id; return render(); }
    if (action === "photo-primary") return mutate("setPrimaryPhoto", { product_id: state.product, photo_id: target.dataset.id }, "Foto principal actualizada");
    if (action === "photo-delete") {
      if (!confirm("¿Eliminar esta fotografía? No se puede deshacer.")) return;
      state.gallery = "";
      return mutate("deletePhoto", { photo_id: target.dataset.id }, "Fotografía eliminada");
    }
    if (action === "archive-product") {
      if (!confirm("¿Retirar este producto? Dejará de aparecer en el catálogo y en la lista de Edgar y Gloria.")) return;
      const done = await mutate("archiveProduct", { id: state.product }, "Producto retirado");
      if (done) { state.product = ""; render(); }
      return;
    }
    if (action === "history") { state.showHistory = !state.showHistory; return render(); }
    if (action === "close") { state.showForm = ""; return render(); }
    if (["edit-product", "add-presentation", "edit-presentation", "price", "cost", "suppliers"].includes(action)) {
      if (!state.online) return alert("Necesitas conexión para modificar datos");
      state.showForm = action; return render();
    }
  });
  root.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());
    if (form.id === "pin-form") {
      if (state.busy) return;
      state.busy = true; state.pinError = ""; render();
      try {
        const r = await request("login", { pin: String(data.pin || "").trim() });
        await saveToken(r.token);
        state.locked = false; state.busy = false;
        return load();
      } catch (error) { state.busy = false; state.pinError = String(error.message || error); return render(); }
    }
    if (state.busy) return;
    if (form.id === "edit-form") {
      const type = state.showForm, presentation_id = state.presentation;
      if (type === "edit-product") return mutate("editProduct", { id: state.product, name: data.name, brand: data.brand, category: data.category }, "Producto actualizado");
      if (type === "add-presentation") {
        const r = await mutate("addPresentation", { product_id: state.product, label: data.label, quantity: Number(data.quantity), unit: data.unit, sku: data.sku }, "Presentación creada");
        if (r) { state.presentation = r.id; render(); }
        return;
      }
      if (type === "edit-presentation") return mutate("editPresentation", { id: presentation_id, label: data.label, quantity: Number(data.quantity), unit: data.unit, sku: data.sku }, "Presentación actualizada");
      if (type === "price") {
        const net = data.net !== "" ? A.round(Number(data.net), 4) : data.gross !== "" ? A.withoutIva(Number(data.gross), iva()) : null;
        if (net === null || !Number.isFinite(net) || net < 0) return alert("Escribe un precio válido");
        return mutate("setPrice", { presentation_id, shop: "jefferson", price: net }, "Precio guardado");
      }
      if (type === "cost") return mutate("setCost", { presentation_id, supplier_id: data.supplier_id || null, cost: Number(data.cost) }, "Costo e historial actualizados");
      if (type === "suppliers") return mutate("addSupplier", { name: data.name, phone: data.phone }, "Proveedor registrado");
    }
    if (form.id === "single-form") {
      const r = A.validateRows([data], state.data, iva()).rows[0];
      if (r.status === "error") return alert("Revisa el formulario: " + r.errors.join(" · "));
      const files = [...(form.querySelector('input[name="images"]').files || [])];
      const color = String(data.color || "").trim();
      const result = await mutate("importExcel", { rows: [r.payload] }, r.status === "actualiza" ? "Producto actualizado" : "Producto creado");
      if (!result) return;
      if (files.length) {
        const pres = state.data.presentations.find((v) => (r.payload.codigo && A.norm(v.sku) === A.norm(r.payload.codigo))) ||
          state.data.presentations.find((v) => { const p = pById(v.product_id); return p && A.norm(p.name) === A.norm(r.payload.producto) && A.norm(p.brand) === A.norm(r.payload.marca) && A.norm(v.label) === A.norm(r.payload.presentacion); });
        if (pres) {
          state.busy = true; render();
          try {
            for (const file of files) await request("uploadPhoto", { product_id: pres.product_id, color_label: color, ...(await compress(file)) });
            state.message += ` · ${files.length} foto(s) guardada(s)`;
          } catch (error) { alert("El producto se guardó, pero la foto no: " + String(error.message || error)); }
          await load(true);
        }
      }
      return;
    }
    if (form.id === "store-form") {
      return mutate("saveSettings", { settings: { ...data, iva_rate: Number(data.iva_rate), quote_valid_days: Number(data.quote_valid_days) } }, "Datos de la tienda guardados");
    }
    if (form.id === "photo-form") {
      const files = [...(form.querySelector('input[name="images"]').files || [])];
      if (!files.length) return;
      state.busy = true; render();
      try {
        const color = String(data.color || "").trim();
        for (const file of files) await request("uploadPhoto", { product_id: state.product, color_label: color, ...(await compress(file)) });
        state.message = files.length + " fotografía(s) guardada(s)";
        await load(true);
      } catch (error) { state.busy = false; alert("Fotografía no guardada: " + String(error.message || error)); render(); }
    }
  });
  root.addEventListener("reset", (event) => {
    if (event.target.id !== "single-form") return;
    setTimeout(() => { const el = $("single-status"); el.textContent = "Escribe el producto para ver si es nuevo o si actualiza uno existente."; el.className = "single-status muted wide"; });
  });
  async function compress(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Selecciona JPG, PNG o WebP");
    const image = await createImageBitmap(file);
    const factor = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * factor));
    canvas.height = Math.max(1, Math.round(image.height * factor));
    const context = canvas.getContext("2d");
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
    if (!blob || blob.size > 2097152) throw new Error("La foto supera el tamaño permitido");
    const dataUrl = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(blob); });
    return { mime: "image/jpeg", data: String(dataUrl).split(",")[1] };
  }

  (async () => {
    token = await readToken();
    if (!token) { state.locked = true; return render(); }
    const cache = await cacheRead();
    if (cache) { state.data = { ...empty, ...cache }; state.ready = true; }
    render();
    load();
  })();
  window.addEventListener("online", () => token && load(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.ready && !state.busy && !state.showForm && !state.batch && token) load(true);
  });
  setInterval(() => {
    const editing = document.activeElement && ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName);
    if (token && state.ready && document.visibilityState === "visible" && !state.busy && !state.showForm && !state.batch && !editing) load(true);
  }, 60000);
})();
