/* =========================================================
Nombre completo: catalog-enhancements.js
Ruta o ubicación: /app/renderer/catalog-enhancements.js
Función:
- Integrar proveedor, costo y PVP con IVA al registro de productos.
- Calcular automáticamente el precio sin IVA.
- Simplificar los estados a Activo y Retirado.
- Mejorar la presentación de precios en el detalle del catálogo.
========================================================= */

"use strict";

(() => {
  if (window.__almacenCommercialEnhancements) return;
  window.__almacenCommercialEnhancements = true;

  const DEFAULT_TAX_RATE = 15;
  const moneyFormatter = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });
  const productDialog = document.getElementById("product-form-dialog");
  const productForm = document.getElementById("product-form");
  const productGrid = productForm?.querySelector(".catalog-form-grid");
  const productSave = document.getElementById("product-form-save");
  const productError = document.getElementById("product-form-error");
  const supplierDialog = document.getElementById("supplier-form-dialog");
  const supplierForm = document.getElementById("supplier-form");
  const supplierNameInput = document.getElementById("supplier-name");
  const priceForm = document.getElementById("price-form");
  const priceDialog = document.getElementById("price-form-dialog");
  const priceAmount = document.getElementById("price-amount");
  const priceSave = document.getElementById("price-form-save");
  const priceError = document.getElementById("price-form-error");
  const catalogDetail = document.getElementById("catalog-detail");

  if (!productForm || !productGrid || !window.almacen) return;

  let supplierToSelect = "";
  let productDialogWasOpen = false;

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function calculateWithoutTax(grossValue, taxValue) {
    const gross = Number(grossValue);
    const tax = Number(taxValue);
    if (!Number.isFinite(gross) || gross <= 0 || !Number.isFinite(tax) || tax < 0) return "";
    return roundMoney(gross / (1 + tax / 100));
  }

  function setError(element, message) {
    if (!element) return;
    element.textContent = message || "";
    element.classList.toggle("hidden", !message);
  }

  function field(label, inputHtml, className = "") {
    const wrapper = document.createElement("label");
    wrapper.className = `form-field ${className}`.trim();
    wrapper.innerHTML = `<span>${label}</span>${inputHtml}`;
    return wrapper;
  }

  function installProductFields() {
    if (document.getElementById("product-supplier")) return;
    const descriptionField = document.getElementById("product-description")?.closest("label");

    const supplierField = document.createElement("div");
    supplierField.className = "form-field catalog-supplier-field catalog-form-wide";
    supplierField.innerHTML = `
      <span>Proveedor *</span>
      <div class="catalog-field-with-action">
        <select class="text-input" id="product-supplier" required>
          <option value="">Selecciona un proveedor</option>
        </select>
        <button class="button button-secondary" id="product-add-supplier" type="button">Agregar proveedor</button>
      </div>
    `;

    const costField = field(
      "Costo USD *",
      '<input class="text-input" id="product-cost" type="number" min="0.01" step="0.01" inputmode="decimal" required>'
    );
    const pvpField = field(
      "PVP con IVA USD *",
      '<input class="text-input" id="product-pvp-tax" type="number" min="0.01" step="0.01" inputmode="decimal" required>'
    );
    const taxField = field(
      "IVA % *",
      `<input class="text-input" id="product-tax-rate" type="number" min="0" max="100" step="0.01" inputmode="decimal" value="${DEFAULT_TAX_RATE}" required>`
    );
    const netField = field(
      "Precio sin IVA",
      '<input class="text-input calculated-price" id="product-price-without-tax" type="text" readonly aria-readonly="true" placeholder="Se calcula automáticamente">'
    );

    for (const element of [supplierField, costField, pvpField, taxField, netField]) {
      productGrid.insertBefore(element, descriptionField || null);
    }

    document.getElementById("product-add-supplier")?.addEventListener("click", () => {
      productDialogWasOpen = Boolean(productDialog?.open);
      supplierForm?.reset();
      supplierDialog?.showModal();
      supplierNameInput?.focus();
    });

    document.getElementById("product-pvp-tax")?.addEventListener("input", updateProductNet);
    document.getElementById("product-tax-rate")?.addEventListener("input", updateProductNet);
  }

  async function loadProductSuppliers(selectedId = "") {
    const select = document.getElementById("product-supplier");
    if (!select) return;
    try {
      const response = await window.almacen.listSuppliers({ includeInactive: false, limit: 200 });
      if (!response?.ok) throw new Error(response?.message || "No se pudieron cargar los proveedores.");
      const suppliers = response.suppliers || [];
      select.replaceChildren(new Option("Selecciona un proveedor", ""));
      suppliers.forEach((supplier) => select.append(new Option(supplier.name, supplier.id)));
      if (selectedId && suppliers.some((supplier) => supplier.id === selectedId)) select.value = selectedId;
      if (supplierToSelect) {
        const match = suppliers.find((supplier) => supplier.name.trim().toLowerCase() === supplierToSelect.trim().toLowerCase());
        if (match) select.value = match.id;
        supplierToSelect = "";
      }
    } catch (error) {
      setError(productError, error.message || "No se pudieron cargar los proveedores.");
    }
  }

  function updateProductNet() {
    const gross = document.getElementById("product-pvp-tax")?.value;
    const tax = document.getElementById("product-tax-rate")?.value;
    const output = document.getElementById("product-price-without-tax");
    if (!output) return;
    const value = calculateWithoutTax(gross, tax);
    output.value = value === "" ? "" : moneyFormatter.format(value);
  }

  function selectedProductId() {
    return document.querySelector('.catalog-result-card[aria-current="true"]')?.dataset.productId || null;
  }

  async function saveCompleteProduct(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    if (productForm.dataset.commercialBusy === "true") return;

    const supplierId = document.getElementById("product-supplier")?.value || "";
    const cost = Number(document.getElementById("product-cost")?.value);
    const pvpWithTax = Number(document.getElementById("product-pvp-tax")?.value);
    const taxRate = Number(document.getElementById("product-tax-rate")?.value);
    const withoutTax = calculateWithoutTax(pvpWithTax, taxRate);

    if (!supplierId) return setError(productError, "Selecciona o agrega un proveedor.");
    if (!Number.isFinite(cost) || cost <= 0) return setError(productError, "El costo debe ser mayor que cero.");
    if (!Number.isFinite(pvpWithTax) || pvpWithTax <= 0) return setError(productError, "El PVP con IVA debe ser mayor que cero.");
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return setError(productError, "El IVA debe estar entre 0 y 100.");
    if (withoutTax === "") return setError(productError, "No se pudo calcular el precio sin IVA.");

    setError(productError, "");
    productForm.dataset.commercialBusy = "true";
    if (productSave) {
      productSave.disabled = true;
      productSave.textContent = "Guardando…";
    }

    let createdProduct = null;
    try {
      const initialVariantName = document.getElementById("product-variant-name")?.value.trim() || "";
      const productResponse = await window.almacen.createProduct({
        canonicalName: document.getElementById("product-name")?.value,
        brand: document.getElementById("product-brand")?.value,
        category: document.getElementById("product-category")?.value,
        description: document.getElementById("product-description")?.value,
        initialVariant: initialVariantName ? {
          variantName: initialVariantName,
          presentation: document.getElementById("product-presentation")?.value,
          unitName: document.getElementById("product-unit")?.value,
          quantityValue: document.getElementById("product-quantity")?.value || null
        } : null
      });
      if (!productResponse?.ok) throw new Error(productResponse?.message || "No se pudo crear el producto.");

      createdProduct = productResponse.created;
      const productId = createdProduct.product.id;
      const variantId = createdProduct.initialVariant?.id || null;

      const costResponse = await window.almacen.saveCost({ productId, variantId, supplierId, amount: cost });
      if (!costResponse?.ok) throw new Error(costResponse?.message || "El producto se creó, pero no se pudo guardar el costo.");

      const profile = window.AlmacenShell?.getProfile?.();
      const priceResponse = await window.almacen.savePrice({
        productId,
        variantId,
        channelId: profile?.channelId,
        pvpWithTax,
        taxRate,
        notes: `Precio sin IVA calculado: ${withoutTax.toFixed(2)}`
      });
      if (!priceResponse?.ok) throw new Error(priceResponse?.message || "El producto se creó, pero no se pudo guardar el precio.");

      productDialog?.close();
      const searchInput = document.getElementById("catalog-search-input");
      if (searchInput) searchInput.value = createdProduct.product.canonicalName;
      document.getElementById("catalog-search-button")?.click();
      window.AlmacenShell?.showToast?.("Producto, proveedor, costo y precios guardados.");
    } catch (error) {
      const prefix = createdProduct ? "El producto fue creado. " : "";
      setError(productError, `${prefix}${error.message || "No se pudo completar el registro."}`);
    } finally {
      productForm.dataset.commercialBusy = "false";
      if (productSave) {
        productSave.disabled = false;
        productSave.textContent = "Guardar producto";
      }
    }
  }

  function installPriceFields() {
    if (!priceForm || document.getElementById("price-tax-rate")) return;
    const amountLabel = priceAmount?.closest("label")?.querySelector("span");
    if (amountLabel) amountLabel.textContent = "PVP con IVA USD *";

    const notesField = document.getElementById("price-notes")?.closest("label");
    const taxField = field(
      "IVA % *",
      `<input class="text-input" id="price-tax-rate" type="number" min="0" max="100" step="0.01" value="${DEFAULT_TAX_RATE}" required>`
    );
    const netField = field(
      "Precio sin IVA",
      '<input class="text-input calculated-price" id="price-without-tax" type="text" readonly aria-readonly="true">'
    );
    priceForm.insertBefore(taxField, notesField || priceForm.querySelector(".form-error"));
    priceForm.insertBefore(netField, notesField || priceForm.querySelector(".form-error"));

    priceAmount?.addEventListener("input", updatePriceNet);
    document.getElementById("price-tax-rate")?.addEventListener("input", updatePriceNet);
    priceDialog?.addEventListener("close", () => {
      const taxInput = document.getElementById("price-tax-rate");
      if (taxInput) taxInput.value = String(DEFAULT_TAX_RATE);
      updatePriceNet();
    });
  }

  function updatePriceNet() {
    const output = document.getElementById("price-without-tax");
    if (!output) return;
    const value = calculateWithoutTax(priceAmount?.value, document.getElementById("price-tax-rate")?.value);
    output.value = value === "" ? "" : moneyFormatter.format(value);
  }

  async function savePriceWithTax(event) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const productId = selectedProductId();
    if (!productId) return setError(priceError, "Selecciona un producto.");

    const pvpWithTax = Number(priceAmount?.value);
    const taxRate = Number(document.getElementById("price-tax-rate")?.value);
    const withoutTax = calculateWithoutTax(pvpWithTax, taxRate);
    if (!Number.isFinite(pvpWithTax) || pvpWithTax <= 0) return setError(priceError, "El PVP con IVA debe ser mayor que cero.");
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return setError(priceError, "El IVA debe estar entre 0 y 100.");

    if (priceSave) {
      priceSave.disabled = true;
      priceSave.textContent = "Guardando…";
    }
    setError(priceError, "");
    try {
      const response = await window.almacen.savePrice({
        productId,
        variantId: document.getElementById("price-variant")?.value || null,
        channelId: document.getElementById("price-channel")?.value,
        pvpWithTax,
        taxRate,
        notes: document.getElementById("price-notes")?.value || `Precio sin IVA calculado: ${withoutTax.toFixed(2)}`
      });
      if (!response?.ok) throw new Error(response?.message || "No se pudo guardar el precio.");
      priceDialog?.close();
      document.querySelector('.catalog-result-card[aria-current="true"]')?.click();
    } catch (error) {
      setError(priceError, error.message || "No se pudo guardar el precio.");
    } finally {
      if (priceSave) {
        priceSave.disabled = false;
        priceSave.textContent = "Guardar precio";
      }
    }
  }

  function removeInactiveControls(root = document) {
    root.querySelectorAll('[data-product-status="inactive"], [data-variant-status="inactive"]').forEach((button) => button.remove());
  }

  async function decoratePrices() {
    const productId = selectedProductId();
    if (!productId || !catalogDetail) return;
    const priceHeading = Array.from(catalogDetail.querySelectorAll("h4")).find((heading) => heading.textContent.includes("Últimos precios"));
    const cards = priceHeading?.nextElementSibling?.querySelectorAll(".catalog-info-card");
    if (!cards?.length || Array.from(cards).every((card) => card.dataset.taxDecorated === "true")) return;

    try {
      const response = await window.almacen.getProduct(productId);
      if (!response?.ok) return;
      const prices = response.detail?.commerce?.latestPrices || [];
      Array.from(cards).forEach((card, index) => {
        const price = prices[index];
        if (!price || card.dataset.taxDecorated === "true") return;
        const line = document.createElement("p");
        line.className = "catalog-muted catalog-tax-detail";
        line.textContent = `Sin IVA: ${moneyFormatter.format(price.priceWithoutTax)} · IVA ${price.taxRate}%`;
        card.append(line);
        card.dataset.taxDecorated = "true";
      });
    } catch {
      // La información principal ya fue mostrada; esta mejora no debe bloquear el catálogo.
    }
  }

  installProductFields();
  installPriceFields();
  productForm.addEventListener("submit", saveCompleteProduct, true);
  priceForm?.addEventListener("submit", savePriceWithTax, true);

  supplierForm?.addEventListener("submit", () => {
    supplierToSelect = supplierNameInput?.value || "";
  }, true);
  supplierDialog?.addEventListener("close", async () => {
    if (productDialogWasOpen && productDialog?.open) await loadProductSuppliers();
    productDialogWasOpen = false;
  });

  const productDialogObserver = new MutationObserver(() => {
    if (!productDialog?.open) return;
    setError(productError, "");
    const taxInput = document.getElementById("product-tax-rate");
    if (taxInput && !taxInput.value) taxInput.value = String(DEFAULT_TAX_RATE);
    updateProductNet();
    loadProductSuppliers(document.getElementById("product-supplier")?.value || "");
  });
  productDialogObserver.observe(productDialog, { attributes: true, attributeFilter: ["open"] });

  const detailObserver = new MutationObserver(() => {
    removeInactiveControls(catalogDetail || document);
    window.clearTimeout(decoratePrices.timer);
    decoratePrices.timer = window.setTimeout(decoratePrices, 80);
  });
  if (catalogDetail) detailObserver.observe(catalogDetail, { childList: true, subtree: true });

  removeInactiveControls();
})();
