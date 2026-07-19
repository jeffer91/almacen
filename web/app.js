"use strict";

(() => {
  const FIREBASE = Object.freeze({
    projectId: "almacen-59227",
    collection: "almacen_familiar_devices"
  });
  const STORAGE_KEY = "almacen-familiar-mobile-v1";
  const DEFAULT_TAX_RATE = 15;
  const PROFILES = Object.freeze({
    edgar: { id: "edgar", displayName: "Edgar", channelId: "local-edgar", channelName: "Local de Edgar", role: "operator" },
    gloria: { id: "gloria", displayName: "Gloria", channelId: "local-gloria", channelName: "Local de Gloria", role: "operator" },
    jefferson: { id: "jefferson", displayName: "Jefferson", channelId: "tienda-virtual", channelName: "Tienda virtual", role: "administrator" }
  });

  const emptyData = () => ({
    products: [], product_variants: [], product_photos: [], product_links: [], suppliers: [], product_costs: [], product_prices: []
  });
  const state = loadState();
  const money = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });

  const elements = {
    setup: document.getElementById("setup-screen"), app: document.getElementById("app-screen"),
    profiles: document.getElementById("profile-options"), profileSummary: document.getElementById("profile-summary"),
    sync: document.getElementById("sync-button"), changeProfile: document.getElementById("change-profile-button"),
    status: document.getElementById("status-message"), tabs: document.querySelectorAll(".tab-button"),
    panels: document.querySelectorAll(".tab-panel"), search: document.getElementById("search-input"),
    productList: document.getElementById("product-list"), productForm: document.getElementById("product-form"),
    productError: document.getElementById("product-error"), productPvp: document.getElementById("product-pvp"),
    productTax: document.getElementById("product-tax"), productNet: document.getElementById("product-net"),
    supplierOptions: document.getElementById("supplier-options"), supplierForm: document.getElementById("supplier-form"),
    supplierError: document.getElementById("supplier-error"), supplierList: document.getElementById("supplier-list")
  };

  function loadState() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      return {
        deviceId: stored?.deviceId || crypto.randomUUID(),
        profileId: stored?.profileId || null,
        firebaseApiKey: stored?.firebaseApiKey || "",
        data: { ...emptyData(), ...(stored?.data || {}) },
        updatedAt: stored?.updatedAt || null
      };
    } catch {
      return { deviceId: crypto.randomUUID(), profileId: null, firebaseApiKey: "", data: emptyData(), updatedAt: null };
    }
  }

  function saveState() {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function profile() { return PROFILES[state.profileId] || null; }
  function now() { return new Date().toISOString(); }
  function normalizeName(value) {
    return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
  function netPrice(gross, rate) { return roundMoney(Number(gross) / (1 + Number(rate) / 100)); }
  function showStatus(message, type = "info") { elements.status.textContent = message; elements.status.dataset.state = type; }
  function showError(element, message) { element.textContent = message || ""; element.classList.toggle("hidden", !message); }
  function latestBy(rows, predicate = () => true) {
    return [...rows].filter(predicate).sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0] || null;
  }

  function renderProfiles() {
    elements.profiles.replaceChildren();
    Object.values(PROFILES).forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "profile-card";
      button.innerHTML = `<span class="profile-avatar">${item.displayName[0]}</span><span><strong>${item.displayName}</strong><span>${item.channelName}</span></span>`;
      button.addEventListener("click", () => selectProfile(item.id));
      elements.profiles.append(button);
    });
  }

  function selectProfile(profileId) {
    state.profileId = profileId;
    saveState();
    renderShell();
    showStatus("Perfil guardado. Los cambios se almacenan primero en este celular.", "success");
  }

  function renderShell() {
    const current = profile();
    elements.setup.classList.toggle("hidden", Boolean(current));
    elements.app.classList.toggle("hidden", !current);
    elements.sync.disabled = !current;
    elements.changeProfile.classList.toggle("hidden", !current);
    elements.profileSummary.textContent = current ? `${current.displayName} · ${current.channelName}` : "Selecciona el perfil de este celular.";
    if (current) renderAll();
  }

  function setTab(tab) {
    elements.tabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === tab));
    elements.panels.forEach((panel) => panel.classList.toggle("hidden", panel.id !== `${tab}-tab`));
  }

  function supplierByName(name) {
    const normalized = normalizeName(name);
    return state.data.suppliers.find((supplier) => supplier.normalized_name === normalized) || null;
  }

  function ensureSupplier(name, extra = {}) {
    const cleaned = String(name || "").trim();
    if (!cleaned) throw new Error("El proveedor es obligatorio.");
    const existing = supplierByName(cleaned);
    if (existing) return existing;
    const timestamp = now();
    const current = profile();
    const supplier = {
      id: crypto.randomUUID(), name: cleaned, normalized_name: normalizeName(cleaned),
      contact_name: extra.contactName || null, phone: extra.phone || null, email: extra.email || null,
      notes: null, status: "active", created_by_user_id: current.id, created_device_id: state.deviceId,
      created_at: timestamp, updated_by_user_id: current.id, updated_device_id: state.deviceId, updated_at: timestamp
    };
    state.data.suppliers.push(supplier);
    return supplier;
  }

  function saveProduct(event) {
    event.preventDefault();
    showError(elements.productError, "");
    const name = document.getElementById("product-name").value.trim();
    const supplierName = document.getElementById("product-supplier").value.trim();
    const cost = Number(document.getElementById("product-cost").value);
    const gross = Number(elements.productPvp.value);
    const taxRate = Number(elements.productTax.value);
    if (!name) return showError(elements.productError, "El nombre del producto es obligatorio.");
    if (state.data.products.some((item) => item.status !== "retired" && item.normalized_name === normalizeName(name))) return showError(elements.productError, "Ya existe un producto con ese nombre.");
    if (!supplierName) return showError(elements.productError, "El proveedor es obligatorio.");
    if (!Number.isFinite(cost) || cost <= 0) return showError(elements.productError, "El costo debe ser mayor que cero.");
    if (!Number.isFinite(gross) || gross <= 0) return showError(elements.productError, "El PVP con IVA debe ser mayor que cero.");
    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return showError(elements.productError, "El IVA debe estar entre 0 y 100.");

    const current = profile();
    const timestamp = now();
    const productId = crypto.randomUUID();
    const product = {
      id: productId, canonical_name: name, normalized_name: normalizeName(name),
      brand: document.getElementById("product-brand").value.trim() || null,
      category: document.getElementById("product-category").value.trim() || null,
      description: document.getElementById("product-description").value.trim() || null,
      notes: null, status: "active", version: 1, created_by_user_id: current.id,
      created_device_id: state.deviceId, created_at: timestamp, updated_by_user_id: current.id,
      updated_device_id: state.deviceId, updated_at: timestamp, retired_by_user_id: null,
      retired_device_id: null, retired_at: null, retirement_reason: null,
      restored_by_user_id: null, restored_device_id: null, restored_at: null
    };
    state.data.products.push(product);

    const variantName = document.getElementById("product-variant").value.trim();
    let variantId = null;
    if (variantName) {
      variantId = crypto.randomUUID();
      state.data.product_variants.push({
        id: variantId, product_id: productId, variant_name: variantName, normalized_name: normalizeName(variantName),
        presentation: null, unit_name: null, quantity_value: null, internal_code: null, notes: null,
        status: "active", version: 1, created_by_user_id: current.id, created_device_id: state.deviceId,
        created_at: timestamp, updated_by_user_id: current.id, updated_device_id: state.deviceId, updated_at: timestamp,
        retired_by_user_id: null, retired_device_id: null, retired_at: null, retirement_reason: null,
        restored_by_user_id: null, restored_device_id: null, restored_at: null
      });
    }

    const supplier = ensureSupplier(supplierName);
    state.data.product_costs.push({
      id: crypto.randomUUID(), product_id: productId, variant_id: variantId, supplier_id: supplier.id,
      amount: roundMoney(cost), currency: "USD", notes: null, created_by_user_id: current.id,
      device_id: state.deviceId, created_at: timestamp, sync_status: "pending", synchronized_at: null
    });
    const net = netPrice(gross, taxRate);
    state.data.product_prices.push({
      id: crypto.randomUUID(), product_id: productId, variant_id: variantId, channel_id: current.channelId,
      amount: roundMoney(gross), pvp_with_tax: roundMoney(gross), price_without_tax: net,
      tax_rate: Math.round(taxRate * 100) / 100, currency: "USD", notes: null,
      created_by_user_id: current.id, device_id: state.deviceId, created_at: timestamp,
      sync_status: "pending", synchronized_at: null
    });

    saveState();
    elements.productForm.reset();
    elements.productTax.value = String(DEFAULT_TAX_RATE);
    updateNet();
    renderAll();
    setTab("catalog");
    showStatus("Producto, proveedor, costo y precios guardados en el celular.", "success");
  }

  function saveSupplier(event) {
    event.preventDefault();
    showError(elements.supplierError, "");
    try {
      ensureSupplier(document.getElementById("supplier-name").value, {
        contactName: document.getElementById("supplier-contact").value.trim() || null,
        phone: document.getElementById("supplier-phone").value.trim() || null,
        email: document.getElementById("supplier-email").value.trim() || null
      });
      saveState();
      elements.supplierForm.reset();
      renderSuppliers();
      showStatus("Proveedor guardado.", "success");
    } catch (error) {
      showError(elements.supplierError, error.message);
    }
  }

  function updateNet() {
    const gross = Number(elements.productPvp.value);
    const rate = Number(elements.productTax.value);
    elements.productNet.value = Number.isFinite(gross) && gross > 0 && Number.isFinite(rate) && rate >= 0 ? money.format(netPrice(gross, rate)) : "";
  }

  function renderProducts() {
    const term = normalizeName(elements.search.value);
    const products = state.data.products
      .filter((item) => item.status !== "retired")
      .filter((item) => !term || item.normalized_name.includes(term) || state.data.product_variants.some((variant) => variant.product_id === item.id && variant.normalized_name.includes(term)))
      .sort((a, b) => a.normalized_name.localeCompare(b.normalized_name));
    elements.productList.replaceChildren();
    if (!products.length) return elements.productList.append(document.getElementById("empty-template").content.cloneNode(true));

    products.forEach((product) => {
      const variant = state.data.product_variants.find((item) => item.product_id === product.id && item.status !== "retired");
      const cost = latestBy(state.data.product_costs, (item) => item.product_id === product.id);
      const price = latestBy(state.data.product_prices, (item) => item.product_id === product.id && item.channel_id === profile().channelId)
        || latestBy(state.data.product_prices, (item) => item.product_id === product.id);
      const supplier = state.data.suppliers.find((item) => item.id === cost?.supplier_id);
      const card = document.createElement("article");
      card.className = "product-card";
      card.innerHTML = `
        <h3>${escapeHtml(product.canonical_name)}</h3>
        <p>${escapeHtml([product.brand, product.category, variant?.variant_name].filter(Boolean).join(" · ") || "Sin información adicional")}</p>
        <p>Proveedor: ${escapeHtml(supplier?.name || "Sin proveedor")}</p>
        <div class="price-grid">
          <div class="price-box"><span>Costo</span><strong>${cost ? money.format(cost.amount) : "—"}</strong></div>
          <div class="price-box"><span>PVP con IVA</span><strong>${price ? money.format(price.pvp_with_tax ?? price.amount) : "—"}</strong></div>
          <div class="price-box"><span>Sin IVA</span><strong>${price ? money.format(price.price_without_tax ?? price.amount) : "—"}</strong></div>
        </div>`;
      elements.productList.append(card);
    });
  }

  function renderSuppliers() {
    elements.supplierOptions.replaceChildren();
    elements.supplierList.replaceChildren();
    const suppliers = [...state.data.suppliers].filter((item) => item.status === "active").sort((a, b) => a.normalized_name.localeCompare(b.normalized_name));
    suppliers.forEach((supplier) => {
      const option = document.createElement("option"); option.value = supplier.name; elements.supplierOptions.append(option);
      const card = document.createElement("article"); card.className = "supplier-card";
      card.innerHTML = `<h3>${escapeHtml(supplier.name)}</h3><p>${escapeHtml([supplier.contact_name, supplier.phone, supplier.email].filter(Boolean).join(" · ") || "Sin datos de contacto")}</p>`;
      elements.supplierList.append(card);
    });
    if (!suppliers.length) elements.supplierList.append(document.getElementById("empty-template").content.cloneNode(true));
  }

  function renderAll() { renderProducts(); renderSuppliers(); }
  function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;"); }

  function buildSnapshot() {
    const current = profile();
    return { schemaVersion: 6, appVersion: "web-1.0.0", generatedAt: now(), device: { id: state.deviceId, userId: current.id, channelId: current.channelId, role: current.role }, data: state.data };
  }

  function getFirebaseApiKey() {
    if (window.ALMACEN_FIREBASE_API_KEY) return String(window.ALMACEN_FIREBASE_API_KEY);
    if (state.firebaseApiKey) return state.firebaseApiKey;
    const supplied = window.prompt("Ingresa la API key de Firebase configurada en la aplicación de escritorio:", "");
    if (!supplied) throw new Error("Se necesita configurar Firebase para sincronizar.");
    state.firebaseApiKey = supplied.trim();
    saveState();
    return state.firebaseApiKey;
  }

  function firestoreBase() {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(FIREBASE.projectId)}/databases/(default)/documents/${encodeURIComponent(FIREBASE.collection)}`;
  }

  async function pushSnapshot(apiKey) {
    const payload = buildSnapshot();
    const body = { fields: {
      deviceId: { stringValue: state.deviceId }, profileId: { stringValue: profile().id },
      channelId: { stringValue: profile().channelId }, appVersion: { stringValue: "web-1.0.0" },
      updatedAt: { timestampValue: now() }, payload: { stringValue: JSON.stringify(payload) }
    }};
    const response = await fetch(`${firestoreBase()}/${encodeURIComponent(state.deviceId)}?key=${encodeURIComponent(apiKey)}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    if (!response.ok) throw new Error(`Firebase rechazó el envío (${response.status}).`);
  }

  async function fetchSnapshots(apiKey) {
    const response = await fetch(`${firestoreBase()}?pageSize=100&key=${encodeURIComponent(apiKey)}`);
    if (!response.ok) throw new Error(`Firebase rechazó la descarga (${response.status}).`);
    const body = await response.json();
    return (body.documents || []).map((document) => {
      try { return JSON.parse(document.fields?.payload?.stringValue || "null"); } catch { return null; }
    }).filter((snapshot) => snapshot?.data);
  }

  function mergeLatest(table, rows, dateFields) {
    const local = new Map(state.data[table].map((row) => [row.id, row]));
    rows.forEach((row) => {
      const current = local.get(row.id);
      const date = (item) => Math.max(0, ...dateFields.map((field) => Date.parse(item?.[field] || 0) || 0));
      if (!current || date(row) > date(current)) local.set(row.id, row);
    });
    state.data[table] = Array.from(local.values());
  }

  function mergeAppend(table, rows) {
    const local = new Map(state.data[table].map((row) => [row.id, row]));
    rows.forEach((row) => { if (!local.has(row.id)) local.set(row.id, row); });
    state.data[table] = Array.from(local.values());
  }

  function mergeSnapshot(snapshot) {
    const data = snapshot.data || {};
    mergeLatest("products", data.products || [], ["updated_at", "created_at", "retired_at", "restored_at"]);
    mergeLatest("product_variants", data.product_variants || [], ["updated_at", "created_at", "retired_at", "restored_at"]);
    mergeLatest("suppliers", data.suppliers || [], ["updated_at", "created_at"]);
    mergeAppend("product_costs", data.product_costs || []);
    mergeAppend("product_prices", data.product_prices || []);
    mergeAppend("product_photos", data.product_photos || []);
    mergeAppend("product_links", data.product_links || []);
  }

  async function synchronize() {
    if (!navigator.onLine) return showStatus("No hay internet. Los cambios siguen guardados en el celular.", "error");
    elements.sync.disabled = true;
    elements.sync.textContent = "Sincronizando…";
    showStatus("Enviando y recibiendo cambios…");
    try {
      const apiKey = getFirebaseApiKey();
      await pushSnapshot(apiKey);
      const snapshots = await fetchSnapshots(apiKey);
      snapshots.forEach(mergeSnapshot);
      saveState();
      renderAll();
      showStatus(`Sincronización completa. ${snapshots.length} equipo(s) consultados.`, "success");
    } catch (error) {
      showStatus(error.message || "No se pudo sincronizar.", "error");
    } finally {
      elements.sync.disabled = false;
      elements.sync.textContent = "Sincronizar";
    }
  }

  elements.tabs.forEach((button) => button.addEventListener("click", () => setTab(button.dataset.tab)));
  document.getElementById("search-button").addEventListener("click", renderProducts);
  elements.search.addEventListener("input", renderProducts);
  elements.productForm.addEventListener("submit", saveProduct);
  elements.supplierForm.addEventListener("submit", saveSupplier);
  elements.productPvp.addEventListener("input", updateNet);
  elements.productTax.addEventListener("input", updateNet);
  elements.sync.addEventListener("click", synchronize);
  elements.changeProfile.addEventListener("click", () => { state.profileId = null; saveState(); renderShell(); });
  window.addEventListener("online", () => showStatus("Internet disponible. Puedes sincronizar.", "success"));
  window.addEventListener("offline", () => showStatus("Sin internet. Puedes seguir trabajando localmente.", "error"));

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("./service-worker.js").catch(() => {});
  renderProfiles();
  renderShell();
  updateNet();
})();
