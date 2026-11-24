/* Nicole Encajes · lista de precios familiar (un solo link para Edgar y Gloria). Solo lectura + fotos. */
"use strict";
(() => {
  const V = window.NICOLE_VIEW;
  const apiUrl = String(window.ALMACEN_API_URL || "").trim().replace(/\/$/, "");
  const root = document.getElementById("app");
  const editor = document.getElementById("price-editor");
  const productEditor = document.getElementById("product-editor");
  const sheetDialog = document.getElementById("sheets-sync-dialog");
  let options = { options: [], assigned: {}, suppliers: null };
  async function rpc(name, fields) {
    const url = new URL("/rest/v1/rpc/" + name, apiUrl);
    const res = await fetch(url, { method: "POST", headers: { apikey: window.ALMACEN_PUBLIC_KEY,
      "Content-Type": "application/json" }, body: JSON.stringify(fields), cache: "no-store" });
    const result = await res.json();
    if (!res.ok) throw Error(result.message || "No se pudo conectar con la tabla.");
    return result;
  }
  function canEdit() {
    return Boolean(editor && state.online && Array.isArray(options.suppliers));
  }
  const CACHE = "nicole-lista-cache", WHO = "nicole-quien", HIDE = "nicole-ocultar-fotos";
  const PAGE = 40;
  let sheetRows = [];
  let suggesting = false;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
    session(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch { return null; } }
  };
  const state = {
    data: null, cards: [], online: false, loading: true, error: "",
    query: "", category: "", limit: PAGE, skipped: [],
    hidePending: store.session(HIDE) === "1",
    photoFor: null, draft: null, saving: false, viewer: null, toast: ""
  };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const who = () => store.get(WHO) || "";
  const whoName = (w) => w === "edgar" ? "Edgar" : w === "gloria" ? "Gloria" : "";

  async function call(action, fields = {}, token = "") {
    if (!apiUrl) throw new Error("La lista aún no está conectada");
    const res = await fetch(apiUrl, {
      method: "POST", headers: { "content-type": "application/json", ...(token ? { "x-almacen-key": token } : {}) },
      body: JSON.stringify({ action, ...fields }), cache: "no-store"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {

      throw new Error(data.error || "No fue posible conectar");
    }
    return data;
  }
  function hasAmount(card) {
    return card.items.some(item =>
      [item.gross, item.referencePrice, item.cost, item.wholesale, item.meterPrice].some(Number.isFinite)
    );
  }
  function setData(data) {
    state.data = data;
    state.cards = V.buildCards(data).filter(hasAmount);
    const existing = new Map(state.cards.filter(c => !c.brand).map(c => [c.name.trim().toLowerCase(), c]));
    const groups = new Map();
    for (const row of sheetRows) {
      const key = row.name.trim().toLowerCase();
      if (!key) continue;
      const current = existing.get(key);
      if (current?.items.some(item => item.label.trim().toLowerCase() === row.label.trim().toLowerCase())) continue;
      if (current) groups.set(key, current);
      if (!groups.has(key)) groups.set(key, {id: "sheet-" + groups.size, sheet: true, name: row.name, category: row.category, brand: "", photos: [], items: [], haystack: V.normalize(key)});
      const c = groups.get(key);
      c.items.push({label: row.label, gross: row.amount, cost: row.cost ?? null, referencePrice: row.referencePrice ?? null, net: null});
      c.haystack += " " + V.normalize(row.label + " " + row.category);
    }
    state.cards.push(...Array.from(groups.values()).filter(c => c.sheet && hasAmount(c)));
    // También permite ver opciones registradas para productos aún no presentes en el catálogo base.
    const existingKeys = new Map(state.cards.map(c => [V.normalize(c.name) + "|" + V.normalize(c.brand), c]));
    for (const option of options.options) {
      const key = V.normalize(option.product) + "|" + V.normalize(option.brand);
      if (!existingKeys.has(key)) {
        const c = { id: "option-" + option.id, name: option.product, brand: option.brand || "",
          category: option.category || "Otros", photos: [], items: [], haystack: "" };
        state.cards.push(c);
        existingKeys.set(key, c);
      }
    }
    for (const c of state.cards) {
      const matches = options.options.filter(o => V.normalize(o.product) === V.normalize(c.name) && V.normalize(o.brand) === V.normalize(c.brand));
      const originals = c.items;
      c.items = originals.filter(i => !matches.some(o => o.source_label && V.normalize(o.source_label) === V.normalize(i.label)));
      for (const i of c.items) i.supplier = options.assigned[i.id] || "";
      for (const o of matches) {
        const base = originals.find(i => o.source_label && V.normalize(i.label) === V.normalize(o.source_label));
        c.items.push({ ...o, optionId: o.id, referencePrice: base?.referencePrice, net: null });
      }
      c.items.sort((a,b) => a.label.localeCompare(b.label,"es") || (a.supplier || "").localeCompare(b.supplier || "","es"));
      c.haystack = V.normalize([c.name, c.brand, c.category, ...c.items.map(i => i.label + " " + (i.unit || "") + " " + (i.supplier || ""))].join(" "));
    }
    state.cards.sort((a,b) => a.name.localeCompare(b.name, "es"));
  }
  let reading = false;
  const sheetCache = "nicole-sheet-rows";
  try {
    const cached = JSON.parse(store.get(sheetCache) || "[]");
    if (Array.isArray(cached)) sheetRows = cached;
  } catch { /* Se recupera la copia en línea. */ }

  async function refreshSheet() {
    const response = await fetch("./sheet-catalog.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("No se pudo leer el catálogo de Sheets");
    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.every(row => row && typeof row.name === "string" && typeof row.label === "string")) {
      throw new Error("Formato de catálogo inválido");
    }
    const serialized = JSON.stringify(rows);
    if (serialized === JSON.stringify(sheetRows)) return false;
    sheetRows = rows;
    store.set(sheetCache, serialized);
    return true;
  }
  async function load() {
    if (reading) return;
    reading = true;
    if (!state.data) render();
    try {
      const [, catalog, variants] = await Promise.allSettled([refreshSheet(), call("catalog"),
        rpc("family_option_list", { device: editor ? String(window.EDGAR_EDIT_DEVICE || "") : "" })]);
      if (variants.status === "rejected") throw variants.reason;
      options = variants.value;
      store.set("nicole-option-cache", JSON.stringify({ ...options, suppliers: null }));
      if (catalog.status === "rejected") throw catalog.reason;
      const data = catalog.value;
      setData(data);
      state.online = true;
      state.error = "";
      const { photos, ...rest } = data;
      store.set(CACHE, JSON.stringify({ ...rest, photos: [] }));
    } catch (error) {
      state.online = false;
      state.error = String(error.message || error);
      let fallback = state.data;
      if (!fallback) {
        try { fallback = JSON.parse(store.get(CACHE)); } catch { /* caché dañada */ }
      }
      try { options = JSON.parse(store.get("nicole-option-cache")) || options; } catch {}
      if (fallback?.products || sheetRows.length) setData(fallback || { products: [] });
    } finally {
      reading = false;
      state.loading = false;
      render();
    }
  }
  async function checkPublishedChanges() {
    if (!document.hidden && !editor?.open && !productEditor?.open && !sheetDialog?.open && !state.viewer && !state.draft && !state.photoFor) await load();
  }
  window.setInterval(checkPublishedChanges, 60000);

  // ---------- Vista ----------
  function render() {
    const scroll = window.scrollY;
    const active = document.activeElement?.id;
    root.innerHTML = header() + `<main class="v-main">${body()}</main>` + overlay() +
      (state.toast ? `<div class="v-toast" role="status">${esc(state.toast)}</div>` : "");
    if (active === "q") { const q = document.getElementById("q"); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    window.scrollTo(0, scroll);
  }
  function header() {
    const ready = state.cards.length > 0;
    return `<header class="v-top">
      <div class="v-brand"><img src="./assets/nicole-icon.svg" alt="" width="40" height="40">
        <div><strong>Nicole Encajes</strong><span>${editor ? "Edgar · Edición del catálogo" : "Lista de precios"}</span></div></div>
      <div class="v-actions">
        ${editor ? '<button class="v-mini v-sync-btn" data-act="sync-sheet" title="Respaldar cambios de Supabase en Google Sheets">⟳ Google Sheets</button>' : ""}
        ${editor && state.online ? '<button class="v-btn v-add-product" data-act="new-product">+ Nuevo producto</button>' : ""}
        <a class="v-mini v-ventas" href="./catalogo-excel/" title="Todas las columnas originales del Excel">Catálogo Excel</a>\n        <a class="v-mini v-ventas" href="./ventas/">Ventas</a>
        <a class="v-mini v-ventas" href="./administrador/">Administrador</a>
        <a class="v-mini v-ventas" href="./sincronizar/" title="Respaldo y sincronización con Google Sheets (acceso público)">Respaldo</a>
        <button class="v-mini" data-act="pdf" ${ready ? "" : "disabled"} title="Descargar PDF">PDF</button>
        <button class="v-mini" data-act="xlsx" ${ready ? "" : "disabled"} title="Descargar Excel">Excel</button>
      </div></header>`;
  }
  function body() {
    if (state.loading && !state.data) return `<p class="v-empty">Cargando precios…</p>`;
    if (!state.data) return `<section class="v-empty"><h2>No se pudo cargar la lista</h2><p>${esc(state.error)}</p>
      <button class="v-btn" data-act="reload">Intentar de nuevo</button></section>`;
    const offline = !state.online ? `<p class="v-offline">Sin conexión: mostrando la última lista guardada.
      <button class="v-link" data-act="reload">Reintentar</button></p>` : "";
    if (!state.cards.length) return offline + `<section class="v-empty"><h2>Todavía no hay productos con precio o costo registrado</h2>
      <p>Aún no hay productos para mostrar.</p>
      ${editor && state.online ? '<button class="v-btn v-add-empty" data-act="new-product">+ Agregar primer producto</button>' : ""}</section>`;
    const results = V.search(state.cards, state.query, state.category);
    const cats = V.categories(state.cards);
    return offline + `<div class="v-layout"><div class="v-results">
      <label class="v-search"><span aria-hidden="true">⌕</span>
        <input id="q" type="search" inputmode="search" autocomplete="off" placeholder="Buscar producto o marca" value="${esc(state.query)}" aria-label="Buscar producto">
        ${state.query ? `<button class="v-clear" data-act="clear" aria-label="Borrar búsqueda">✕</button>` : ""}</label>
      ${suggesting && state.query.trim() && results.length ? `<div style="display:grid;gap:.25rem;margin:.25rem 0" class="v-suggestions" aria-label="Sugerencias">${results.slice(0,8).map(c => `<button class="v-chip" data-act="suggest" data-name="${esc(c.name)}">${esc(c.name)}</button>`).join("")}</div>` : ""}
      <p class="v-count">${results.length === state.cards.length ? results.length + " productos" : results.length + " de " + state.cards.length + " productos"}</p>
      ${results.length ? catalogTable(results.slice(0, state.limit)) :
        `<p class="v-empty">No encontramos “${esc(state.query)}”. Prueba con otra palabra.</p>`}
      ${results.length > state.limit ? `<button class="v-btn v-more" data-act="more">Ver más productos</button>` : ""}</div>
      <aside class="v-categories"><strong>Categorías</strong><nav aria-label="Categorías">${["", ...cats].map(c => `<button class="v-chip ${state.category === c ? "on" : ""}" aria-pressed="${state.category === c}" data-act="cat" data-cat="${esc(c)}">${esc(c || "Todos")}</button>`).join("")}</nav>
      <select aria-label="Filtrar por categoría" id="category-select">${["", ...cats].map(c => `<option value="${esc(c)}" ${c === state.category ? "selected" : ""}>${esc(c || "Todos")}</option>`).join("")}</select></aside></div>`;
  }
  function catalogTable(cards) {
    const editable = canEdit();
    const showActions = Boolean(editor);
    const rows = cards.flatMap(c => c.items.map((item, index) => {
      const attrs = `data-id="${esc(c.id)}" data-index="${index}"`;
      const reference = item.gross == null && item.referencePrice != null;
      const price = item.gross ?? item.referencePrice;
      const qty = item.quantity == null ? (/^[0-9]+(?:[.,][0-9]+)?\s+.+$/.test(item.label) ? item.label : "—") : [item.quantity,item.unit].filter(Boolean).join(" ");
      return `<tr><th scope="row">${esc(c.name)}${c.brand ? "<small>"+esc(c.brand)+"</small>" : ""}</th>
        <td>${esc(item.label)}</td><td>${esc(item.supplier || "—")}</td><td>${esc(qty)}</td>
        <td class="money">${item.cost == null ? "—" : V.money(item.cost)}${item.costMeter != null ? `<br><small>Costo/m: ${item.costMeter.toFixed(4)}</small>` : ""}${item.wholesale != null ? `<br><small>PXM: ${V.money(item.wholesale)}</small>` : ""}${item.meterPrice != null ? `<br><small>Precio/m: ${item.meterPrice.toFixed(4)}</small>` : ""}</td>
        <td class="money sale">${price == null ? "—" : V.money(price)}${reference ? "<small>Referencia · unidad por confirmar</small>" : ""}${item.net != null ? "<small>Sin IVA: "+V.money(item.net)+"</small>" : ""}</td>
        ${showActions ? `<td class="v-row-actions">
          <button class="v-pencil" data-act="edit-price" ${attrs} aria-label="Editar precio de ${esc(c.name)}, ${esc(item.label)}" title="Editar precio y presentación" ${state.online ? "" : "disabled"}>
            <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L9 17l-4 1 1-4z"/></svg><span>Editar</span>
          </button>
          ${index === 0 ? `<button class="v-mini" data-act="add-option" ${attrs} ${state.online ? "" : "disabled"}>+ Opción</button>` : ""}
        </td>` : ""}</tr>`;
    })).join("");
    return (editor && !editable && state.online ?
      '<div class="v-activation-banner">No se pudo habilitar la edición. <button class="v-mini" data-act="reload">Recargar</button></div>' : "") +
      `<div class="table-scroll" role="region" aria-label="Tabla de productos" tabindex="0"><table class="catalog-table">
      <thead><tr>${["Producto","Presentación","Proveedor","Cantidad","Costo de compra","Precio de venta",...(showActions ? ["Acciones"] : [])].map(h=>"<th scope=col>"+h+"</th>").join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function overlay() {
    if (state.viewer) {
      const c = state.cards.find((x) => x.id === state.viewer);
      if (!c) return "";
      return `<div class="v-overlay" data-act="close"><div class="v-sheet v-gallery" role="dialog" aria-label="Fotos de ${esc(c.name)}">
        <div class="v-sheet-head"><strong>${esc(c.name)}</strong><button class="v-link" data-act="close">Cerrar</button></div>
        ${c.photos.map((p) => `<figure><img src="${esc(p.signed_url || "")}" alt="${esc(p.color_label || c.name)}">${p.color_label ? `<figcaption>${esc(p.color_label)}</figcaption>` : ""}</figure>`).join("")}
      </div></div>`;
    }
    if (state.draft) {
      const c = state.cards.find((x) => x.id === state.photoFor);
      const w = who();
      return `<div class="v-overlay"><form class="v-sheet" id="photo-form" role="dialog" aria-label="Guardar foto">
        <div class="v-sheet-head"><strong>${esc(c?.name || "Foto")}</strong><button type="button" class="v-link" data-act="cancel">Cancelar</button></div>
        <img class="v-preview" src="${esc(state.draft.url)}" alt="Vista previa">
        <label class="v-field">Color (opcional)<input name="color" maxlength="60" placeholder="Ej.: rojo, beige, azul" autocomplete="off"></label>
        ${w ? `<p class="v-who">Foto de ${whoName(w)} · <button type="button" class="v-link" data-act="who-reset">cambiar</button></p>`
          : `<fieldset class="v-whopick"><legend>¿Quién toma la foto?</legend>
            <label><input type="radio" name="who" value="edgar" required> Edgar</label>
            <label><input type="radio" name="who" value="gloria"> Gloria</label></fieldset>`}
        <button class="v-btn v-save" type="submit" ${state.saving ? "disabled" : ""}>${state.saving ? "Guardando…" : "Guardar foto"}</button>
      </form></div>`;
    }
    return "";
  }

  // ---------- Fotos ----------
  const picker = document.createElement("input");
  picker.type = "file"; picker.accept = "image/*"; picker.setAttribute("capture", "environment"); picker.hidden = true;
  document.body.appendChild(picker);
  picker.addEventListener("change", async () => {
    const file = picker.files?.[0]; picker.value = "";
    if (!file) return;
    try {
      const blob = await shrink(file);
      state.draft = { blob, url: URL.createObjectURL(blob) };
      render();
    } catch { toast("No se pudo leer la foto. Intenta otra vez."); }
  });
  async function shrink(file, max = 1600) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
      const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const q of [0.82, 0.7, 0.55]) {
        const out = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", q));
        if (out && out.size < 1900000) return out;
      }
      throw new Error("grande");
    } finally { URL.revokeObjectURL(url); }
  }
  function toBase64(blob) {
    return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(",")[1]); r.onerror = bad; r.readAsDataURL(blob); });
  }
  function closeDraft() {
    if (state.draft) URL.revokeObjectURL(state.draft.url);
    state.draft = null; state.photoFor = null; state.saving = false;
  }
  async function savePhoto(form) {
    const data = new FormData(form);
    const by = who() || String(data.get("who") || "");
    if (!by) return toast("Elige quién toma la foto");
    store.set(WHO, by);
    state.saving = true; render();
    try {
      await call("uploadPhoto", { product_id: state.photoFor, by, mime: "image/jpeg",
        color_label: String(data.get("color") || "").trim(), data: await toBase64(state.draft.blob) });
      closeDraft(); toast("¡Foto guardada! Gracias.");
      await load();
    } catch (error) {
      state.saving = false; render(); toast(String(error.message || error));
    }
  }
  let toastTimer;
  function toast(text) {
    state.toast = text; render();
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { state.toast = ""; render(); }, 3200);
  }

  // ---------- Descargas ----------
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
  function exportRows() { return V.rows(V.search(state.cards, state.query, state.category)); }
  function stamp() { return new Date().toISOString().slice(0, 10); }

  function openEditor(card, item, adding) {
    const form = editor.querySelector("form");
    const f = form.elements;
    if (!canEdit()) return toast("La edición no está disponible. Recarga la página.");
    const current = adding ? {} : item;
    const qty = /^(\d+(?:[.,]\d+)?)\s+(.+)$/.exec(current.label || "");
    const status = document.getElementById("edit-status");
    const cancel = document.getElementById("cancel-edit");
    const save = form.querySelector("[type=submit]");
    document.getElementById("supplier-list").innerHTML = options.suppliers.map(n => `<option value="${esc(n)}"></option>`).join("");
    document.getElementById("edit-product").textContent = card.name;
    document.getElementById("edit-title").textContent = adding ? "Agregar presentación o proveedor" : "Editar precio y presentación";
    form.reset();
    for (const field of ["label","supplier","gross","cost"]) f[field].value = current[field] ?? "";
    f.quantity.value = current.quantity ?? qty?.[1].replace(",",".") ?? "1";
    f.unit.value = current.unit ?? qty?.[2] ?? "unidad";
    status.textContent = "";
    cancel.onclick = () => editor.close();
    editor.oncancel = event => { if (save.disabled) event.preventDefault(); };
    form.onsubmit = async event => {
      event.preventDefault();
      if (save.disabled) return;
      save.disabled = cancel.disabled = true;
      try {
        const entry = { id: current.optionId, revision: current.revision, product: card.name, brand: card.brand,
          source_label: adding ? null : current.optionId ? current.source_label : current.label };
        for (const field of ["label","supplier","unit"]) entry[field] = f[field].value.trim().replace(/\s+/g," ");
        for (const field of ["quantity","cost","gross"]) entry[field] = f[field].value === "" ? null : f[field].valueAsNumber;
        if (entry.cost == null && entry.gross == null && current.referencePrice == null) throw Error("Ingresa un costo o un precio.");
        const supplier = options.suppliers.find(n => n.trim().toLowerCase() === entry.supplier.toLowerCase());
        if (supplier) entry.supplier = supplier;
        if (card.items.some(other => (adding || other !== item) && other.label.trim().toLowerCase() === entry.label.toLowerCase() &&
            (other.supplier || "").trim().toLowerCase() === entry.supplier.toLowerCase())) throw Error("Ya existe esta combinación de presentación y proveedor.");
        const canonical = !adding && !current.optionId && /^[0-9a-f-]{36}$/i.test(current.id || "") && current.updated_at;
        if (canonical) {
          await rpc("family_edgar_update_presentation", { device: String(window.EDGAR_EDIT_DEVICE || ""),
            entry: { ...entry, presentation_id: current.id, updated_at: current.updated_at } });
        } else {
          await rpc("family_save_option", { device: String(window.EDGAR_EDIT_DEVICE || ""), entry });
        }
        editor.close();
        await load();
        toast(state.online ? "Guardado en Supabase. Sincroniza Google Sheets cuando quieras." : "Guardado. Recarga para ver los cambios.");
      } catch(error) { status.textContent = error.message; }
      finally { save.disabled = cancel.disabled = false; }
    };
    editor.showModal();
  }

  function openNewProduct() {
    if (!productEditor || !state.online) return;
    if (!canEdit()) return toast("La edición no está disponible. Recarga la página.");
    const form = productEditor.querySelector("form");
    const f = form.elements;
    const save = form.querySelector("[type=submit]");
    const cancel = document.getElementById("cancel-product");
    const status = document.getElementById("product-status");
    document.getElementById("product-categories").innerHTML = V.categories(state.cards)
      .map(c => `<option value="${esc(c)}"></option>`).join("");
    document.getElementById("product-suppliers").innerHTML = options.suppliers
      .map(n => `<option value="${esc(n)}"></option>`).join("");
    form.reset();
    status.textContent = "";
    cancel.onclick = () => productEditor.close();
    productEditor.oncancel = event => { if (save.disabled) event.preventDefault(); };
    form.onsubmit = async event => {
      event.preventDefault();
      if (save.disabled) return;
      save.disabled = cancel.disabled = true;
      try {
        const entry = {};
        for (const key of ["product", "brand", "category", "label", "supplier", "unit"]) {
          entry[key] = f[key].value.trim().replace(/\s+/g, " ");
        }
        entry.quantity = f.quantity.valueAsNumber;
        entry.cost = f.cost.value === "" ? null : f.cost.valueAsNumber;
        entry.gross = f.gross.valueAsNumber;
        if (!entry.product || !entry.category || !entry.label || !Number.isFinite(entry.quantity) ||
            entry.quantity <= 0 || !Number.isFinite(entry.gross) || entry.gross < 0 ||
            (entry.cost !== null && (!Number.isFinite(entry.cost) || entry.cost < 0))) {
          throw Error("Completa el nombre, categoría, presentación, cantidad y precio de venta.");
        }
        const duplicates = [...(state.data?.products || []), ...state.cards];
        if (duplicates.some(c => V.normalize(c.name) === V.normalize(entry.product) &&
          V.normalize(c.brand) === V.normalize(entry.brand))) {
          throw Error("Ese producto ya existe. Búscalo en la tabla y usa «Agregar opción».");
        }
        const supplier = options.suppliers.find(n => V.normalize(n) === V.normalize(entry.supplier));
        if (supplier) entry.supplier = supplier;
        await rpc("family_edgar_add_product", { device: String(window.EDGAR_EDIT_DEVICE || ""), entry });
        productEditor.close();
        state.query = entry.product;
        state.category = "";
        state.limit = PAGE;
        await load();
        toast(state.online ? "Producto guardado en Supabase. Sincroniza Google Sheets." : "Producto guardado. Recarga para ver los cambios.");
      } catch (error) {
        status.textContent = error.message || "No fue posible guardar el producto.";
      } finally {
        save.disabled = cancel.disabled = false;
      }
    };
    productEditor.showModal();
    f.product.focus();
  }

  // Sincronización: nunca se considera realizada hasta que Google Sheets confirme la escritura.
  function syncStatus(message,kind="") {
    const target=document.getElementById("sheets-sync-status");
    if(target) { target.textContent=message; target.className=kind; }
  }
  function openSheetSync() {
    if(!sheetDialog) return;
    syncStatus("La base oficial es Supabase. El respaldo incluye únicamente registros ya guardados en Supabase, no referencias estáticas de la web.");
    sheetDialog.showModal();
  }
  async function sendSheetSync() {
    if(!sheetDialog?.open || !state.online) return syncStatus("Sin conexión. Recarga el catálogo antes de sincronizar.","error");
    const button=document.getElementById("sheets-sync-now");
    if(button.disabled) return;
    button.disabled=true;
    syncStatus("Enviando respaldo actual de Supabase a Google Sheets…");
    try {
      const target=apiUrl.replace(/\/catalog-api$/,"/sync-sheets");
      if(target===apiUrl) throw Error("No está configurada la dirección de sincronización.");
      const response=await fetch(target,{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({device:String(window.EDGAR_EDIT_DEVICE||"")}),cache:"no-store"});
      const result=await response.json().catch(()=>({}));
      if(!response.ok || !result.ok) {
        if(result.code==="GOOGLE_NOT_CONNECTED" || result.needs_setup) {
          throw Error("La conexión automática con Google todavía no está autorizada. Usa «Copiar respaldo de Supabase» y pégalo en RESPALDO_EDGAR, o completa la configuración de Apps Script.");
        }
        throw Error(result.error||"Google Sheets no confirmó la sincronización.");
      }
      syncStatus("Google Sheets actualizado correctamente: "+result.rows+" registros respaldados desde Supabase. Fecha UTC: "+result.synced_at,"good");
    } catch(error) {
      syncStatus(String(error.message||error),"error");
    } finally {
      button.disabled=false;
    }
  }
  function freshSheetRows() {
    if(!state.online || !state.data || !window.NICOLE_SHEETS_BACKUP)
      throw Error("No hay una lectura en línea de Supabase. Pulsa recargar antes de exportar.");
    const today=new Intl.DateTimeFormat("en-CA",{year:"numeric",month:"2-digit",day:"2-digit",
      timeZone:"America/Guayaquil"}).format(new Date());
    return window.NICOLE_SHEETS_BACKUP.backupRows(state.data,options,today);
  }
  async function copySheetBackup() {
    try {
      const rows=freshSheetRows();
      if(!navigator.clipboard?.writeText) throw Error("El navegador no permite copiar. Pulsa «Descargar respaldo TSV».");
      await navigator.clipboard.writeText(window.NICOLE_SHEETS_BACKUP.asTSV(rows));
      syncStatus("Copiados "+(rows.length-1)+" registros oficiales de Supabase. En Google Sheets abre RESPALDO_EDGAR, borra los valores anteriores A:R y pega desde A1. Aún no está sincronizado hasta que pegues.","good");
    }catch(error) { syncStatus(String(error.message||error),"error"); }
  }
  function downloadSheetBackup() {
    try {
      const rows=freshSheetRows();
      const tsv=window.NICOLE_SHEETS_BACKUP.asTSV(rows);
      download(new Blob(["\uFEFF"+tsv],{type:"text/tab-separated-values;charset=utf-8"}),
        "Nicole_Encajes_Respaldo_Edgar_"+stamp()+".tsv");
      syncStatus("Descargados "+(rows.length-1)+" registros oficiales. Abre RESPALDO_EDGAR e importa el TSV; esto aún no actualiza Google Sheets.","good");
    }catch(error) {syncStatus(String(error.message||error),"error");}
  }
  if(sheetDialog) {
    document.getElementById("sheets-sync-close").onclick=()=>sheetDialog.close();
    document.getElementById("sheets-sync-now").onclick=sendSheetSync;
    document.getElementById("sheets-copy").onclick=copySheetBackup;
    document.getElementById("sheets-download").onclick=downloadSheetBackup;
  }

  // ---------- Eventos ----------
  root.addEventListener("change", event => {
    if (event.target.id !== "category-select") return;
    state.category = event.target.value;
    state.limit = PAGE;
    render();
    document.getElementById("category-select")?.focus();
  });
  root.addEventListener("input", (event) => {
    if (event.target.id !== "q") return;
    suggesting = true; state.query = event.target.value; state.limit = PAGE; render();
  });
  root.addEventListener("submit", (event) => {
    if (event.target.id !== "photo-form") return;
    event.preventDefault(); savePhoto(event.target);
  });
  root.addEventListener("click", (event) => {
    const el = event.target.closest("[data-act]");
    if (!el) return;
    if (el.dataset.act === "close" && el !== event.target && el.classList.contains("v-overlay")) return;
    const id = el.dataset.id;
    switch (el.dataset.act) {
      case "sync-sheet": openSheetSync(); break;
      case "new-product": openNewProduct(); break;
      case "add-option":
      case "edit-price": {
        const card = state.cards.find(c => c.id === id);
        if (editor && card) openEditor(card, card.items[Number(el.dataset.index)], el.dataset.act === "add-option");
        break;
      }
      case "reload": load(); break;
      case "suggest": suggesting = false; state.query = el.dataset.name; state.limit = PAGE; render(); document.getElementById("q")?.focus(); break;
      case "clear": state.query = ""; state.limit = PAGE; render(); document.getElementById("q")?.focus(); break;
      case "cat": state.category = el.dataset.cat || ""; state.limit = PAGE; render(); break;
      case "more": state.limit += PAGE; render(); break;
      case "skip": state.skipped.push(id); render(); break;
      case "hidePending": state.hidePending = true; store.session(HIDE, "1"); render(); break;
      case "showPending": state.hidePending = false; store.session(HIDE, "0"); render(); break;
      case "photo": state.photoFor = id; picker.click(); break;
      case "cancel": closeDraft(); render(); break;
      case "who-reset": store.set(WHO, ""); render(); break;
      case "view": state.viewer = id; render(); break;
      case "close": state.viewer = null; render(); break;
      case "pdf": download(new Blob([V.buildPdf(exportRows(), "Actualizado: " + new Date().toLocaleDateString("es-EC"))], { type: "application/pdf" }), "Nicole_Encajes_Precios_" + stamp() + ".pdf"); break;
      case "xlsx": download(window.NICOLE_EXCEL.buildPriceList(exportRows()), "Nicole_Encajes_Precios_" + stamp() + ".xlsx"); break;
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && (state.viewer || state.draft)) { state.viewer = null; closeDraft(); render(); }
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && !state.draft && !state.photoFor) load(); });
  // Los enlaces antiguos no deben mostrar ni procesar sus códigos de activación.
  if (editor && location.hash.startsWith("#activar=")) history.replaceState(null, "", location.pathname + location.search);
  load();
})();
