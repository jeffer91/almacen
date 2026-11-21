/* Nicole Encajes · lista de precios familiar (un solo link para Edgar y Gloria). Solo lectura + fotos. */
"use strict";
(() => {
  const V = window.NICOLE_VIEW;
  const apiUrl = String(window.ALMACEN_API_URL || "").trim().replace(/\/$/, "");
  const root = document.getElementById("app");
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

  async function call(action, fields = {}) {
    if (!apiUrl) throw new Error("La lista aún no está conectada");
    const res = await fetch(apiUrl, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...fields }), cache: "no-store"
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "No fue posible conectar");
    return data;
  }
  function hasAmount(card) {
    return card.items.some(item =>
      [item.gross, item.referencePrice, item.cost].some(Number.isFinite)
    );
  }
  function setData(data) {
    state.data = data;
    state.cards = V.buildCards(data).filter(hasAmount);
    const names = new Set(state.cards.map(c => V.normalize(c.name)));
    const groups = new Map();
    for (const row of sheetRows) {
      const key = V.normalize(row.name);
      if (!key || names.has(key)) continue;
      if (!groups.has(key)) groups.set(key, {id: "sheet-" + groups.size, sheet: true, name: row.name, category: row.category, brand: "", photos: [], items: [], haystack: key});
      const c = groups.get(key);
      c.items.push({label: row.label, gross: row.amount, cost: row.cost ?? null, referencePrice: row.referencePrice ?? null, net: null});
      c.haystack += " " + V.normalize(row.label + " " + row.category);
    }
    state.cards.push(...Array.from(groups.values()).filter(hasAmount));
    state.cards.sort((a,b) => a.name.localeCompare(b.name, "es"));
  }
  async function load() {
    state.loading = true; render();
    try {
      const [sheet, catalog] = await Promise.allSettled([
        fetch("./sheet-catalog.json", {cache: "no-cache"}).then(r => {
          if (!r.ok) throw new Error("Catálogo de la hoja no disponible");
          return r.json();
        }), call("catalog")
      ]);
      if (sheet.status === "fulfilled") sheetRows = sheet.value;
      if (catalog.status === "rejected") throw catalog.reason;
      const data = catalog.value;
      setData(data); state.online = true; state.error = "";
      const { photos, ...rest } = data; // las fotos firmadas caducan: no se guardan
      store.set(CACHE, JSON.stringify({ ...rest, photos: [] }));
    } catch (error) {
      state.online = false; state.error = String(error.message || error);
      if (!state.data) {
        try { const cached = JSON.parse(store.get(CACHE) || "null"); if (cached?.products) setData(cached); } catch { /* caché dañada */ }
      }
          if (!state.data && sheetRows.length) setData({products: []});
    } finally { state.loading = false; render(); }
  }

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
        <div><strong>Nicole Encajes</strong><span>Lista de precios</span></div></div>
      <div class="v-actions">
        <a class="v-mini v-ventas" href="./ventas/">Ventas</a>
        <a class="v-mini v-ventas" href="./sincronizar/" title="Respaldo y sincronización con Google Sheets (requiere PIN)">Respaldo</a>
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
      <p>Jefferson está cargando la lista. Vuelve a revisar más tarde.</p></section>`;
    const results = V.search(state.cards, state.query, state.category);
    const cats = V.categories(state.cards);
    return offline + `<div class="v-layout"><div class="v-results">
      <label class="v-search"><span aria-hidden="true">⌕</span>
        <input id="q" type="search" inputmode="search" autocomplete="off" placeholder="Buscar producto o marca" value="${esc(state.query)}" aria-label="Buscar producto">
        ${state.query ? `<button class="v-clear" data-act="clear" aria-label="Borrar búsqueda">✕</button>` : ""}</label>
      ${suggesting && state.query.trim() && results.length ? `<div style="display:grid;gap:.25rem;margin:.25rem 0" class="v-suggestions" aria-label="Sugerencias">${results.slice(0,8).map(c => `<button class="v-chip" data-act="suggest" data-name="${esc(c.name)}">${esc(c.name)}</button>`).join("")}</div>` : ""}
      <p class="v-count">${results.length === state.cards.length ? results.length + " productos" : results.length + " de " + state.cards.length + " productos"}</p>
      ${results.length ? `<div class="v-list">${results.slice(0, state.limit).map(card).join("")}</div>` :
        `<p class="v-empty">No encontramos “${esc(state.query)}”. Prueba con otra palabra.</p>`}
      ${results.length > state.limit ? `<button class="v-btn v-more" data-act="more">Ver más productos</button>` : ""}</div>
      <aside class="v-categories"><strong>Categorías</strong><nav aria-label="Categorías">${["", ...cats].map(c => `<button class="v-chip ${state.category === c ? "on" : ""}" aria-pressed="${state.category === c}" data-act="cat" data-cat="${esc(c)}">${esc(c || "Todos")}</button>`).join("")}</nav>
      <select aria-label="Filtrar por categoría" id="category-select">${["", ...cats].map(c => `<option value="${esc(c)}" ${c === state.category ? "selected" : ""}>${esc(c || "Todos")}</option>`).join("")}</select></aside></div>`;
  }
  function card(c) {
    const main = c.photos[0];
    const pic = main?.signed_url
      ? `<button class="v-pic" data-act="view" data-id="${c.id}" aria-label="Ver fotos de ${esc(c.name)}"><img src="${esc(main.signed_url)}" alt="" loading="lazy">${c.photos.length > 1 ? `<span>${c.photos.length}</span>` : ""}</button>`
      : "";
    const meta = [c.brand, c.category].filter(Boolean).map(esc).join(" · ");
    const items = c.items.length ? c.items.map((item) => {
      const reference = item.gross == null && item.referencePrice != null;
      const price = item.gross ?? item.referencePrice;
      return `<li><span>${esc(item.label)}</span><span class="v-amounts">
        <b>Precio de venta: ${price == null ? "Sin registrar" : V.money(price)}</b>
        ${reference ? "<small>Precio de referencia · unidad de venta por confirmar</small>" : ""}
        ${item.net == null ? "" : `<small>Sin IVA: ${V.money(item.net)}</small>`}
        <b class="v-cost">Costo de compra: ${item.cost == null ? "Sin registrar" : V.money(item.cost)}</b>
      </span></li>`;
    }).join("")
      : `<li><span>Sin presentaciones</span><b class="v-pend">Pendiente</b></li>`;
    return `<article class="v-card">${pic}<div class="v-info"><h3>${esc(c.name)}</h3>${meta ? `<p>${meta}</p>` : ""}
      <ul class="v-prices">${items}</ul>
      </div></article>`;
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
  load();
})();
