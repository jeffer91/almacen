/* =========================================================
Nombre completo: catalog-enhancements.js
Ruta o ubicación: /app/renderer/catalog-enhancements.js
Función:
- Convertir el catálogo en una tabla simple para Edgar y Gloria.
- Dar búsqueda por nombre, código, presentación o proveedor.
- Permitir Nuevo producto y Cambiar precio con formularios sencillos.
- Permitir editar datos básicos conservando el historial de costo y precio.
- Agregar al Administrador la importación automática de Excel y revisión de duplicados.
========================================================= */

"use strict";

(() => {
  if (window.__almacenSimpleWorkflow) return;
  window.__almacenSimpleWorkflow = true;
  if (!window.almacen) return;

  const money = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });
  const state = {
    rows: [],
    currentSearch: "",
    loading: false,
    selectedForPrice: null,
    duplicates: [],
    importSummary: null,
    operatorAutoOpenBusy: false
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function amount(value) {
    const number = Number(value);
    return Number.isFinite(number) ? money.format(number) : "—";
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("es-EC", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function profile() {
    return window.AlmacenShell?.getProfile?.() || null;
  }

  function toast(message) {
    window.AlmacenShell?.showToast?.(message);
  }

  function installStylesheet() {
    if (document.querySelector('link[data-simple-workflow="true"]')) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "./styles/simple-workflow.css";
    link.dataset.simpleWorkflow = "true";
    document.head.append(link);
  }

  function makeDialog(id, title, content) {
    let dialog = document.getElementById(id);
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    dialog.className = "dialog simple-dialog";
    dialog.id = id;
    dialog.innerHTML = `<div class="dialog-content simple-dialog-content"><div class="simple-dialog-heading"><div><p class="eyebrow">Almacén familiar</p><h2>${esc(title)}</h2></div><button class="button button-secondary" type="button" data-simple-close>Cerrar</button></div>${content}</div>`;
    dialog.querySelector("[data-simple-close]")?.addEventListener("click", () => dialog.close());
    document.body.append(dialog);
    return dialog;
  }

  function catalogElements() {
    return {
      screen: document.getElementById("catalog-screen"),
      header: document.querySelector("#catalog-screen .catalog-header"),
      originalSearch: document.querySelector("#catalog-screen .catalog-search-bar"),
      originalMessage: document.getElementById("catalog-message"),
      originalLayout: document.querySelector("#catalog-screen .catalog-layout"),
      title: document.getElementById("catalog-view-title"),
      subtitle: document.getElementById("catalog-view-subtitle"),
      homeButton: document.getElementById("catalog-home-button"),
      newButton: document.getElementById("catalog-new-button")
    };
  }

  function installSimpleCatalog() {
    const elements = catalogElements();
    if (!elements.screen || document.getElementById("simple-catalog-workspace")) return;
    elements.originalSearch?.classList.add("simple-hidden-original");
    elements.originalMessage?.classList.add("simple-hidden-original");
    elements.originalLayout?.classList.add("simple-hidden-original");
    elements.newButton?.classList.add("simple-hidden-original");
    elements.title.textContent = "Productos";
    elements.subtitle.textContent = "Busca y actualiza los datos del almacén de forma rápida.";

    const workspace = document.createElement("section");
    workspace.id = "simple-catalog-workspace";
    workspace.className = "simple-catalog-workspace";
    workspace.innerHTML = `
      <div class="simple-toolbar">
        <label class="simple-search-field" for="simple-search-input">
          <span>Buscar producto</span>
          <input class="text-input" id="simple-search-input" type="search" placeholder="Nombre, código, presentación o proveedor">
        </label>
        <button class="button button-primary simple-search-button" id="simple-search-button" type="button">Buscar</button>
      </div>
      <div class="simple-main-actions" aria-label="Acciones principales">
        <button class="simple-main-action" id="simple-new-product" type="button"><strong>＋ Nuevo producto</strong><span>Agrega nombre, código, costo y precio.</span></button>
        <button class="simple-main-action" id="simple-change-price" type="button"><strong>$ Cambiar precio</strong><span>Busca un producto y guarda el nuevo precio.</span></button>
      </div>
      <div class="simple-status" id="simple-table-status" role="status">Cargando productos…</div>
      <div class="simple-table-wrap">
        <table class="simple-product-table">
          <thead><tr><th>Producto</th><th>Código</th><th>Presentación</th><th>Costo</th><th>Precio</th><th>Proveedor</th><th>Acciones</th></tr></thead>
          <tbody id="simple-product-rows"></tbody>
        </table>
      </div>
    `;
    elements.header?.insertAdjacentElement("afterend", workspace);

    document.getElementById("simple-search-button")?.addEventListener("click", () => loadRows(document.getElementById("simple-search-input")?.value || ""));
    document.getElementById("simple-search-input")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") loadRows(event.currentTarget.value || "");
    });
    document.getElementById("simple-new-product")?.addEventListener("click", openNewDialog);
    document.getElementById("simple-change-price")?.addEventListener("click", openPriceDialog);
  }

  function renderRows(rows) {
    const tbody = document.getElementById("simple-product-rows");
    const status = document.getElementById("simple-table-status");
    if (!tbody || !status) return;
    tbody.replaceChildren();
    state.rows = Array.isArray(rows) ? rows : [];
    status.textContent = state.rows.length
      ? `${state.rows.length} registro(s) encontrados.`
      : "No se encontraron productos. Prueba con otro nombre o código.";

    if (!state.rows.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = '<td colspan="7" class="simple-empty-cell">No hay resultados.</td>';
      tbody.append(tr);
      return;
    }

    state.rows.forEach((row) => {
      const tr = document.createElement("tr");
      tr.dataset.rowId = row.rowId;
      tr.innerHTML = `
        <td><strong>${esc(row.name)}</strong>${row.category ? `<span class="simple-cell-note">${esc(row.category)}</span>` : ""}</td>
        <td>${esc(row.code || "—")}</td>
        <td>${esc(row.presentation || "—")}</td>
        <td class="simple-money-cell">${amount(row.cost)}</td>
        <td class="simple-money-cell"><strong>${amount(row.price)}</strong></td>
        <td>${esc(row.supplierName || "—")}</td>
        <td><div class="simple-row-actions"><button class="button button-secondary" type="button" data-simple-edit>Editar</button><button class="button button-secondary" type="button" data-simple-view>Ver</button></div></td>
      `;
      tr.querySelector("[data-simple-edit]")?.addEventListener("click", () => openEditDialog(row));
      tr.querySelector("[data-simple-view]")?.addEventListener("click", () => openDetailDialog(row));
      tbody.append(tr);
    });
  }

  async function loadRows(search = state.currentSearch) {
    if (state.loading) return;
    state.loading = true;
    state.currentSearch = String(search || "");
    const status = document.getElementById("simple-table-status");
    if (status) status.textContent = "Buscando…";
    try {
      const response = await window.almacen.listSimpleProducts({ search: state.currentSearch, limit: 150 });
      if (!response?.ok) throw new Error(response?.message || "No se pudo buscar.");
      renderRows(response.rows || []);
    } catch (error) {
      if (status) status.textContent = error.message || "No se pudo buscar.";
    } finally {
      state.loading = false;
    }
  }

  function formValue(form, name) {
    return form.elements.namedItem(name)?.value ?? "";
  }

  function createProductForm(mode, row = null) {
    const value = (key) => esc(row?.[key] ?? "");
    return `
      <form class="simple-form" data-simple-product-form data-mode="${mode}">
        <div class="simple-form-grid">
          <label class="form-field simple-form-wide"><span>Producto *</span><input class="text-input" name="name" maxlength="180" value="${value("name")}" required></label>
          <label class="form-field"><span>Código / referencia</span><input class="text-input" name="code" maxlength="80" value="${value("code")}"></label>
          <label class="form-field"><span>Presentación</span><input class="text-input" name="presentation" maxlength="160" value="${value("presentationRaw") || value("presentation")}" placeholder="Ej. 50 m, rollo, pieza"></label>
          <label class="form-field"><span>Categoría</span><input class="text-input" name="category" maxlength="120" value="${value("category")}"></label>
          <label class="form-field"><span>Proveedor</span><input class="text-input" name="supplierName" maxlength="180" value="${value("supplierName")}"></label>
          <label class="form-field"><span>Costo</span><input class="text-input" name="cost" type="number" min="0.01" step="0.01" value="${row?.cost ?? ""}"></label>
          <label class="form-field"><span>Precio</span><input class="text-input" name="price" type="number" min="0.01" step="0.01" value="${row?.price ?? ""}"></label>
        </div>
        <div class="form-error hidden" data-simple-form-error></div>
        <div class="dialog-actions"><button class="button button-secondary" type="button" data-simple-cancel>Cancelar</button><button class="button button-primary" type="submit">Guardar</button></div>
      </form>
    `;
  }

  function wireProductForm(dialog, row = null) {
    const form = dialog.querySelector("[data-simple-product-form]");
    const errorBox = dialog.querySelector("[data-simple-form-error]");
    form?.querySelector("[data-simple-cancel]")?.addEventListener("click", () => dialog.close());
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      errorBox?.classList.add("hidden");
      const submit = form.querySelector('button[type="submit"]');
      if (submit) { submit.disabled = true; submit.textContent = "Guardando…"; }
      try {
        const payload = {
          ...(row ? { productId: row.productId, variantId: row.variantId } : {}),
          name: formValue(form, "name"),
          code: formValue(form, "code"),
          presentation: formValue(form, "presentation"),
          category: formValue(form, "category"),
          supplierName: formValue(form, "supplierName"),
          supplierId: row?.supplierId || null,
          cost: formValue(form, "cost"),
          price: formValue(form, "price")
        };
        const response = row
          ? await window.almacen.updateSimpleProduct(payload)
          : await window.almacen.createSimpleProduct(payload);
        if (!response?.ok) throw new Error(response?.message || "No se pudo guardar.");
        dialog.close();
        await loadRows(state.currentSearch);
        toast(row ? "Producto actualizado." : "Producto guardado.");
      } catch (error) {
        if (errorBox) {
          errorBox.textContent = error.message || "No se pudo guardar.";
          errorBox.classList.remove("hidden");
        }
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = "Guardar"; }
      }
    });
  }

  function openNewDialog() {
    const existing = document.getElementById("simple-new-dialog");
    existing?.remove();
    const dialog = makeDialog("simple-new-dialog", "Nuevo producto", createProductForm("new"));
    wireProductForm(dialog);
    dialog.showModal();
    dialog.querySelector('[name="name"]')?.focus();
  }

  function openEditDialog(row) {
    const existing = document.getElementById("simple-edit-dialog");
    existing?.remove();
    const dialog = makeDialog("simple-edit-dialog", "Editar producto", createProductForm("edit", row));
    wireProductForm(dialog, row);
    dialog.showModal();
    dialog.querySelector('[name="name"]')?.focus();
  }

  function openPriceDialog() {
    const existing = document.getElementById("simple-price-dialog");
    existing?.remove();
    const dialog = makeDialog("simple-price-dialog", "Cambiar precio", `
      <form class="simple-form" id="simple-price-form">
        <label class="form-field"><span>Buscar producto</span><input class="text-input" id="simple-price-search" type="search" placeholder="Nombre o código"></label>
        <label class="form-field"><span>Producto *</span><select class="text-input" id="simple-price-product" required></select></label>
        <label class="form-field"><span>Nuevo precio *</span><input class="text-input" id="simple-price-amount" type="number" min="0.01" step="0.01" required></label>
        <div class="form-error hidden" id="simple-price-error"></div>
        <div class="dialog-actions"><button class="button button-secondary" type="button" data-simple-cancel>Cancelar</button><button class="button button-primary" type="submit">Guardar precio</button></div>
      </form>
    `);
    const select = dialog.querySelector("#simple-price-product");
    const search = dialog.querySelector("#simple-price-search");
    const priceInput = dialog.querySelector("#simple-price-amount");
    const errorBox = dialog.querySelector("#simple-price-error");

    const fill = async (term = "") => {
      const response = await window.almacen.listSimpleProducts({ search: term, limit: 80 });
      const rows = response?.ok ? response.rows || [] : [];
      select.replaceChildren(new Option(rows.length ? "Selecciona un producto" : "Sin resultados", ""));
      rows.forEach((row) => {
        const option = new Option(`${row.name}${row.code ? ` · ${row.code}` : ""}${row.presentation ? ` · ${row.presentation}` : ""}`, row.rowId);
        option.dataset.productId = row.productId;
        option.dataset.variantId = row.variantId || "";
        select.append(option);
      });
    };
    let timer = null;
    search?.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => fill(search.value), 220);
    });
    select?.addEventListener("change", () => {
      const row = state.rows.find((item) => item.rowId === select.value);
      if (row?.price) priceInput.value = row.price;
    });
    dialog.querySelector("[data-simple-cancel]")?.addEventListener("click", () => dialog.close());
    dialog.querySelector("#simple-price-form")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const option = select.selectedOptions[0];
      if (!option?.dataset.productId) return;
      const submit = event.currentTarget.querySelector('button[type="submit"]');
      if (submit) { submit.disabled = true; submit.textContent = "Guardando…"; }
      errorBox.classList.add("hidden");
      try {
        const response = await window.almacen.changeSimplePrice({
          productId: option.dataset.productId,
          variantId: option.dataset.variantId || null,
          price: priceInput.value
        });
        if (!response?.ok) throw new Error(response?.message || "No se pudo guardar el precio.");
        dialog.close();
        await loadRows(state.currentSearch);
        toast("Precio actualizado.");
      } catch (error) {
        errorBox.textContent = error.message || "No se pudo guardar el precio.";
        errorBox.classList.remove("hidden");
      } finally {
        if (submit) { submit.disabled = false; submit.textContent = "Guardar precio"; }
      }
    });
    fill(state.currentSearch).catch(() => {});
    dialog.showModal();
    search?.focus();
  }

  function photoUrl(localPath) {
    if (!localPath || String(localPath).startsWith("remote://")) return null;
    const normalized = String(localPath).replace(/\\/g, "/");
    return encodeURI(normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`);
  }

  async function openDetailDialog(row) {
    const existing = document.getElementById("simple-detail-dialog");
    existing?.remove();
    const dialog = makeDialog("simple-detail-dialog", row.name, '<div class="simple-detail-loading">Cargando detalles…</div>');
    dialog.showModal();
    try {
      const response = await window.almacen.getProduct(row.productId);
      if (!response?.ok) throw new Error(response?.message || "No se pudo abrir el producto.");
      const detail = response.detail || {};
      const photos = (detail.photos || []).filter((photo) => photo.status === "active").slice(0, 8);
      const history = (detail.events || []).slice(0, 12);
      const content = dialog.querySelector(".simple-detail-loading");
      if (!content) return;
      content.className = "simple-detail-content";
      content.innerHTML = `
        <div class="simple-detail-summary">
          <div><span>Código</span><strong>${esc(row.code || "—")}</strong></div>
          <div><span>Presentación</span><strong>${esc(row.presentation || "—")}</strong></div>
          <div><span>Costo</span><strong>${amount(row.cost)}</strong></div>
          <div><span>Precio</span><strong>${amount(row.price)}</strong></div>
          <div><span>Proveedor</span><strong>${esc(row.supplierName || "—")}</strong></div>
          <div><span>Actualizado</span><strong>${formatDate(row.updatedAt)}</strong></div>
        </div>
        <section><h3>Fotos</h3><div class="simple-photo-grid">${photos.length ? photos.map((photo) => { const src = photoUrl(photo.localPath); return src ? `<img src="${src}" alt="Foto de ${esc(row.name)}">` : '<div class="simple-photo-placeholder">Foto de otro equipo</div>'; }).join("") : '<p class="simple-muted">Todavía no hay fotografías.</p>'}</div></section>
        <section><h3>Historial</h3><div class="simple-history">${history.length ? history.map((event) => `<div><strong>${esc(String(event.eventType || "Acción").replace(/_/g, " "))}</strong><span>${esc(event.actorUserId || "")} · ${formatDate(event.createdAt)}</span></div>`).join("") : '<p class="simple-muted">No hay movimientos registrados.</p>'}</div></section>
      `;
    } catch (error) {
      const content = dialog.querySelector(".simple-detail-loading");
      if (content) content.textContent = error.message || "No se pudo abrir el producto.";
    }
  }

  function installAdminImport() {
    const adminScreen = document.getElementById("admin-screen");
    const banner = adminScreen?.querySelector(".admin-session-banner");
    if (!adminScreen || !banner || document.getElementById("simple-excel-import")) return;
    const panel = document.createElement("section");
    panel.id = "simple-excel-import";
    panel.className = "simple-import-panel";
    panel.innerHTML = `
      <div class="simple-import-heading">
        <div><p class="admin-card-label">Datos del almacén</p><h2>Importar Excel</h2><p>Selecciona el Excel. La app importará automáticamente lo seguro y solo te pedirá revisar posibles duplicados.</p></div>
        <button class="button button-primary" id="simple-import-button" type="button">Subir Excel</button>
      </div>
      <div class="simple-import-status" id="simple-import-status">Todavía no se ha importado un archivo.</div>
      <div class="simple-import-summary hidden" id="simple-import-summary"></div>
      <div class="simple-duplicates hidden" id="simple-import-duplicates"><div class="simple-duplicates-heading"><h3>Posibles duplicados</h3><p>Elige únicamente los casos dudosos.</p></div><div id="simple-duplicate-list"></div></div>
    `;
    banner.insertAdjacentElement("afterend", panel);
    document.getElementById("simple-import-button")?.addEventListener("click", runExcelImport);
  }

  function renderImport(result) {
    state.importSummary = result?.summary || null;
    state.duplicates = result?.duplicates || [];
    const status = document.getElementById("simple-import-status");
    const summaryBox = document.getElementById("simple-import-summary");
    const duplicatesBox = document.getElementById("simple-import-duplicates");
    const list = document.getElementById("simple-duplicate-list");
    if (!status || !summaryBox || !duplicatesBox || !list) return;

    if (!state.importSummary) {
      status.textContent = "No se realizaron cambios.";
      summaryBox.classList.add("hidden");
      duplicatesBox.classList.add("hidden");
      return;
    }
    const s = state.importSummary;
    status.textContent = `${s.fileName || "Excel"}: importación procesada.`;
    summaryBox.classList.remove("hidden");
    summaryBox.innerHTML = `
      <div><span>Reconocidos</span><strong>${Number(s.totalRecognized || 0)}</strong></div>
      <div><span>Importados</span><strong>${Number(s.imported || 0)}</strong></div>
      <div><span>Nuevos</span><strong>${Number(s.created || 0)}</strong></div>
      <div><span>Por revisar</span><strong>${Number(state.duplicates.length)}</strong></div>
      <div><span>No reconocidos</span><strong>${Number(s.ignored || 0)}</strong></div>
      <div><span>Errores</span><strong>${Number(s.errors || 0)}</strong></div>
    `;

    list.replaceChildren();
    duplicatesBox.classList.toggle("hidden", state.duplicates.length === 0);
    state.duplicates.forEach((item) => {
      const card = document.createElement("article");
      card.className = "simple-duplicate-card";
      card.innerHTML = `
        <div class="simple-duplicate-comparison">
          <div><span>Del Excel</span><strong>${esc(item.source?.name || "—")}</strong><small>${esc([item.source?.code, item.source?.presentation].filter(Boolean).join(" · ") || "Sin código")}</small></div>
          <div><span>Ya existe</span><strong>${esc(item.match?.name || "—")}</strong><small>${esc([item.match?.code, item.match?.presentation].filter(Boolean).join(" · ") || "Sin código")}</small></div>
        </div>
        <div class="simple-duplicate-actions"><button class="button button-primary" type="button" data-same>Es el mismo</button><button class="button button-secondary" type="button" data-new>Crear nuevo</button></div>
      `;
      card.querySelector("[data-same]")?.addEventListener("click", () => resolveDuplicate(item.id, "same", card));
      card.querySelector("[data-new]")?.addEventListener("click", () => resolveDuplicate(item.id, "new", card));
      list.append(card);
    });
  }

  async function runExcelImport() {
    const button = document.getElementById("simple-import-button");
    const status = document.getElementById("simple-import-status");
    if (button) { button.disabled = true; button.textContent = "Leyendo Excel…"; }
    if (status) status.textContent = "Leyendo el archivo e importando los datos seguros…";
    try {
      const response = await window.almacen.importExcel();
      if (!response?.ok) throw new Error(response?.message || "No se pudo importar el Excel.");
      if (response.cancelled) {
        if (status) status.textContent = "Importación cancelada.";
        return;
      }
      renderImport(response);
      await loadRows(state.currentSearch);
      toast("Excel procesado correctamente.");
    } catch (error) {
      if (status) status.textContent = error.message || "No se pudo importar el Excel.";
    } finally {
      if (button) { button.disabled = false; button.textContent = "Subir Excel"; }
    }
  }

  async function resolveDuplicate(id, action, card) {
    card?.classList.add("simple-duplicate-working");
    card?.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      const response = await window.almacen.resolveExcelDuplicate(id, action);
      if (!response?.ok) throw new Error(response?.message || "No se pudo resolver el duplicado.");
      renderImport(response);
      await loadRows(state.currentSearch);
    } catch (error) {
      card?.classList.remove("simple-duplicate-working");
      card?.querySelectorAll("button").forEach((button) => { button.disabled = false; });
      toast(error.message || "No se pudo resolver el duplicado.");
    }
  }

  function openCatalogForOperator() {
    const current = profile();
    if (!current || current.role === "administrator" || state.operatorAutoOpenBusy) return;
    const home = document.getElementById("home-screen");
    if (!home || home.classList.contains("hidden")) return;
    state.operatorAutoOpenBusy = true;
    window.AlmacenCatalog?.open?.("buscar");
    window.setTimeout(() => { state.operatorAutoOpenBusy = false; }, 250);
  }

  function applyRoleView() {
    const current = profile();
    const operator = current && current.role !== "administrator";
    document.getElementById("catalog-home-button")?.classList.toggle("simple-hidden-original", Boolean(operator));
  }

  installStylesheet();
  installSimpleCatalog();
  installAdminImport();
  applyRoleView();

  document.addEventListener("almacen:screen-changed", (event) => {
    const name = event.detail?.name;
    applyRoleView();
    if (name === "catalog") loadRows(state.currentSearch);
    if (name === "home") window.setTimeout(openCatalogForOperator, 0);
  });

  window.setTimeout(() => {
    openCatalogForOperator();
    const catalog = document.getElementById("catalog-screen");
    if (catalog && !catalog.classList.contains("hidden")) loadRows("");
  }, 60);
})();