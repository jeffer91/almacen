/* Almacén Familiar — interfaz común GitHub Pages / Electron */
"use strict";
(() => {
  const role = document.body.dataset.profile || "jefferson";
  const people = { edgar: "Edgar", gloria: "Gloria", jefferson: "Jefferson" };
  const nickname = people[role] || "Almacén";
  let apiUrl = String(window.ALMACEN_API_URL || "").trim().replace(/\/$/, "");
  const root = document.getElementById("app");
  const storageKey = "almacen-v2-key-" + role;
  const snapshotKey = "almacen-v2-cache-" + role;
  const params = new URLSearchParams(location.hash.slice(1));
  let privateKey = "";
  try { privateKey = localStorage.getItem(storageKey) || ""; } catch { /* algunas rutas file:// no admiten storage */ }
  if (params.has("key")) {
    const newKey = params.get("key") || "";
    if (/^[0-9a-f]{64}$/i.test(newKey)) {
      privateKey = newKey;
      try { localStorage.setItem(storageKey, newKey); } catch {}
      window.almacenDesktop?.saveAccessKey?.(newKey).catch(() => {});
    }
    try { history.replaceState(null, "", location.pathname + location.search); } catch { /* file:// Electron */ }
  }
  const empty = { products: [], presentations: [], prices: [], costs: [], suppliers: [], photos: [] };
  const state = {
    data: empty, ready: false, online: false, busy: false, error: "", message: "",
    search: "", product: "", presentation: "", gallery: "", showHistory: false,
    showSuppliers: false, showForm: "", showArchived: false, recent: [],
    filterCategory: "", filterPresentation: "", filterPrice: "todos", order: "nombre",
    page: 0, excelPreview: null, excelError: ""
  };
  const $ = (id) => document.getElementById(id);
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  const dollar = (value) => value === null || value === undefined || value === ""
    ? "Pendiente" : "$" + Number(value).toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const date = (value) => value ? new Date(value).toLocaleDateString("es-EC") : "—";
  const prop = (p, k) => esc(p?.[k] ?? "");
  const pById = (id) => state.data.products.find((p) => p.id === id);
  const presentations = (id) => state.data.presentations.filter((p) => p.product_id === id);
  const photos = (id) => state.data.photos.filter((p) => p.product_id === id);
  const supplier = (id) => state.data.suppliers.find((s) => s.id === id);
  const canEdit = (product) => state.online && (role === "jefferson" || product?.created_by === role);
  function priceFor(presentationId, shop = role) {
    return window.ALMACEN_RULES.resolvePrice(state.data.prices, presentationId, shop);
  }
  const photoMain = (id) => photos(id).find((p) => p.is_primary) || photos(id)[0];
  function photoEl(photo, className = "photo") {
    return photo?.signed_url
      ? `<img class="${className}" src="${esc(photo.signed_url)}" alt="${esc(photo.color_label || "Fotografía del producto")}" loading="lazy">`
      : `<div class="${className} no-photo" aria-label="Sin fotografía"><span>▧</span><small>Sin foto</small></div>`;
  }
  async function request(action, fields = {}) {
    if (!privateKey && window.almacenDesktop?.getAccessKey) {
      try { privateKey = (await window.almacenDesktop.getAccessKey()) || ""; } catch {}
    }
    if (!apiUrl && window.almacenDesktop?.getApiUrl) {
      apiUrl = String(await window.almacenDesktop.getApiUrl() || "").trim().replace(/\/$/, "");
    }
    if (!apiUrl) throw new Error("Supabase aún no está configurado");
    const headers = { "content-type": "application/json", "x-almacen-role": role };
    if (privateKey) headers["x-almacen-key"] = privateKey;
    const res = await fetch(apiUrl, {
      method: "POST", headers,
      body: JSON.stringify({ action, ...fields }), cache: "no-store"
    });
    const data = await res.json().catch(() => ({}));
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
    try {
      localStorage.setItem(snapshotKey, JSON.stringify(data));
    } catch { /* límite del navegador */ }
    try { await window.almacenDesktop?.saveCachedSnapshot?.(data); } catch { /* respaldo opcional */ }
  }
  async function load(silent = false) {
    if (!silent) state.busy = true;
    try {
      const result = await request("bootstrap");
      if (result.role !== role) throw new Error("Este enlace no pertenece a " + nickname);
      state.data = result;
      state.online = true;
      state.ready = true;
      state.error = "";
      await cacheSave(result);
    } catch (error) {
      state.online = false;
      const cache = await cacheRead();
      if (cache) { state.data = cache; state.ready = true; }
      state.error = String(error.message || error);
    } finally {
      state.busy = false; render();
    }
  }
  function roleTitle() { return "Almacén de " + nickname; }
  function head() {
    return `<header class="topbar">
      <div class="brand"><div class="brandmark"><img src="../assets/nicole-icon.svg" alt="" width="45" height="45"></div>
        <div><strong>Nicole Encajes</strong><span>${esc(roleTitle())}</span></div></div>
      <div class="top-actions">
        <span class="status ${state.online ? "connected" : "disconnected"}">${state.online ? "● Conectado" : "○ Sin conexión"}</span>
        <button class="btn btn-quiet" data-act="refresh" title="Actualizar catálogo">↻ <span>Actualizar</span></button>
      </div>
    </header>`;
  }
  function blank() {
    const configuration = !apiUrl ? `<h2>Falta conectar Supabase</h2>
      <p>La aplicación ya está preparada. Jefferson debe configurar la URL de la función en <code>web/config.js</code> y activar la base de datos.</p>` :
      !privateKey ? `<h2>Enlace de acceso pendiente</h2>
      <p>Pega tu enlace privado completo una sola vez. Después, este dispositivo lo recordará automáticamente.</p>
      <form id="activation-form" class="activation-form">
        <input name="link" type="text" autocomplete="off" spellcheck="false" required placeholder="Pega aquí tu enlace privado">
        <button class="btn btn-primary" type="submit">Activar este dispositivo</button>
      </form>` :
      `<h2>No se pudo conectar</h2><p>${esc(state.error)}</p>
      <p>Comprueba internet y que la función de Supabase esté activa.</p>`;
    return `<section class="empty-state"><span class="empty-icon">◈</span>${configuration}
      <button class="btn btn-primary" data-act="refresh">Reintentar</button></section>`;
  }
  function normalize(v) {
    return String(v ?? "").toLocaleLowerCase("es").normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "").trim();
  }
  function tableRows() {
    return state.data.products.filter(p => state.showArchived || p.active !== false)
      .flatMap(p => {
        const opts=presentations(p.id);
        return (opts.length ? opts : [null]).map(v => ({
          product: p, variant: v, price: v ? priceFor(v.id) : {price:null,inherited:false},
          supplierName: v ? supplier(v.supplier_id)?.name || "" : ""
        }));
      });
  }
  function catalog() {
    const all=tableRows();
    const categories=[...new Set(state.data.products.map(x=>x.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
    const presentationKinds=[...new Set(state.data.presentations.map(x=>x.label).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"es"));
    const filterOptions=(values,selected)=>values.map(v=>'<option value="'+esc(v)+'" '+(v===selected?"selected":"")+'>'+esc(v)+'</option>').join("");
    const terms=normalize(state.search).split(/\s+/).filter(Boolean);
    let list=all.filter(({product:p,variant:v,price,supplierName})=>{
      const text=normalize([p.name,p.brand,p.category,v?.label,v?.unit,v?.quantity,supplierName,
        ...photos(p.id).map(x=>x.color_label)].join(" "));
      return terms.every(term=>text.includes(term)) &&
        (!state.filterCategory || p.category===state.filterCategory) &&
        (!state.filterPresentation || v?.label===state.filterPresentation) &&
        (state.filterPrice==="todos" ||
          (state.filterPrice==="pendiente" && price.price===null) ||
          (state.filterPrice==="conprecio" && price.price!==null) ||
          (state.filterPrice==="heredado" && price.inherited && price.price!==null));
    });
    list.sort((a,b)=>{
      if(state.order==="precio")return (Number(a.price.price??-1)-Number(b.price.price??-1)) ||
        a.product.name.localeCompare(b.product.name,"es");
      if(state.order==="costo")return (Number(a.variant?.current_cost??-1)-Number(b.variant?.current_cost??-1)) ||
        a.product.name.localeCompare(b.product.name,"es");
      if(state.order==="reciente")return String(b.product.created_at).localeCompare(String(a.product.created_at));
      return a.product.name.localeCompare(b.product.name,"es") ||
        String(a.variant?.label||"").localeCompare(String(b.variant?.label||""),"es");
    });
    const total=list.length,perPage=60,pages=Math.max(1,Math.ceil(total/perPage));
    state.page=Math.min(state.page,pages-1);
    const visible=list.slice(state.page*perPage,(state.page+1)*perPage);
    const isAdmin=role==="jefferson";
    const cellPrice=(item,shop)=>{
      if(!item.variant)return '<span class="pending">Pendiente</span>';
      const value=priceFor(item.variant.id,shop);
      return '<span class="'+(value.price===null?"pending":"money")+'">'+
        (value.price===null?"Pendiente":dollar(value.price))+'</span>'+
        (value.inherited&&value.price!==null?'<small class="inherit-label">Heredado</small>':"");
    };
    const rowsHtml=visible.map(({product:p,variant:v,price,supplierName})=>
      '<tr>'+
      '<td class="product-name-cell"><button class="table-open" data-act="open" data-id="'+p.id+'" data-presentation="'+(v?.id||"")+'">'+
        '<span class="name-with-img">'+photoEl(photoMain(p.id),"mini-photo")+
        '<strong>'+prop(p,"name")+'</strong></span></button></td>'+
      '<td>'+esc(v?.label||"Pendiente")+'</td>'+
      '<td class="quantity-cell">'+(v?esc(v.quantity)+" "+esc(v.unit):"—")+'</td>'+
      (isAdmin?'<td>'+esc(supplierName||"—")+'</td>':"")+
      '<td class="money">'+dollar(v?.current_cost)+'</td>'+
      (isAdmin?['edgar','gloria','jefferson'].map(shop=>'<td>'+cellPrice({variant:v},shop)+'</td>').join("") :
        '<td>'+cellPrice({variant:v},role)+'</td>')+
      '<td><button class="btn btn-secondary view-row" data-act="open" data-id="'+p.id+'" data-presentation="'+(v?.id||"")+'">Ver</button></td></tr>').join("");
    const colSpan=isAdmin?9:6;
    return '<div class="page-head"><div><p class="eyebrow">Catálogo compartido</p><h1>Productos y precios</h1>'+
      '<p class="muted">Busca por nombre, presentación, marca, proveedor o color.</p></div>'+
      '<div class="toolbar-actions"><button class="btn btn-primary" data-act="new">＋ Nuevo producto</button>'+
      (isAdmin?'<button class="btn btn-secondary" data-act="excel-template">↓ Descargar plantilla Excel</button>'+
        '<button class="btn btn-secondary" data-act="excel-upload">↑ Cargar Excel</button>'+
        '<input class="sr-only" id="excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">':"")+
      '</div></div>'+
      '<div class="search-wrap"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="Nombre, color, presentación, marca…" value="'+esc(state.search)+'" autocomplete="off" aria-label="Buscar producto"></div>'+
      '<div class="filter-bar"><label>Categoría<select data-filter="filterCategory"><option value="">Todas</option>'+filterOptions(categories,state.filterCategory)+'</select></label>'+
      '<label>Presentación<select data-filter="filterPresentation"><option value="">Todas</option>'+filterOptions(presentationKinds,state.filterPresentation)+'</select></label>'+
      '<label>Precio<select data-filter="filterPrice"><option value="todos" '+(state.filterPrice==="todos"?"selected":"")+'>Todos</option>'+
      '<option value="conprecio" '+(state.filterPrice==="conprecio"?"selected":"")+'>Con precio</option>'+
      '<option value="pendiente" '+(state.filterPrice==="pendiente"?"selected":"")+'>Pendientes</option>'+
      '<option value="heredado" '+(state.filterPrice==="heredado"?"selected":"")+'>Heredados</option></select></label>'+
      '<label>Ordenar<select data-filter="order"><option value="nombre" '+(state.order==="nombre"?"selected":"")+'>Nombre A-Z</option>'+
      '<option value="reciente" '+(state.order==="reciente"?"selected":"")+'>Más recientes</option>'+
      '<option value="precio" '+(state.order==="precio"?"selected":"")+'>Precio menor</option>'+
      '<option value="costo" '+(state.order==="costo"?"selected":"")+'>Costo menor</option></select></label>'+
      '<button class="btn btn-quiet clear-filters" data-act="clear-filters">Limpiar</button></div>'+
      (state.excelPreview?excelPreview():state.excelError?'<div class="alert warning">'+esc(state.excelError)+'</div>':"")+
      '<div class="table-heading"><strong>'+total+' '+(total===1?"presentación":"presentaciones")+'</strong>'+
        '<span class="muted">'+(isAdmin?"Precios de los tres almacenes":"Precio de "+nickname)+' · Letras grandes · Tabla desplazable</span></div>'+
      '<div class="table-scroll" role="region" aria-label="Catálogo de productos" tabindex="0"><table class="catalog-table">'+
      '<thead><tr><th>Producto</th><th>Presentación</th><th>Cantidad</th>'+
      (isAdmin?'<th>Proveedor</th>':"")+
      '<th>Costo</th>'+
      (isAdmin?'<th>Edgar</th><th>Gloria</th><th>Jefferson</th>':'<th>Mi precio</th>')+
      '<th>Ficha</th></tr></thead><tbody>'+
      (rowsHtml||'<tr><td class="empty-table" colspan="'+colSpan+'">No hay resultados. Prueba otra búsqueda o agrega un producto.</td></tr>')+
      '</tbody></table></div>'+
      (pages>1?'<div class="pagination"><button class="btn btn-quiet" data-act="prev" '+(state.page===0?"disabled":"")+'>← Anterior</button>'+
        '<span>Página '+(state.page+1)+' de '+pages+'</span>'+
        '<button class="btn btn-quiet" data-act="next" '+(state.page+1>=pages?"disabled":"")+'>Siguiente →</button></div>':"");
  }
  function excelPreview(){
    const preview=state.excelPreview;
    if(!preview)return "";
    const errors=preview.errors||[];
    const sample=preview.rows.slice(0,15);
    const duplicateCount=preview.rows.filter(r=>state.data.products.some(p=>
      normalize(p.name)===normalize(r.producto) && normalize(p.brand)===normalize(r.marca))).length;
    return '<section class="import-preview"><h2>Vista previa del Excel</h2>'+
      '<p><strong>'+preview.rows.length+' presentaciones</strong> · '+duplicateCount+' filas de productos ya conocidos (se revisarán y actualizarán) · '+
      errors.length+' errores</p>'+
      (errors.length?'<div class="alert warning"><strong>Corrige el Excel antes de continuar:</strong><ul>'+
        errors.slice(0,20).map(x=>'<li>'+esc(x)+'</li>').join("")+'</ul></div>':"")+
      '<div class="table-scroll"><table class="catalog-table"><thead><tr><th>Fila</th><th>Producto</th>'+
      '<th>Presentación</th><th>Cantidad</th><th>Costo</th><th>Edgar</th><th>Gloria</th><th>Jefferson</th></tr></thead><tbody>'+
      sample.map(r=>'<tr><td>'+r._fila+'</td><td>'+esc(r.producto)+'</td><td>'+esc(r.presentacion)+'</td>'+
        '<td>'+esc(r.cantidad)+' '+esc(r.unidad)+'</td><td>'+dollar(r.costo)+'</td>'+
        '<td>'+dollar(r.precio_edgar)+'</td><td>'+dollar(r.precio_gloria)+'</td>'+
        '<td>'+dollar(r.precio_jefferson)+'</td></tr>').join("")+
      '</tbody></table></div>'+
      (preview.rows.length>15?'<p class="muted">Se muestran las primeras 15 filas de '+preview.rows.length+'.</p>':"")+
      '<div class="button-row"><button class="btn btn-quiet" data-act="excel-cancel">Cancelar importación</button>'+
      '<button class="btn btn-primary" data-act="excel-confirm" '+(errors.length||!preview.rows.length?"disabled":"")+'>Confirmar carga de '+preview.rows.length+' filas</button></div>'+
      '<p class="muted">Las celdas de precio vacías no borran precios previos. Si un producto ya existe, se conservarán sus fotografías.</p></section>';
  }
  function history(v) {
    const { entries, lowest: low, highest: high } =
      window.ALMACEN_RULES.summarizeCosts(state.data.costs, v.id);
    if (!entries.length) return '<p class="muted">Todavía no hay costos registrados.</p>';
    const row = (title, entry) => `<div class="history-stat"><span>${title}</span><strong>${dollar(entry.cost)}</strong><small>${date(entry.recorded_at)}</small></div>`;
    return `<div class="history-highlights">${row("Último", entries[0])}${row("Más bajo", low)}${row("Más alto", high)}</div>
      <div class="history-table">${entries.map((c) => `<div><span>${date(c.recorded_at)}</span><strong>${dollar(c.cost)}</strong><span>${esc(supplier(c.supplier_id)?.name || "Sin proveedor")}</span></div>`).join("")}</div>`;
  }
  function product() {
    const p = pById(state.product);
    if (!p) { state.product = ""; return catalog(); }
    const variants = presentations(p.id);
    const v = variants.find((x) => x.id === state.presentation) || variants[0];
    if (v) state.presentation = v.id;
    const selling = v ? priceFor(v.id) : null;
    const images = photos(p.id);
    const selectedPhoto = images.find((x) => x.id === state.gallery) || photoMain(p.id);
    return `<button class="back-link" data-act="back">← Volver al catálogo</button>
      <div class="product-layout"><section class="detail-card">
        <div class="gallery-main">${photoEl(selectedPhoto, "detail-image")}</div>
        <div class="thumbnails">${images.map((im) =>
          `<button class="thumb ${selectedPhoto?.id === im.id ? "active" : ""}" data-act="gallery" data-id="${im.id}" title="${esc(im.color_label || "Fotografía")}">${photoEl(im, "thumb-photo")}<span>${esc(im.color_label || "Foto")}</span></button>`).join("")}</div>
        ${state.online ? `<form id="photo-form" class="mini-form">
          <label>Agregar fotografías (también puedes usar la cámara)</label>
          <input name="color" maxlength="80" placeholder="Color o referencia (opcional)">
          <input name="images" type="file" accept="image/*" multiple required>
          <button class="btn btn-secondary" type="submit">Subir fotografías</button></form>` : ""}
      </section>
      <section class="detail-body"><div class="detail-heading"><p class="eyebrow">Ficha del producto</p><h1>${prop(p, "name")}</h1>
        <p class="muted">${[p.brand, p.category].filter(Boolean).map(esc).join(" · ") || "Catálogo familiar"}</p></div>
        <div class="info-panel"><div class="section-title"><h2>Presentación</h2></div>
          ${variants.length ? `<select id="presentation-select" aria-label="Seleccionar presentación">
            ${variants.map((x) => `<option value="${x.id}" ${x.id === v?.id ? "selected" : ""}>${prop(x, "label")}</option>`).join("")}</select>
            <p class="muted">Contenido: <strong>${esc(v.quantity)} ${esc(v.unit)}</strong></p>` : `<p class="muted">Añade una presentación para definir sus cantidades y precios.</p>`}
          ${canEdit(p) ? `<div class="button-row"><button class="btn btn-quiet" data-act="add-presentation">＋ Presentación</button>
          <button class="btn btn-quiet" data-act="edit-product">Editar producto</button>
          ${v ? `<button class="btn btn-quiet" data-act="edit-presentation">Editar presentación</button>` : ""}</div>` : ""}
        </div>
        ${v ? `<div class="price-panel"><span class="eyebrow">Precio de venta · ${nickname}</span>
          <div class="sale-price">${dollar(selling.price)}</div>
          <p class="muted">${selling.price === null ? "Todavía no se ha registrado un precio." :
            selling.inherited ? `Precio heredado de ${people[selling.from]}` : "Precio propio de tu almacén"}</p>
          ${state.online ? `<div class="button-row"><button class="btn btn-primary" data-act="price">Actualizar mi precio</button>
          ${!selling.inherited ? '<button class="btn btn-quiet" data-act="reset-price">Usar precio compartido</button>' : ""}</div>` : ""}
          ${role === "jefferson" && state.online ? '<button class="btn btn-quiet" data-act="other-prices">Administrar los tres precios</button>' : ""}
        </div>
        <div class="info-panel"><div class="section-title"><h2>Costo de compra</h2><span class="pill">Común para los tres</span></div>
          <div class="cost-value">${dollar(v.current_cost)}</div>
          <p class="muted">Última actualización: ${date(v.cost_recorded_at)}</p>
          ${role !== "gloria" && v.supplier_id ? `<p>Proveedor: <strong>${esc(supplier(v.supplier_id)?.name || "No encontrado")}</strong></p>` : ""}
          ${role === "jefferson" && state.online ? '<button class="btn btn-secondary" data-act="cost">Registrar nuevo costo</button>' : ""}
          ${role !== "gloria" ? `<button class="disclosure" data-act="history">${state.showHistory ? "▾ Ocultar" : "▸ Ver"} historial de costos</button>
            ${state.showHistory ? history(v) : ""}` : ""}
        </div>` : ""}
        ${role === "jefferson" && state.online ? '<button class="btn btn-quiet" data-act="suppliers">Administrar proveedores</button>' : ""}
      </section></div>`;
  }
  function modal() {
    const type = state.showForm;
    if (!type) return "";
    const p = pById(state.product);
    const v = state.data.presentations.find((x) => x.id === state.presentation);
    const kinds = ["Pieza", "Rollo", "Gruesa", "Caja", "Kilo", "Metro", "Yarda", "Docena", "Paquete", "Otro"];
    const unitOptions = ["unidad", "piezas", "rollos", "metros", "yardas", "kilos", "gramos", "docenas", "cajas"];
    const options = (items, selected) => items.map((x) => `<option ${x.toLowerCase() === String(selected || "").toLowerCase() ? "selected" : ""}>${esc(x)}</option>`).join("");
    const common = `<button class="btn btn-quiet" type="button" data-act="close">Cancelar</button><button class="btn btn-primary" type="submit">Guardar</button>`;
    let title = "", body = "";
    if (type === "new" || type === "edit-product") {
      title = type === "new" ? "Nuevo producto" : "Editar producto";
      body = `<label>Nombre del producto <input name="name" maxlength="180" required value="${type === "new" ? "" : prop(p, "name")}" placeholder="Ej.: Cinta N.º 3"></label>
        <label>Marca (opcional)<input name="brand" maxlength="100" value="${type === "new" ? "" : prop(p, "brand")}"></label>
        <label>Categoría (opcional)<input name="category" maxlength="100" value="${type === "new" ? "" : prop(p, "category")}"></label>
        ${type === "new" ? `<p class="hint">Puedes agregar inmediatamente su primera presentación.</p>
        <label>Primera presentación <select name="label">${options(kinds, "Pieza")}</select></label>
        <div class="form-columns"><label>Cantidad <input name="quantity" type="number" min="0.001" step="any" value="1" required></label>
        <label>Unidad <select name="unit">${options(unitOptions, "unidad")}</select></label></div>` : ""}`;
    } else if (type === "add-presentation" || type === "edit-presentation") {
      title = type === "add-presentation" ? "Agregar presentación" : "Editar presentación";
      const current = v?.label || "Pieza";
      body = `<label>Tipo de presentación <input list="types" name="label" maxlength="80" value="${type === "add-presentation" ? "Pieza" : esc(current)}" required></label>
        <datalist id="types">${kinds.map((x) => `<option value="${x}"></option>`).join("")}</datalist>
        <div class="form-columns"><label>Cantidad contenida <input type="number" name="quantity" min="0.001" step="any" value="${type === "add-presentation" ? 1 : esc(v?.quantity)}" required></label>
        <label>Unidad <input list="units" name="unit" maxlength="40" value="${type === "add-presentation" ? "unidad" : prop(v, "unit")}" required></label></div>
        <datalist id="units">${unitOptions.map((x) => `<option value="${x}"></option>`).join("")}</datalist>`;
    } else if (type === "price" || type === "other-prices") {
      title = type === "price" ? "Actualizar precio" : "Precios por almacén";
      body = `<label>Almacén <select name="shop">${Object.entries(people).filter(([key]) => role === "jefferson" || key === role).map(([key, person]) =>
        `<option value="${key}" ${key === role ? "selected" : ""}>${person}</option>`).join("")}</select></label>
        <label>Precio de venta (USD) <input name="price" type="number" min="0" step="0.01" required value="${priceFor(v?.id).price ?? ""}" placeholder="0.00"></label>
        <p class="hint">El precio propio no cambia si otro almacén actualiza el suyo.</p>`;
    } else if (type === "cost") {
      title = "Registrar costo compartido";
      body = `<label>Proveedor actual <select name="supplier_id"><option value="">Sin proveedor</option>${state.data.suppliers.filter((s) => s.active).map((s) =>
        `<option value="${s.id}" ${s.id === v?.supplier_id ? "selected" : ""}>${prop(s, "name")}</option>`).join("")}</select></label>
        <label>Costo de compra (USD) <input name="cost" type="number" min="0" step="0.0001" required value="${v?.current_cost ?? ""}"></label>
        <p class="hint">El costo anterior se conservará en el historial con su fecha de registro.</p>`;
    } else if (type === "suppliers") {
      title = "Nuevo proveedor";
      body = `<label>Nombre <input name="name" maxlength="160" required placeholder="Nombre del proveedor"></label>
      <label>Teléfono (opcional) <input name="phone" maxlength="60"></label>`;
    }
    return `<div class="modal-shade" data-act="close"><div class="modal-card" role="dialog" aria-modal="true" aria-label="${title}">
      <div class="modal-heading"><h2>${title}</h2><button class="icon-button" data-act="close" aria-label="Cerrar">×</button></div>
      <form id="edit-form">${body}<div class="modal-actions">${common}</div></form></div></div>`;
  }
  function render() {
    const main = !state.ready ? blank() : state.product ? product() : catalog();
    root.innerHTML = `${head()}<main class="container">
      ${!state.online && state.ready ? `<div class="alert warning"><strong>Consulta sin conexión.</strong> Se muestran los últimos datos guardados. Para modificar, reconecta internet. ${esc(state.error)}</div>` : ""}
      ${state.message ? `<div class="alert positive">${esc(state.message)}</div>` : ""}
      ${state.busy ? '<div class="loading-line" aria-label="Cargando"></div>' : ""}
      ${main}</main>${modal()}
      <footer class="footer">Nicole Encajes · ${nickname} · Costos compartidos y precios por almacén</footer>`;
  }
  async function mutate(action, payload, successText) {
    state.busy = true;
    state.message = "";
    render();
    try {
      const result = await request(action, payload);
      state.message = successText || "Guardado correctamente";
      state.showForm = "";
      await load(true);
      return result;
    } catch (error) {
      state.busy = false;
      alert("No se pudo guardar: " + String(error.message || error));
      render();
      return null;
    }
  }
  root.addEventListener("input", (event) => {
    if (event.target.id !== "search") return;
    const cursor = event.target.selectionStart;
    state.search = event.target.value;
    render();
    const input = $("search");
    if (input) { input.focus(); try { input.setSelectionRange(cursor, cursor); } catch {} }
  });
  root.addEventListener("change", async (event) => {
    if (event.target.dataset.filter) {
      state[event.target.dataset.filter] = event.target.value;
      state.page = 0;
      return render();
    }
    if (event.target.id === "excel-file" && role === "jefferson") {
      const file=event.target.files?.[0];
      if(!file)return;
      state.excelError="";
      try {
        const preview=await window.NICOLE_EXCEL.parse(file);
        state.excelPreview=preview;
      } catch(error){
        state.excelPreview=null;
        state.excelError="No se pudo leer el Excel: "+String(error.message||error);
      }
      return render();
    }
    if (event.target.name === "shop" && event.target.closest("#edit-form")) {
      const priceInput = event.target.closest("form").querySelector('input[name="price"]');
      if (priceInput) priceInput.value = priceFor(state.presentation, event.target.value).price ?? "";
      return;
    }
    if (event.target.id === "presentation-select") {
      state.presentation = event.target.value;
      state.showHistory = false;
      render();
    }
  });
  root.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-act]");
    if (!target) return;
    if (target.dataset.act === "close" && event.target.closest(".modal-card") && !event.target.closest("button")) return;
    const action = target.dataset.act;
    const p = pById(state.product);
    if (action === "excel-template" && role === "jefferson") {
      return window.NICOLE_EXCEL.downloadTemplate();
    }
    if (action === "excel-upload" && role === "jefferson") {
      return document.getElementById("excel-file")?.click();
    }
    if (action === "excel-cancel") { state.excelPreview = null; state.excelError = ""; return render(); }
    if (action === "excel-confirm" && role === "jefferson" && state.excelPreview &&
      !state.excelPreview.errors.length && state.online) {
      const rows=state.excelPreview.rows.map(({_fila,...rest})=>rest);
      if (!confirm("¿Importar "+rows.length+" presentaciones? Esta operación puede actualizar productos y precios existentes."))return;
      const result=await mutate("importExcel",{rows},"Plantilla Excel importada");
      if(result){
        state.excelPreview=null;
        const x=result.summary||{};
        state.message="Excel importado: "+x.rows+" filas, "+x.products+" productos nuevos, "+
          x.presentations+" presentaciones nuevas y "+x.prices+" precios registrados.";
      }
      return render();
    }
    if (action === "clear-filters") {
      state.search="";state.filterCategory="";state.filterPresentation="";
      state.filterPrice="todos";state.order="nombre";state.page=0;return render();
    }
    if (action === "prev") { state.page=Math.max(0,state.page-1);return render(); }
    if (action === "next") { state.page++;return render(); }
    if (action === "refresh") return load();
    if (action === "open") { state.product = target.dataset.id; state.presentation = target.dataset.presentation || ""; state.gallery = ""; state.showHistory = false; state.message = ""; return render(); }
    if (action === "back") { state.product = ""; state.presentation = ""; state.message = ""; return render(); }
    if (action === "gallery") { state.gallery = target.dataset.id; return render(); }
    if (action === "history") { state.showHistory = !state.showHistory; return render(); }
    if (action === "close") { state.showForm = ""; return render(); }
    if (["new", "edit-product", "add-presentation", "edit-presentation", "price", "other-prices", "cost", "suppliers"].includes(action)) {
      if (!state.online) return alert("Necesitas conexión para modificar datos");
      if (["edit-product","add-presentation","edit-presentation"].includes(action) && !canEdit(p)) return;
      if (["cost","suppliers","other-prices"].includes(action) && role !== "jefferson") return;
      state.showForm = action; return render();
    }
    if (action === "reset-price") {
      if (!confirm("¿Eliminar tu precio propio y volver a heredar el último precio compartido?")) return;
      return mutate("resetPrice", { presentation_id: state.presentation, shop: role }, "Ahora utilizas el precio compartido");
    }
  });
  root.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    if (state.busy) return;
    const data = Object.fromEntries(new FormData(form).entries());
    if (form.id === "activation-form") {
      let secret = String(data.link || "").trim();
      if (/^https?:\/\//i.test(secret)) {
        try {
          const link = new URL(secret);
          if (!link.pathname.replace(/\/$/, "").endsWith("/" + role))
            throw new Error("El enlace corresponde a otro almacén");
          secret = new URLSearchParams(link.hash.slice(1)).get("key") || "";
        } catch (error) { return alert(String(error.message || error)); }
      }
      if (!/^[a-f0-9]{64}$/i.test(secret)) return alert("El enlace de acceso no es válido");
      privateKey = secret;
      try { localStorage.setItem(storageKey, privateKey); } catch {}
      try { await window.almacenDesktop?.saveAccessKey?.(privateKey); } catch {}
      state.error = "";
      return load();
    }
    if (form.id === "edit-form") {
      const type = state.showForm;
      const presentation_id = state.presentation;
      if (type === "new") {
        const r = await mutate("addProduct", { name: data.name, brand: data.brand, category: data.category }, "Producto creado");
        if (!r) return;
        state.product = r.id;
        const variant = await mutate("addPresentation", { product_id: r.id, label: data.label, quantity: Number(data.quantity), unit: data.unit }, "Producto y presentación creados");
        if (variant) state.presentation = variant.id;
        return render();
      }
      if (type === "edit-product") return mutate("editProduct", { id: state.product, name: data.name, brand: data.brand, category: data.category }, "Producto actualizado");
      if (type === "add-presentation") {
        const r = await mutate("addPresentation", { product_id: state.product, label: data.label, quantity: Number(data.quantity), unit: data.unit }, "Presentación creada");
        if (r) state.presentation = r.id;
        return render();
      }
      if (type === "edit-presentation") return mutate("editPresentation", { id: presentation_id, label: data.label, quantity: Number(data.quantity), unit: data.unit }, "Presentación actualizada");
      if (type === "price" || type === "other-prices") return mutate("setPrice", { presentation_id, shop: data.shop, price: Number(data.price) }, "Precio guardado");
      if (type === "cost") return mutate("setCost", { presentation_id, supplier_id: data.supplier_id || null, cost: Number(data.cost) }, "Costo e historial actualizados");
      if (type === "suppliers") return mutate("addSupplier", { name: data.name, phone: data.phone }, "Proveedor registrado");
    }
    if (form.id === "photo-form") {
      const files = [...(form.querySelector('input[name="images"]').files || [])];
      if (!files.length) return;
      state.busy = true; render();
      try {
        const color = String(data.color || "").trim();
        for (const file of files) {
          const encoded = await compress(file);
          await request("uploadPhoto", { product_id: state.product, color_label: color, ...encoded });
        }
        state.message = files.length + " fotografía(s) guardada(s)";
        await load(true);
      } catch (error) {
        state.busy = false; alert("Fotografía no guardada: " + String(error.message || error)); render();
      }
    }
  });
  async function compress(file) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Selecciona JPG, PNG o WebP");
    const image = await createImageBitmap(file);
    const factor = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * factor));
    canvas.height = Math.max(1, Math.round(image.height * factor));
    const context = canvas.getContext("2d");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.78));
    if (!blob || blob.size > 2097152) throw new Error("La foto supera el tamaño permitido");
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return { mime: "image/jpeg", data: String(dataUrl).split(",")[1] };
  }
  render();
  cacheRead().then((cache) => { if (cache && !state.ready) { state.data = cache; state.ready = true; render(); } });
  load();
  window.addEventListener("online", () => load(true));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && state.ready && !state.busy) load(true); });
  setInterval(() => { if (state.ready && document.visibilityState === "visible" && !state.busy) load(true); }, 60000);
})();
