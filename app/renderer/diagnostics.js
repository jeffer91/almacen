/* =========================================================
Nombre completo: diagnostics.js
Ruta o ubicación: /app/renderer/diagnostics.js
Función o funciones:
- Comprobar que las pantallas y controles obligatorios existan.
- Enviar el reporte de la interfaz al proceso principal.
- Mostrar el último diagnóstico en Administración.
- Ejecutar una prueba general bajo solicitud de Jefferson.
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
      requiredIds: [
        "home-screen",
        "welcome-title",
        "local-db-title",
        "local-db-message",
        "admin-button"
      ],
      minimumActions: 4
    },
    {
      screenKey: "admin-access",
      label: "Acceso administrativo",
      requiredIds: [
        "admin-dialog",
        "admin-form",
        "admin-password",
        "admin-submit-button"
      ]
    },
    {
      screenKey: "admin-screen",
      label: "Centro de control",
      requiredIds: [
        "admin-screen",
        "admin-database-card",
        "admin-device-configure-button",
        "diagnostics-panel",
        "diagnostics-run-button"
      ]
    },
    {
      screenKey: "preferences-screen",
      label: "Configuración visual",
      requiredIds: [
        "view-button",
        "device-preferences-dialog",
        "device-preferences-form",
        "device-friendly-name"
      ]
    }
  ]);

  const state = {
    reporting: false,
    loading: false
  };

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

  function showToast(message, duration = 3600) {
    if (!elements.toast) {
      return;
    }

    elements.toast.textContent = message;
    elements.toast.classList.remove("hidden");
    window.clearTimeout(showToast.timeoutId);
    showToast.timeoutId = window.setTimeout(() => {
      elements.toast.classList.add("hidden");
    }, duration);
  }

  function formatDateTime(value) {
    if (!value) {
      return "Todavía no ejecutado";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Fecha no disponible";
    }

    return new Intl.DateTimeFormat("es-EC", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(date);
  }

  function statusLabel(status) {
    const labels = {
      healthy: "Correcto",
      warning: "Con advertencias",
      error: "Con errores",
      passed: "Correcto",
      failed: "Error"
    };

    return labels[status] || "Pendiente";
  }

  function statusClass(status) {
    if (status === "healthy" || status === "passed") {
      return "healthy";
    }

    if (status === "warning") {
      return "warning";
    }

    if (status === "error" || status === "failed") {
      return "error";
    }

    return "neutral";
  }

  function testScreen(definition) {
    const missingIds = definition.requiredIds.filter((id) => !document.getElementById(id));
    const actionCount = definition.minimumActions
      ? document.querySelectorAll("[data-action]").length
      : null;

    if (definition.minimumActions && actionCount < definition.minimumActions) {
      return {
        screenKey: definition.screenKey,
        label: definition.label,
        status: "failed",
        message: `Faltan botones principales: se encontraron ${actionCount} de ${definition.minimumActions}.`,
        details: {
          missingElements: missingIds.length,
          actionCount
        }
      };
    }

    if (missingIds.length > 0) {
      return {
        screenKey: definition.screenKey,
        label: definition.label,
        status: "failed",
        message: `Faltan ${missingIds.length} elementos obligatorios.`,
        details: {
          missingElements: missingIds.length,
          missingIds: missingIds.join(", ")
        }
      };
    }

    return {
      screenKey: definition.screenKey,
      label: definition.label,
      status: "passed",
      message: "La pantalla y sus controles obligatorios están disponibles.",
      details: {
        requiredElements: definition.requiredIds.length,
        actionCount
      }
    };
  }

  function createRendererReports() {
    const reports = SCREEN_DEFINITIONS.map(testScreen);
    const apiMethods = [
      "getAppInfo",
      "getProfile",
      "getDatabaseSummary",
      "getDevicePreferences",
      "getAdminStatus"
    ];
    const missingMethods = apiMethods.filter(
      (method) => typeof window.almacen?.[method] !== "function"
    );

    reports.push({
      screenKey: "secure-bridge",
      label: "Comunicación segura",
      status: missingMethods.length === 0 ? "passed" : "failed",
      message: missingMethods.length === 0
        ? "La interfaz puede comunicarse con las funciones autorizadas."
        : `Faltan ${missingMethods.length} funciones de comunicación.`,
      details: {
        expectedMethods: apiMethods.length,
        missingMethods: missingMethods.join(", ")
      }
    });

    return reports;
  }

  async function reportScreens() {
    if (state.reporting || typeof window.almacen?.reportScreenDiagnostics !== "function") {
      return null;
    }

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
    elements.description.textContent =
      "Ejecuta la prueba general para revisar la aplicación, la base y las pantallas.";
    elements.passedCount.textContent = "0";
    elements.warningCount.textContent = "0";
    elements.failedCount.textContent = "0";
    elements.duration.textContent = "—";
    elements.lastRun.textContent = "Todavía no ejecutado";
    elements.checkList.replaceChildren();
    elements.historyList.replaceChildren();
  }

  function createCheckItem(check) {
    const item = document.createElement("li");
    item.className = `diagnostics-check diagnostics-check-${statusClass(check.status)}`;

    const header = document.createElement("div");
    header.className = "diagnostics-check-header";

    const title = document.createElement("strong");
    title.textContent = check.label;

    const badge = document.createElement("span");
    badge.className = `diagnostics-mini-badge diagnostics-mini-${statusClass(check.status)}`;
    badge.textContent = statusLabel(check.status);

    const message = document.createElement("p");
    message.textContent = check.message;

    header.append(title, badge);
    item.append(header, message);
    return item;
  }

  function renderHistory(recent) {
    elements.historyList.replaceChildren();

    if (!Array.isArray(recent) || recent.length === 0) {
      const empty = document.createElement("li");
      empty.textContent = "No existen diagnósticos anteriores.";
      elements.historyList.append(empty);
      return;
    }

    recent.slice(0, 5).forEach((run) => {
      const item = document.createElement("li");
      item.className = "diagnostics-history-item";

      const status = document.createElement("strong");
      status.textContent = statusLabel(run.overallStatus);

      const detail = document.createElement("span");
      detail.textContent = `${formatDateTime(run.completedAt)} · ${run.passedCount} correctas, ${run.failedCount} errores`;

      item.append(status, detail);
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
    elements.overallBadge.className =
      `admin-state-badge admin-state-${visualClass}`;
    elements.panel.dataset.status = visualClass;
    elements.description.textContent = latest.overallStatus === "healthy"
      ? "Las funciones comprobadas trabajan correctamente."
      : latest.overallStatus === "warning"
        ? "La aplicación funciona, pero existen puntos que deben revisarse."
        : "Se encontraron errores que requieren atención administrativa.";
    elements.passedCount.textContent = String(latest.passedCount);
    elements.warningCount.textContent = String(latest.warningCount);
    elements.failedCount.textContent = String(latest.failedCount);
    elements.duration.textContent = `${latest.durationMs} ms`;
    elements.lastRun.textContent = formatDateTime(latest.completedAt);

    elements.checkList.replaceChildren();
    latest.checks.forEach((check) => {
      elements.checkList.append(createCheckItem(check));
    });

    renderHistory(summary.recent || []);
  }

  async function loadSummary({ quiet = true } = {}) {
    if (state.loading || typeof window.almacen?.getDiagnosticsSummary !== "function") {
      return;
    }

    state.loading = true;

    try {
      const response = await window.almacen.getDiagnosticsSummary();

      if (!response.ok) {
        if (!quiet && response.code !== "ADMIN_SESSION_REQUIRED") {
          showToast(response.message || "No se pudo leer el diagnóstico.", 4600);
        }
        return;
      }

      renderSummary(response.diagnostics);
    } catch (error) {
      console.error("No fue posible cargar el diagnóstico:", error);
      if (!quiet) {
        showToast("No se pudo cargar el diagnóstico general.", 4600);
      }
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

      if (!response.ok) {
        showToast(response.message || "No se pudo ejecutar el diagnóstico.", 5000);
        return;
      }

      renderSummary(response.diagnostics);
      showToast(
        response.result.overallStatus === "healthy"
          ? "Diagnóstico completado: todo funciona correctamente."
          : response.result.overallStatus === "warning"
            ? "Diagnóstico completado con advertencias."
            : "Diagnóstico completado con errores.",
        5000
      );
    } catch (error) {
      console.error("No fue posible ejecutar el diagnóstico:", error);
      showToast("Ocurrió un error al ejecutar el diagnóstico.", 5000);
    } finally {
      elements.runButton.disabled = false;
      elements.runButton.textContent = "Ejecutar diagnóstico general";
    }
  }

  function observeAdministration() {
    if (!elements.adminScreen) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (!elements.adminScreen.classList.contains("hidden")) {
        reportScreens();
        loadSummary({ quiet: true });
      }
    });

    observer.observe(elements.adminScreen, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function start() {
    renderEmpty();
    elements.runButton?.addEventListener("click", runDiagnostics);
    observeAdministration();
    window.setTimeout(reportScreens, 250);
    window.addEventListener("focus", reportScreens);
  }

  start();
})(window, document);
