/* =========================================================
Nombre completo: catalog.js
Ruta o ubicación: /app/renderer/catalog.js
Función o funciones:
- Buscar, crear y consultar productos.
- Gestionar variaciones, fotografías, proveedores, costos y precios.
- Mostrar productos recientes e historial.
- Retirar y restaurar registros sin borrado físico.
Con qué se conecta:
- app/preload/preload.js
- app/renderer/app.js
- app/renderer/index.html
========================================================= */

"use strict";

(function initializeCatalog(window, document) {
  const state = {
    products: [],
    currentDetail: null,
    references: { channels: [], suppliers: [] },
    quickUpdate: false,
    loading: false
  };

  const elements = {
    screen: document.getElementById("catalog-screen"),
    title: document.getElementById("catalog-view-title"),
    subtitle: document.getElementById("catalog-view-subtitle"),
    homeButton: document.getElementById("catalog-home-button"),
    newButton: document.getElementById("catalog-new-button"),
    searchInput: document.getElementById("catalog-search-input"),
    searchButton: document.getElementById("catalog-search-button"),
    recentButton: document.getElementById("catalog-recent-button"),
    message: document.getElementById("catalog-message"),
    results: document.getElementById("catalog-results"),
    resultsCount: document.getElementById("catalog-results-count"),
    detail: document.getElementById("catalog-detail"),

    productDialog: document.getElementById("product-form-dialog"),
    productForm: document.getElementById("product-form"),
    productName: document.getElementById("product-name"),
    productBrand: document.getElementById("product-brand"),
    productCategory: document.getElementById("product-category"),
    productVariantName: document.getElementById("product-variant-name"),
    productPresentation: document.getElementById("product-presentation"),
    productUnit: document.getElementById("product-unit"),
    productQuantity: document.getElementById("product-quantity"),
    productDescription: document.getElementById("product-description"),
    productError: document.getElementById("product-form-error"),
    productCancel: document.getElementById("product-form-cancel"),
    productSave: document.getElementById("product-form-save"),

    variantDialog: document.getElementById("variant-form-dialog"),
    variantForm: document.getElementById("variant-form"),
    variantName: document.getElementById("variant-name"),
    variantPresentation: document.getElementById("variant-presentation"),
    variantUnit: document.getElementById("variant-unit"),
    variantQuantity: document.getElementById("variant-quantity"),
    variantError: document.getElementById("variant-form-error"),
    variantCancel: document.getElementById("variant-form-cancel"),
    variantSave: document.getElementById("variant-form-save"),

    supplierDialog: document.getElementById("supplier-form-dialog"),
    supplierForm: document.getElementById("supplier-form"),
    supplierName: document.getElementById("supplier-name"),
    supplierContact: document.getElementById("supplier-contact"),
    supplierPhone: document.getElementById("supplier-phone"),
    supplierEmail: document.getElementById("supplier-email"),
    supplierError: document.getElementById("supplier-form-error"),
    supplierCancel: document.getElementById("supplier-form-cancel"),
    supplierSave: document.getElementById("supplier-form-save"),

    costDialog: document.getElementById("cost-form-dialog"),
    costForm: document.getElementById("cost-form"),
    costVariant: document.getElementById("cost-variant"),
    costSupplier: document.getElementById("cost-supplier"),
    costAmount: document.getElementById("cost-amount"),
    costNotes: document.getElementById("cost-notes"),
    costError: document.getElementById("cost-form-error"),
    costCancel: document.getElementById("cost-form-cancel"),
    costSave: document.getElementById("cost-form-save"),

    priceDialog: document.getElementById("price-form-dialog"),
    priceForm: document.getElementById("price-form"),
    priceVariant: document.getElementById("price-variant"),
    priceChannel: document.getElementById("price-channel"),
    priceAmount: document.getElementById("price-amount"),
    priceNotes: document.getElementById("price-notes"),
    priceError: document.getElementById("price-form-error"),
    priceCancel: document.getElementById("price-form-cancel"),
    priceSave: document.getElementById("price-form-save")
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function showMessage(message, status = "info") {
    elements.message.textContent = message || "";
    elements.message.dataset.status = status;
    elements.message.classList.toggle("hidden", !message);
  }

  function setFormError(element, message) {
    element.textContent = message || "";
    element.classList.toggle("hidden", !message);
  }

  function setBusy(button, busy, busyText, normalText) {
    button.disabled = busy;
    button.textContent = busy ? busyText : normalText;
  }

  function formatDate(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "—";
    return new Intl.DateTimeFormat("es-EC", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function money(value) {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return "—";
    return new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" }).format(amount);
  }

  function statusLabel(status) {
    return { active: "Activo", retired: "Retirado", hidden: "Oculta" }[status] || status || "—";
  }

  function isAdministrator() {
    return window.AlmacenShell?.getProfile?.()?.role === "administrator";
  }

  function eventLabel(eventType) {
    const labels = {
      product_created: "Producto creado",
      variant_created: "Variación creada",
      photo_added: "Fotografía agregada",
      product_retired: "Producto retirado",
      product_restored: "Producto restaurado",
      product_status_changed: "Estado del producto cambiado",
      variant_retired: "Variación retirada",
      variant_restored: "Variación restaurada",
      variant_status_changed: "Estado de la variación cambiado",
      photo_retired: "Fotografía retirada",
      photo_hidden: "Fotografía oculta",
      photo_restored: "Fotografía restaurada",
      product_link_created: "Productos relacionados"
    };
    return labels[eventType] || String(eventType || "Acción").replace(/_/g, " ");
  }

  function fileUrl(localPath) {
    if (!localPath || localPath.startsWith("remote://")) return null;
    const normalized = localPath.replace(/\\/g, "/");
    return encodeURI(normalized.startsWith("/") ? `file://${normalized}` : `file:///${normalized}`);
  }

  async function loadReferences() {
    const response = await window.almacen.getCatalogReferences();
    if (!response.ok) throw new Error(response.message || "No se pudieron cargar las opciones.");
    state.references = {
      channels: response.channels || [],
      suppliers: response.suppliers || []
    };
    return state.references;
  }

  function renderResults(products, { emptyMessage = "No se encontraron productos." } = {}) {
    state.products = Array.isArray(products) ? products : [];
    elements.results.replaceChildren();
    elements.resultsCount.textContent = String(state.products.length);

    if (state.products.length === 0) {
      const empty = document.createElement("div");
      empty.className = "catalog-empty";
      empty.innerHTML = `<div><strong>${esc(emptyMessage)}</strong><p>Prueba con otro nombre o agrega un producto nuevo.</p></div>`;
      elements.results.append(empty);
      return;
    }

    state.products.forEach((product) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "catalog-result-card";
      button.dataset.productId = product.id;
      button.setAttribute("aria-current", state.currentDetail?.product?.id === product.id ? "true" : "false");
      button.innerHTML = `
        <strong>${esc(product.canonicalName)}</strong>
        <span class="catalog-result-meta">${esc([product.brand, product.category].filter(Boolean).join(" · ") || "Sin marca ni categoría")}</span>
        <span class="catalog-result-meta">${Number(product.variantCount || 0)} variaciones · ${statusLabel(product.status)}</span>
      `;
      button.addEventListener("click", () => openProduct(product.id));
      elements.results.append(button);
    });
  }

  async function searchProducts() {
    if (state.loading) return;
    state.loading = true;
    elements.searchButton.disabled = true;
    showMessage("Buscando productos…");
    try {
      const response = await window.almacen.listProducts({ search: elements.searchInput.value, limit: 100 });
      if (!response.ok) throw new Error(response.message || "No se pudo buscar.");
      renderResults(response.products || []);
      showMessage(response.products?.length ? `${response.products.length} producto(s) encontrados.` : "No se encontraron productos.", response.products?.length ? "success" : "info");
    } catch (error) {
      showMessage(error.message || "No se pudo buscar.", "error");
    } finally {
      state.loading = false;
      elements.searchButton.disabled = false;
    }
  }

  async function loadRecent() {
    state.quickUpdate = false;
    elements.title.textContent = "Productos recientes";
    elements.subtitle.textContent = "Últimos productos consultados o modificados en esta computadora.";
    showMessage("Cargando productos recientes…");
    try {
      const response = await window.almacen.listRecentProducts(30);
      if (!response.ok) throw new Error(response.message || "No se pudieron cargar los recientes.");
      renderResults(response.products || [], { emptyMessage: "Todavía no hay productos recientes." });
      showMessage(response.products?.length ? "Productos recientes cargados." : "Todavía no hay productos recientes.", response.products?.length ? "success" : "info");
    } catch (error) {
      showMessage(error.message || "No se pudieron cargar los recientes.", "error");
    }
  }

  function variantOptions(variants, includeProduct = true) {
    const active = (variants || []).filter((item) => item.status !== "retired");
    return `${includeProduct ? '<option value="">Producto general</option>' : ""}${active.map((variant) => `<option value="${esc(variant.id)}">${esc(variant.variantName)}</option>`).join("")}`;
  }

  function renderCommerce(detail) {
    const commerce = detail.commerce || { latestCosts: [], latestPrices: [], costs: [], prices: [] };
    const latestCosts = commerce.latestCosts || [];
    const latestPrices = commerce.latestPrices || [];

    const costCards = latestCosts.length
      ? latestCosts.map((item) => {
          const variant = detail.variants.find((entry) => entry.id === item.variantId);
          return `<div class="catalog-info-card"><strong>${esc(variant?.variantName || "Producto general")}</strong><p>${money(item.amount)}</p><p class="catalog-muted">${esc(item.supplierName || "Sin proveedor")} · ${formatDate(item.createdAt)}</p></div>`;
        }).join("")
      : '<p class="catalog-muted">Todavía no hay costos registrados.</p>';

    const priceCards = latestPrices.length
      ? latestPrices.map((item) => {
          const variant = detail.variants.find((entry) => entry.id === item.variantId);
          return `<div class="catalog-info-card"><strong>${esc(variant?.variantName || "Producto general")}</strong><p>${money(item.amount)}</p><p class="catalog-muted">${esc(item.channelName || item.channelId)} · ${formatDate(item.createdAt)}</p></div>`;
        }).join("")
      : '<p class="catalog-muted">Todavía no hay precios registrados.</p>';

    return `
      <section class="catalog-section" id="catalog-commerce-section">
        <div class="catalog-section-heading">
          <h3>Costos y precios</h3>
          <div class="catalog-inline-actions">
            <button class="button button-secondary" type="button" data-detail-action="supplier">Nuevo proveedor</button>
            <button class="button button-secondary" type="button" data-detail-action="cost">Registrar costo</button>
            <button class="button button-primary" type="button" data-detail-action="price">Registrar precio</button>
          </div>
        </div>
        <h4>Últimos costos</h4><div class="catalog-card-grid">${costCards}</div>
        <h4>Últimos precios por local</h4><div class="catalog-card-grid">${priceCards}</div>
      </section>
    `;
  }

  function renderPhotos(detail) {
    const photos = detail.photos || [];
    const content = photos.length
      ? photos.map((photo) => {
          const url = fileUrl(photo.localPath);
          const visual = url
            ? `<img src="${url}" alt="Fotografía de ${esc(detail.product.canonicalName)}">`
            : '<div class="catalog-photo-placeholder">Foto registrada en otro equipo</div>';
          const action = photo.status === "retired"
            ? isAdministrator()
              ? `<button class="button button-secondary" type="button" data-photo-status="active" data-photo-id="${esc(photo.id)}">Restaurar foto</button>`
              : '<span class="catalog-muted">Solo Jefferson puede restaurarla.</span>'
            : `<button class="button button-secondary" type="button" data-photo-status="retired" data-photo-id="${esc(photo.id)}">Retirar foto</button>`;
          return `<article class="catalog-photo-card">${visual}<p><strong>${esc(photo.fileName)}</strong></p><p class="catalog-muted">${statusLabel(photo.status)} · ${esc(photo.channelId)}</p>${action}</article>`;
        }).join("")
      : '<p class="catalog-muted">Todavía no hay fotografías.</p>';

    return `
      <section class="catalog-section">
        <div class="catalog-section-heading"><h3>Fotografías</h3><button class="button button-secondary" type="button" data-detail-action="photo">Agregar fotografía</button></div>
        <div class="catalog-photo-grid">${content}</div>
      </section>
    `;
  }

  function renderVariants(detail) {
    const variants = detail.variants || [];
    const cards = variants.length
      ? variants.map((variant) => `
          <article class="catalog-info-card">
            <strong>${esc(variant.variantName)}</strong>
            <p>${esc([variant.presentation, variant.quantityValue, variant.unitName].filter((value) => value !== null && value !== "").join(" ") || "Sin presentación adicional")}</p>
            <p class="catalog-muted">${statusLabel(variant.status)}</p>
            <div class="catalog-inline-actions">
              ${variant.status !== "retired"
                ? `<button class="button button-secondary" type="button" data-variant-status="retired" data-variant-id="${esc(variant.id)}">Retirar</button>`
                : isAdministrator()
                  ? `<button class="button button-secondary" type="button" data-variant-status="active" data-variant-id="${esc(variant.id)}">Restaurar</button>`
                  : '<span class="catalog-muted">Solo Jefferson puede restaurarla.</span>'}
            </div>
          </article>
        `).join("")
      : '<p class="catalog-muted">Este producto todavía no tiene variaciones.</p>';

    return `
      <section class="catalog-section">
        <div class="catalog-section-heading"><h3>Variaciones</h3><button class="button button-secondary" type="button" data-detail-action="variant">Agregar variación</button></div>
        <div class="catalog-card-grid">${cards}</div>
      </section>
    `;
  }

  function renderHistory(detail) {
    const events = (detail.events || []).slice(0, 20);
    return `
      <section class="catalog-section">
        <h3>Historial</h3>
        <div class="catalog-history">
          ${events.length ? events.map((event) => `<div class="catalog-history-item"><strong>${esc(eventLabel(event.eventType))}</strong><p class="catalog-muted">${esc(event.actorUserId)} · ${formatDate(event.createdAt)}${event.reason ? ` · ${esc(event.reason)}` : ""}</p></div>`).join("") : '<p class="catalog-muted">No hay movimientos registrados.</p>'}
        </div>
      </section>
    `;
  }

  function renderDetail(detail) {
    state.currentDetail = detail;
    const product = detail.product;
    const statusActions = product.status === "retired"
      ? isAdministrator()
        ? '<button class="button button-primary" type="button" data-product-status="active">Restaurar</button>'
        : '<span class="catalog-muted">Solo Jefferson puede restaurar este producto.</span>'
      : '<button class="button button-secondary" type="button" data-product-status="retired">Retirar</button>';

    elements.detail.innerHTML = `
      <div class="catalog-detail-heading">
        <div>
          <span class="catalog-status" data-status="${esc(product.status)}">${statusLabel(product.status)}</span>
          <h2>${esc(product.canonicalName)}</h2>
          <p>${esc([product.brand, product.category].filter(Boolean).join(" · ") || "Sin marca ni categoría")}</p>
          ${product.description ? `<p>${esc(product.description)}</p>` : ""}
        </div>
        <div class="catalog-action-row">${statusActions}</div>
      </div>
      ${state.quickUpdate ? '<div class="catalog-message" data-status="success">Selecciona Registrar costo o Registrar precio.</div>' : ""}
      ${renderVariants(detail)}
      ${renderCommerce(detail)}
      ${renderPhotos(detail)}
      ${renderHistory(detail)}
    `;

    elements.results.querySelectorAll(".catalog-result-card").forEach((button) => {
      button.setAttribute("aria-current", button.dataset.productId === product.id ? "true" : "false");
    });

    elements.detail.querySelectorAll("[data-detail-action]").forEach((button) => {
      button.addEventListener("click", () => openDetailAction(button.dataset.detailAction));
    });
    elements.detail.querySelectorAll("[data-product-status]").forEach((button) => {
      button.addEventListener("click", () => changeProductStatus(button.dataset.productStatus));
    });
    elements.detail.querySelectorAll("[data-variant-status]").forEach((button) => {
      button.addEventListener("click", () => changeVariantStatus(button.dataset.variantId, button.dataset.variantStatus));
    });
    elements.detail.querySelectorAll("[data-photo-status]").forEach((button) => {
      button.addEventListener("click", () => changePhotoStatus(button.dataset.photoId, button.dataset.photoStatus));
    });

    if (state.quickUpdate) document.getElementById("catalog-commerce-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function openProduct(productId) {
    showMessage("Abriendo producto…");
    try {
      const response = await window.almacen.getProduct(productId);
      if (!response.ok) throw new Error(response.message || "No se pudo abrir el producto.");
      renderDetail(response.detail);
      showMessage("Producto cargado.", "success");
    } catch (error) {
      showMessage(error.message || "No se pudo abrir el producto.", "error");
    }
  }

  async function refreshCurrent() {
    const id = state.currentDetail?.product?.id;
    if (id) await openProduct(id);
    await searchProducts();
  }

  function openProductForm() {
    elements.productForm.reset();
    setFormError(elements.productError, "");
    elements.productDialog.showModal();
    elements.productName.focus();
  }

  async function saveProduct(event) {
    event.preventDefault();
    setFormError(elements.productError, "");
    setBusy(elements.productSave, true, "Guardando…", "Guardar producto");
    const initialVariantName = elements.productVariantName.value.trim();
    const input = {
      canonicalName: elements.productName.value,
      brand: elements.productBrand.value,
      category: elements.productCategory.value,
      description: elements.productDescription.value,
      initialVariant: initialVariantName ? {
        variantName: initialVariantName,
        presentation: elements.productPresentation.value,
        unitName: elements.productUnit.value,
        quantityValue: elements.productQuantity.value || null
      } : null
    };
    try {
      const response = await window.almacen.createProduct(input);
      if (!response.ok) throw new Error(response.message || "No se pudo guardar el producto.");
      elements.productDialog.close();
      elements.searchInput.value = response.created.product.canonicalName;
      await searchProducts();
      renderDetail(response.detail);
      showMessage("Producto guardado correctamente.", "success");
    } catch (error) {
      setFormError(elements.productError, error.message || "No se pudo guardar el producto.");
    } finally {
      setBusy(elements.productSave, false, "Guardando…", "Guardar producto");
    }
  }

  function openVariantForm() {
    elements.variantForm.reset();
    setFormError(elements.variantError, "");
    elements.variantDialog.showModal();
    elements.variantName.focus();
  }

  async function saveVariant(event) {
    event.preventDefault();
    if (!state.currentDetail) return;
    setFormError(elements.variantError, "");
    setBusy(elements.variantSave, true, "Guardando…", "Guardar variación");
    try {
      const response = await window.almacen.addVariant(state.currentDetail.product.id, {
        variantName: elements.variantName.value,
        presentation: elements.variantPresentation.value,
        unitName: elements.variantUnit.value,
        quantityValue: elements.variantQuantity.value || null
      });
      if (!response.ok) throw new Error(response.message || "No se pudo guardar la variación.");
      elements.variantDialog.close();
      renderDetail(response.detail);
      showMessage("Variación guardada.", "success");
    } catch (error) {
      setFormError(elements.variantError, error.message || "No se pudo guardar la variación.");
    } finally {
      setBusy(elements.variantSave, false, "Guardando…", "Guardar variación");
    }
  }

  function openSupplierForm() {
    elements.supplierForm.reset();
    setFormError(elements.supplierError, "");
    elements.supplierDialog.showModal();
    elements.supplierName.focus();
  }

  async function saveSupplier(event) {
    event.preventDefault();
    setFormError(elements.supplierError, "");
    setBusy(elements.supplierSave, true, "Guardando…", "Guardar proveedor");
    try {
      const response = await window.almacen.saveSupplier({
        name: elements.supplierName.value,
        contactName: elements.supplierContact.value,
        phone: elements.supplierPhone.value,
        email: elements.supplierEmail.value
      });
      if (!response.ok) throw new Error(response.message || "No se pudo guardar el proveedor.");
      state.references.suppliers = response.suppliers || [];
      elements.supplierDialog.close();
      showMessage("Proveedor guardado.", "success");
    } catch (error) {
      setFormError(elements.supplierError, error.message || "No se pudo guardar el proveedor.");
    } finally {
      setBusy(elements.supplierSave, false, "Guardando…", "Guardar proveedor");
    }
  }

  async function openCostForm() {
    if (!state.currentDetail) return;
    await loadReferences();
    elements.costForm.reset();
    elements.costVariant.innerHTML = variantOptions(state.currentDetail.variants);
    elements.costSupplier.innerHTML = `<option value="">Sin proveedor</option>${state.references.suppliers.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("")}`;
    setFormError(elements.costError, "");
    elements.costDialog.showModal();
    elements.costAmount.focus();
  }

  async function saveCost(event) {
    event.preventDefault();
    if (!state.currentDetail) return;
    setFormError(elements.costError, "");
    setBusy(elements.costSave, true, "Guardando…", "Guardar costo");
    try {
      const response = await window.almacen.saveCost({
        productId: state.currentDetail.product.id,
        variantId: elements.costVariant.value || null,
        supplierId: elements.costSupplier.value || null,
        amount: elements.costAmount.value,
        notes: elements.costNotes.value
      });
      if (!response.ok) throw new Error(response.message || "No se pudo guardar el costo.");
      elements.costDialog.close();
      state.currentDetail.commerce = response.commerce;
      renderDetail(state.currentDetail);
      showMessage("Costo guardado.", "success");
    } catch (error) {
      setFormError(elements.costError, error.message || "No se pudo guardar el costo.");
    } finally {
      setBusy(elements.costSave, false, "Guardando…", "Guardar costo");
    }
  }

  async function openPriceForm() {
    if (!state.currentDetail) return;
    await loadReferences();
    elements.priceForm.reset();
    elements.priceVariant.innerHTML = variantOptions(state.currentDetail.variants);
    elements.priceChannel.innerHTML = state.references.channels.map((item) => `<option value="${esc(item.id)}">${esc(item.name)}</option>`).join("");
    const profile = window.AlmacenShell?.getProfile?.();
    if (profile?.channelId) elements.priceChannel.value = profile.channelId;
    setFormError(elements.priceError, "");
    elements.priceDialog.showModal();
    elements.priceAmount.focus();
  }

  async function savePrice(event) {
    event.preventDefault();
    if (!state.currentDetail) return;
    setFormError(elements.priceError, "");
    setBusy(elements.priceSave, true, "Guardando…", "Guardar precio");
    try {
      const response = await window.almacen.savePrice({
        productId: state.currentDetail.product.id,
        variantId: elements.priceVariant.value || null,
        channelId: elements.priceChannel.value,
        amount: elements.priceAmount.value,
        notes: elements.priceNotes.value
      });
      if (!response.ok) throw new Error(response.message || "No se pudo guardar el precio.");
      elements.priceDialog.close();
      state.currentDetail.commerce = response.commerce;
      renderDetail(state.currentDetail);
      showMessage("Precio guardado.", "success");
    } catch (error) {
      setFormError(elements.priceError, error.message || "No se pudo guardar el precio.");
    } finally {
      setBusy(elements.priceSave, false, "Guardando…", "Guardar precio");
    }
  }

  async function addPhoto() {
    if (!state.currentDetail) return;
    showMessage("Selecciona una fotografía…");
    const firstActive = state.currentDetail.variants.find((item) => item.status === "active");
    try {
      const response = await window.almacen.addProductPhoto(state.currentDetail.product.id, {
        variantId: firstActive?.id || null,
        isDefaultChannel: !(state.currentDetail.photos || []).some((item) => item.status === "active" && item.channelId === window.AlmacenShell?.getProfile?.()?.channelId)
      });
      if (!response.ok) {
        if (response.code === "PHOTO_CANCELLED") return showMessage("No se seleccionó una fotografía.");
        throw new Error(response.message || "No se pudo agregar la fotografía.");
      }
      renderDetail(response.detail);
      showMessage("Fotografía guardada.", "success");
    } catch (error) {
      showMessage(error.message || "No se pudo agregar la fotografía.", "error");
    }
  }

  async function changeProductStatus(status) {
    if (!state.currentDetail) return;
    const reason = status === "retired" ? window.prompt("Motivo del retiro:", "Producto retirado") : null;
    if (status === "retired" && reason === null) return;
    try {
      const response = await window.almacen.setProductStatus(state.currentDetail.product.id, status, reason);
      if (!response.ok) throw new Error(response.message || "No se pudo cambiar el estado.");
      await refreshCurrent();
      showMessage(`Estado cambiado a ${statusLabel(status)}.`, "success");
    } catch (error) {
      showMessage(error.message || "No se pudo cambiar el estado.", "error");
    }
  }

  async function changeVariantStatus(variantId, status) {
    const reason = status === "retired" ? window.prompt("Motivo del retiro:", "Variación retirada") : null;
    if (status === "retired" && reason === null) return;
    try {
      const response = await window.almacen.setVariantStatus(variantId, status, reason);
      if (!response.ok) throw new Error(response.message || "No se pudo cambiar la variación.");
      await openProduct(state.currentDetail.product.id);
    } catch (error) {
      showMessage(error.message || "No se pudo cambiar la variación.", "error");
    }
  }

  async function changePhotoStatus(photoId, status) {
    if (status === "retired" && !window.confirm("¿Retirar esta fotografía?")) return;
    try {
      const response = await window.almacen.setPhotoStatus(photoId, status);
      if (!response.ok) throw new Error(response.message || "No se pudo cambiar la fotografía.");
      await openProduct(state.currentDetail.product.id);
    } catch (error) {
      showMessage(error.message || "No se pudo cambiar la fotografía.", "error");
    }
  }

  function openDetailAction(action) {
    if (action === "variant") openVariantForm();
    else if (action === "supplier") openSupplierForm();
    else if (action === "cost") openCostForm();
    else if (action === "price") openPriceForm();
    else if (action === "photo") addPhoto();
  }

  async function open(action = "buscar") {
    window.AlmacenShell?.showCatalog?.();
    state.quickUpdate = action === "actualizar";
    elements.title.textContent = action === "recientes" ? "Productos recientes" : action === "actualizar" ? "Cambiar costo o precio" : action === "agregar" ? "Agregar producto" : "Buscar producto";
    elements.subtitle.textContent = action === "actualizar" ? "Busca un producto y registra el nuevo costo o precio." : "Consulta productos, variaciones, fotografías, costos y precios.";
    if (action === "agregar") openProductForm();
    else if (action === "recientes") await loadRecent();
    else {
      elements.searchInput.focus();
      await searchProducts();
    }
  }

  function bindEvents() {
    elements.homeButton.addEventListener("click", () => window.AlmacenShell?.showHome?.());
    elements.newButton.addEventListener("click", openProductForm);
    elements.searchButton.addEventListener("click", searchProducts);
    elements.recentButton.addEventListener("click", loadRecent);
    elements.searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") searchProducts();
    });

    elements.productForm.addEventListener("submit", saveProduct);
    elements.productCancel.addEventListener("click", () => elements.productDialog.close());
    elements.variantForm.addEventListener("submit", saveVariant);
    elements.variantCancel.addEventListener("click", () => elements.variantDialog.close());
    elements.supplierForm.addEventListener("submit", saveSupplier);
    elements.supplierCancel.addEventListener("click", () => elements.supplierDialog.close());
    elements.costForm.addEventListener("submit", saveCost);
    elements.costCancel.addEventListener("click", () => elements.costDialog.close());
    elements.priceForm.addEventListener("submit", savePrice);
    elements.priceCancel.addEventListener("click", () => elements.priceDialog.close());
  }

  window.AlmacenCatalog = Object.freeze({ open, searchProducts, openProduct });
  bindEvents();
})(window, document);
