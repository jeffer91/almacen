/* =========================================================
Nombre completo: diagnostics.js
Ruta o ubicación: /app/renderer/diagnostics.js
Función o funciones:
- Comprobar pantallas y controles obligatorios.
- Verificar que catálogo, comercio y sincronización estén expuestos.
- Ejecutar y mostrar el diagnóstico general.
Con qué se conecta:
- app/preload/preload.js
- app/main/diagnostics/diagnostics-service.js
========================================================= */

"use strict";

(function initializeDiagnostics(window, document) {
  const SCREEN_DEFINITIONS = Object.freeze([
    {
      screenKey: "setup-screen",
      label: "Configuración inicial",
      requiredIds: ["setup-screen", "profile-list", "confirmation-dialog", "confirm-profile"]
    },
    {
      screenKey: "home-screen",
      label: "Pantalla principal",
      requiredIds: ["home-screen", "welcome-title", "local-db-title", "admin-button"],
      requiredActions: ["buscar", "agregar", "actualizar", "recientes"]
    },
    {
      screenKey: "catalog-screen",
      label: "Catálogo comercial",
      requiredIds: [
        "catalog-screen",
        "catalog-search-input",
        "catalog-search-button",
        "catalog-results",
        "catalog-detail",
        "product-form-dialog",
        "variant-form-dialog",
        "cost-form-dialog",
        "price-form-dialog"
      ]
    },
    {
      screenKey: "admin-access",
      label: "Acceso administrativo",
      requiredIds: ["admin-dialog", "admin-form", "admin-password", "admin-submit-button"]
    },
    {
      screenKey: "admin-screen",
      label: "Centro de control",
      requiredIds: [
        "admin-screen",
        "admin-database-card",
        "admin-device-configure-button",
        "diagnostics-panel",
        "backups-panel",
        "sync-card",
        "sync-run-button"
      ]
    },
    {
      screenKey: "preferences-screen",
      label: "Configuración visual",
      requiredIds: ["view-button", "device-preferences-dialog", "device-preferences-form", "device-friendly-name"]
    }
  ]);

  const API_METHODS = Object.freeze([
    "getAppInfo",
    "getProfile",
    "getDatabaseSummary",
    "getDevicePreferences",
    "getAdminStatus",
    "listProducts",
    "getProduct",
    "createProduct",
    "addVariant",
    "addProductPhoto",
    "saveSupplier",
    "saveCost",
    "savePrice",
    "listRecentProducts",
    "getSyncStatus",
    "runSync"
  ]);

  const state = { reporting: false, loading: false };
  const elements = {
    adminScreen: document.getElementById("admin-screen"),
    panel: document.getElementById("diagnostics-panel"),
    overallStatus: document.getElementById("diagnostics-overall-status"),
    overallBadge: document.getElementById("diagnostics-overall-badge"),
    description: document.getElementById("diagnostics-description"),
    passedCount: document.getElementById("diagnostics-passed-count"),
    warningCount: document.getElementById("diagnostics-warning-count"),
    failedCount: document.getElementById("diagnostics-failed-count"),
    duration: document.getElementById("diagnostics-duration"),
    lastRun: document.getElementById("diagnostics-last-run"),
    checkList: document.getElementById("diagnostics-check-list"),
    historyList: document.getElementById("diagnostics-history-list"),
    runButton: document.getElementById("diagnostics-run-button"),
    toast: document.getElementById("toast")
  };

  function showToast(message, duration = 4200) {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.classList.remove("hidden");
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => elements.toast.classList.add("hidden"), duration);
  }

  function formatDateTime(value) {
    if (!value) return "Todavía no ejecutado";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Fecha no disponible";
    return new Intl.DateTimeFormat("es-EC", { dateStyle: "short", timeStyle: "short" }).format(date);
  }

  function statusClass(status) {
    if (["healthy", "passed"].includes(status)) return "healthy";
    if (status === "warning") return "warning";
    if (["error", "failed"].includes(status)) return "error";
    return "neutral";
  }

  function statusLabel(status) {
    return {
      healthy: "Correcto",
      warning: "Con advertencias",
      error: "Con errores",
      passed: "Correcto",
      failed: "Error"
    }[status] || "Pendiente";
  }

  function testScreen(definition) {
    const missingIds = definition.requiredIds.filter((id) => !document.getElementById(id));
    const missingActions = (definition.requiredActions || []).filter(
      (action) => !document.querySelector(`[data-action="${action}"]`)
    );
    const missing = [...missingIds, ...missingActions.map((action) => `data-action:${action}`)];
    return {
      screenKey: definition.screenKey,
      label: definition.label,
      status: missing.length ? "failed" : "passed",
      message: missing.length
        ? `Faltan ${missing.length} controles: ${missing.join(", ")}.`
        : "La pantalla y sus controles obligatorios están disponibles.",
      details: { missingElements: missing.length, missingIds: missing.join(", ") }
    };
  }

  function createRendererReports() {
    const reports = SCREEN_DEFINITIONS.map(testScreen);
    const missingMethods = API_METHODS.filter((method) => typeof window.almacen?.[method] !== "function");
    reports.push({
      screenKey: "secure-bridge",
      label: "Comunicación segura",
      status: missingMethods.length ? "failed" : "passed",
      message: missingMethods.length
        ? `Faltan ${missingMethods.length} funciones: ${missingMethods.join(", ")}.`
        : "Perfiles, catálogo, comercio y sincronización están conectados.",
      details: { expectedMethods: API_METHODS.length, missingMethods: missingMethods.join(", ") }
    });
    reports.push({
      screenKey: "catalog-runtime",
      label: "Módulo visible del catálogo",
      status: typeof window.AlmacenCatalog?.open === "function" ? "passed" : "failed",
      message: typeof window.AlmacenCatalog?.open === "function"
        ? "Los botones principales pueden abrir funciones reales."
        : "El controlador visible del catálogo no está disponible.",
      details: {}
    });
    return reports;
  }

  async function reportScreens() {
    if (state.reporting || typeof window.almacen?.reportScreenDiagnostics !== "function") return null;
    state.reporting = true;
    try {
      return await window.almacen.reportScreenDiagnostics(createRendererReports());
    } catch (error) {
      console.error("No fue posible reportar las pantallas:", error);
      return null;
    } finally {
      state.reporting = false;
    }
  }

  function renderEmpty() {
    elements.overallStatus.textContent = "Sin diagnóstico";
    elements.overallBadge.textContent = "Pendiente";
    elements.overallBadge.className = "admin-state-badge admin-state-neutral";
    elements.description.textContent = "Ejecuta la prueba general para revisar la aplicación, la base y las pantallas.";
    elements.passedCount.textContent = "0";
    elements.warningCount.textContent = "0";
    elements.failedCount.textContent = "0";
    elements.duration.textContent = "—";
    elements.lastRun.textContent = "Todavía no ejecutado";
    elements.checkList.replaceChildren();
    elements.historyList.replaceChildren();
  }

  function checkItem(check) {
    const item = document.createElement("li");
    item.className = `diagnostics-check diagnostics-check-${statusClass(check.status)}`;
    item.innerHTML = `<div class="diagnostics-check-header"><strong></strong><span class="diagnostics-mini-badge diagnostics-mini-${statusClass(check.status)}"></span></div><p></p>`;
    item.querySelector("strong").textContent = check.label;
    item.querySelector("span").textContent = statusLabel(check.status);
    item.querySelector("p").textContent = check.message;
    return item;
  }

  function renderHistory(recent) {
    elements.historyList.replaceChildren();
    if (!Array.isArray(recent) || !recent.length) {
      const empty = document.createElement("li");
      empty.textContent = "No existen diagnósticos anteriores.";
      elements.historyList.append(empty);
      return;
    }
    recent.slice(0, 5).forEach((run) => {
      const item = document.createElement("li");
      item.className = "diagnostics-history-item";
      item.innerHTML = "<strong></strong><span></span>";
      item.querySelector("strong").textContent = statusLabel(run.overallStatus);
      item.querySelector("span").textContent = `${formatDateTime(run.completedAt)} · ${run.passedCount} correctas, ${run.failedCount} errores`;
      elements.historyList.append(item);
    });
  }

  function renderSummary(summary) {
    const latest = summary?.latest;
    if (!latest) {
      renderEmpty();
      renderHistory(summary?.recent || []);
      return;
    }
    const visualClass = statusClass(latest.overallStatus);
    elements.overallStatus.textContent = statusLabel(latest.overallStatus);
    elements.overallBadge.textContent = statusLabel(latest.overallStatus);
    elements.overallBadge.className = `admin-state-badge admin-state-${visualClass}`;
    elements.panel.dataset.status = visualClass;
    elements.description.textContent = latest.overallStatus === "healthy"
      ? "Las funciones comprobadas trabajan correctamente."
      : latest.overallStatus === "warning"
        ? "La aplicación funciona, pero existen puntos que deben revisarse."
        : "Se encontraron errores que requieren atención.";
    elements.passedCount.textContent = String(latest.passedCount);
    elements.warningCount.textContent = String(latest.warningCount);
    elements.failedCount.textContent = String(latest.failedCount);
    elements.duration.textContent = `${latest.durationMs} ms`;
    elements.lastRun.textContent = formatDateTime(latest.completedAt);
    elements.checkList.replaceChildren();
    (latest.checks || []).forEach((check) => elements.checkList.append(checkItem(check)));
    renderHistory(summary.recent || []);
  }

  async function loadSummary({ quiet = true } = {}) {
    if (state.loading || typeof window.almacen?.getDiagnosticsSummary !== "function") return;
    state.loading = true;
    try {
      const response = await window.almacen.getDiagnosticsSummary();
      if (!response.ok) {
        if (!quiet && response.code !== "ADMIN_SESSION_REQUIRED") showToast(response.message || "No se pudo leer el diagnóstico.");
        return;
      }
      renderSummary(response.diagnostics);
    } catch (error) {
      if (!quiet) showToast("No se pudo cargar el diagnóstico general.");
    } finally {
      state.loading = false;
    }
  }

  async function runDiagnostics() {
    elements.runButton.disabled = true;
    elements.runButton.textContent = "Probando…";
    try {
      await reportScreens();
      const response = await window.almacen.runFullDiagnostics();
      if (!response.ok) return showToast(response.message || "No se pudo ejecutar el diagnóstico.", 5000);
      renderSummary(response.diagnostics);
      showToast(response.result.overallStatus === "healthy" ? "Diagnóstico completado: todo funciona correctamente." : "Diagnóstico completado con puntos por revisar.", 5000);
    } catch (error) {
      showToast("Ocurrió un error al ejecutar el diagnóstico.", 5000);
    } finally {
      elements.runButton.disabled = false;
      elements.runButton.textContent = "Ejecutar diagnóstico general";
    }
  }

  function observeAdministration() {
    if (!elements.adminScreen) return;
    const observer = new MutationObserver(() => {
      if (!elements.adminScreen.classList.contains("hidden")) {
        reportScreens();
        loadSummary({ quiet: true });
      }
    });
    observer.observe(elements.adminScreen, { attributes: true, attributeFilter: ["class"] });
  }

  renderEmpty();
  elements.runButton?.addEventListener("click", runDiagnostics);
  observeAdministration();
  window.setTimeout(reportScreens, 500);
  window.addEventListener("focus", reportScreens);
})(window, document);
