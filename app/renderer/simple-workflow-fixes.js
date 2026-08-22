/* Ajustes de seguridad y usabilidad sobre simple-workflow.js. */
"use strict";

(() => {
  if (window.__almacenSimpleWorkflowFixes) return;
  window.__almacenSimpleWorkflowFixes = true;

  const money = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });
  let pendingDuplicates = [];
  let importSummary = null;

  const esc = (value) => String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  const amount = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? money.format(number) : "—";
  };

  const formatDate = (value) => {
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime())
      ? new Intl.DateTimeFormat("es-EC", { dateStyle: "short", timeStyle: "short" }).format(date)
      : "—";
  };

  function toast(message) {
    window.AlmacenShell?.showToast?.(message);
  }

  function updateImportButton() {
    const button = document.getElementById("simple-import-button");
    if (!button) return;
    button.disabled = pendingDuplicates.length > 0;
    button.textContent = pendingDuplicates.length ? "Resuelve duplicados" : "Subir Excel";
  }

  function renderImport(result) {
    importSummary = result?.summary || null;
    pendingDuplicates = result?.duplicates || [];
    const status = document.getElementById("simple-import-status");
    const summary = document.getElementById("simple-import-summary");
    const duplicateBox = document.getElementById("simple-import-duplicates");
    const list = document.getElementById("simple-duplicate-list");
    if (!status || !summary || !duplicateBox || !list) return;

    if (!importSummary) {
      status.textContent = "No se realizaron cambios.";
      summary.classList.add("hidden");
      duplicateBox.classList.add("hidden");
      updateImportButton();
      return;
    }

    const s = importSummary;
    status.textContent = `${s.fileName || "Excel"}: importación procesada.${s.backupFileName ? ` Respaldo previo: ${s.backupFileName}.` : ""}`;
    summary.classList.remove("hidden");
    summary.innerHTML = `
      <div><span>Reconocidos</span><strong>${Number(s.totalRecognized || 0)}</strong></div>
      <div><span>Importados</span><strong>${Number(s.imported || 0)}</strong></div>
      <div><span>Nuevos</span><strong>${Number(s.created || 0)}</strong></div>
      <div><span>Actualizados</span><strong>${Number(s.updated || 0)}</strong></div>
      <div><span>Por revisar</span><strong>${pendingDuplicates.length}</strong></div>
      <div><span>No reconocidos</span><strong>${Number(s.ignored || 0)}</strong></div>
      <div><span>Errores</span><strong>${Number(s.errors || 0)}</strong></div>`;

    list.replaceChildren();
    duplicateBox.classList.toggle("hidden", pendingDuplicates.length === 0);
    pendingDuplicates.forEach((item) => {
      const card = document.createElement("article");
      card.className = "simple-duplicate-card";
      card.dataset.duplicateId = item.id;
      card.innerHTML = `
        <div class="simple-duplicate-comparison">
          <div><span>Del Excel</span><strong>${esc(item.source?.name || "—")}</strong><small>${esc([item.source?.code, item.source?.presentation].filter(Boolean).join(" · ") || "Sin código")}</small></div>
          <div><span>Ya existe</span><strong>${esc(item.match?.name || "—")}</strong><small>${esc([item.match?.code, item.match?.presentation].filter(Boolean).join(" · ") || "Sin código")}</small></div>
        </div>
        <div class="simple-duplicate-actions">
          <button class="button button-primary" type="button" data-fix-duplicate-action="same">Es el mismo</button>
          <button class="button button-secondary" type="button" data-fix-duplicate-action="new">Crear nuevo</button>
        </div>`;
      list.append(card);
    });
    updateImportButton();
  }

  async function runImport() {
    if (pendingDuplicates.length) return;
    const button = document.getElementById("simple-import-button");
    const status = document.getElementById("simple-import-status");
    if (button) { button.disabled = true; button.textContent = "Creando respaldo y leyendo…"; }
    if (status) status.textContent = "Creando respaldo y procesando el archivo…";
    try {
      const response = await window.almacen.importExcel();
      if (!response?.ok) throw new Error(response?.message || "No se pudo importar el Excel.");
      if (response.cancelled) {
        if (status) status.textContent = "Importación cancelada.";
        return;
      }
      renderImport(response);
      toast("Excel procesado correctamente.");
    } catch (error) {
      if (status) status.textContent = error.message || "No se pudo importar el Excel.";
    } finally {
      if (button && !pendingDuplicates.length) { button.disabled = false; button.textContent = "Subir Excel"; }
    }
  }

  async function resolveDuplicate(card, action) {
    const id = card?.dataset.duplicateId;
    if (!id) return;
    card.classList.add("simple-duplicate-working");
    card.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      const response = await window.almacen.resolveExcelDuplicate(id, action);
      if (!response?.ok) throw new Error(response?.message || "No se pudo resolver el duplicado.");
      renderImport(response);
      toast(action === "same" ? "Producto actualizado." : "Producto nuevo creado.");
    } catch (error) {
      card.classList.remove("simple-duplicate-working");
      card.querySelectorAll("button").forEach((button) => { button.disabled = false; });
      toast(error.message || "No se pudo resolver el duplicado.");
    }
  }

  async function fillCurrentPrice(select) {
    const option = select?.selectedOptions?.[0];
    if (!option?.dataset.productId) return;
    const search = document.getElementById("simple-price-search")?.value || option.textContent || "";
    const response = await window.almacen.listSimpleProducts({ search, limit: 80 });
    if (!response?.ok) return;
    const row = (response.rows || []).find((item) => item.productId === option.dataset.productId && (item.variantId || "") === (option.dataset.variantId || ""));
    const input = document.getElementById("simple-price-amount");
    if (row && input) input.value = row.price ?? "";
  }

  function commercialHistory(detail) {
    const commerce = detail?.commerce || {};
    const costs = (commerce.costs || []).map((item) => ({ type: "Costo", value: item.amount, date: item.createdAt, user: item.userName, note: item.supplierName ? `Proveedor: ${item.supplierName}` : "" }));
    const prices = (commerce.prices || []).map((item) => ({ type: "Precio", value: item.pvpWithTax ?? item.amount, date: item.createdAt, user: item.userName, note: item.channelName ? `Local: ${item.channelName}` : "" }));
    return [...costs, ...prices].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 30);
  }

  async function waitForHistorySection(dialog) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      if (!dialog?.open) return null;
      const section = Array.from(dialog.querySelectorAll("section")).find((item) => /Historial/i.test(item.querySelector("h3")?.textContent || ""));
      if (section) return section;
      await new Promise((resolve) => window.setTimeout(resolve, 50));
    }
    return null;
  }

  async function patchDetail(productId) {
    try {
      const response = await window.almacen.getProduct(productId);
      if (!response?.ok) return;
      const dialog = document.getElementById("simple-detail-dialog");
      const section = await waitForHistorySection(dialog);
      if (!section) return;
      const history = commercialHistory(response.detail);
      section.innerHTML = `<h3>Historial de costos y precios</h3><div class="simple-history">${history.length ? history.map((item) => `<div><strong>${esc(item.type)} · ${amount(item.value)}</strong><span>${formatDate(item.date)}${item.user ? ` · ${esc(item.user)}` : ""}${item.note ? ` · ${esc(item.note)}` : ""}</span></div>`).join("") : '<p class="simple-muted">Todavía no hay cambios de costo o precio registrados.</p>'}</div>`;
    } catch {}
  }

  document.addEventListener("click", (event) => {
    const importButton = event.target.closest?.("#simple-import-button");
    if (importButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      runImport();
      return;
    }

    const duplicateAction = event.target.closest?.("[data-fix-duplicate-action]");
    if (duplicateAction) {
      event.preventDefault();
      event.stopImmediatePropagation();
      resolveDuplicate(duplicateAction.closest(".simple-duplicate-card"), duplicateAction.dataset.fixDuplicateAction);
      return;
    }

    const view = event.target.closest?.("[data-simple-view]");
    if (view) {
      const rowId = view.closest("tr")?.dataset.rowId || "";
      const productId = rowId.split(":")[0];
      if (productId) window.setTimeout(() => patchDetail(productId), 20);
    }
  }, true);

  document.addEventListener("change", (event) => {
    if (event.target?.id === "simple-price-product") fillCurrentPrice(event.target).catch(() => {});
  });
})();
