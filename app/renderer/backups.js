/* =========================================================
Nombre completo: backups.js
Ruta o ubicación: /app/renderer/backups.js
Función o funciones:
- Mostrar el resumen de respaldos locales.
- Crear respaldos manuales desde Administración.
- Verificar la integridad de un respaldo existente.
- Abrir la carpeta local de respaldos.
========================================================= */

"use strict";

(function initializeBackups(window, document) {
  const state = {
    summary: null,
    loading: false
  };

  const elements = {
    adminScreen: document.getElementById("admin-screen"),
    panel: document.getElementById("backups-panel"),
    status: document.getElementById("backups-status"),
    badge: document.getElementById("backups-badge"),
    description: document.getElementById("backups-description"),
    total: document.getElementById("backups-total"),
    automatic: document.getElementById("backups-automatic"),
    manual: document.getElementById("backups-manual"),
    latest: document.getElementById("backups-latest"),
    list: document.getElementById("backups-list"),
    createButton: document.getElementById("backups-create-button"),
    verifyButton: document.getElementById("backups-verify-button"),
    folderButton: document.getElementById("backups-folder-button"),
    toast: document.getElementById("toast")
  };

  function showToast(message, duration = 4200) {
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
      return "Sin respaldo";
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

  function formatBytes(bytes) {
    const value = Number(bytes);

    if (!Number.isFinite(value) || value < 0) {
      return "—";
    }

    if (value < 1024) {
      return `${value} B`;
    }

    if (value < 1024 * 1024) {
      return `${(value / 1024).toFixed(1)} KB`;
    }

    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }

  function kindLabel(kind) {
    return kind === "automatic" ? "Automático" : "Manual";
  }

  function renderList(backups) {
    elements.list.replaceChildren();

    if (!Array.isArray(backups) || backups.length === 0) {
      const empty = document.createElement("li");
      empty.className = "backups-empty";
      empty.textContent = "Todavía no existen respaldos locales.";
      elements.list.append(empty);
      return;
    }

    backups.slice(0, 8).forEach((backup) => {
      const item = document.createElement("li");
      item.className = "backup-item";

      const info = document.createElement("div");
      info.className = "backup-item-info";

      const title = document.createElement("strong");
      title.textContent = kindLabel(backup.kind);

      const detail = document.createElement("span");
      detail.textContent = `${formatDateTime(backup.modifiedAt)} · ${formatBytes(backup.sizeBytes)}`;

      const verify = document.createElement("button");
      verify.type = "button";
      verify.className = "button button-secondary backup-item-button";
      verify.textContent = "Verificar";
      verify.addEventListener("click", () => verifyBackup(backup.fileName, verify));

      info.append(title, detail);
      item.append(info, verify);
      elements.list.append(item);
    });
  }

  function render(summary) {
    state.summary = summary;
    const latest = summary?.latest || null;
    const hasBackups = Boolean(latest);

    elements.status.textContent = hasBackups ? "Respaldos disponibles" : "Sin respaldos";
    elements.badge.textContent = hasBackups ? "Protegida" : "Pendiente";
    elements.badge.className = hasBackups
      ? "admin-state-badge admin-state-healthy"
      : "admin-state-badge admin-state-warning";
    elements.panel.dataset.status = hasBackups ? "healthy" : "warning";
    elements.description.textContent = hasBackups
      ? "La base local cuenta con copias verificables guardadas en esta computadora."
      : "Crea el primer respaldo manual. La aplicación también intentará generar uno automático cada día.";
    elements.total.textContent = String(summary?.totalCount || 0);
    elements.automatic.textContent = String(summary?.automaticCount || 0);
    elements.manual.textContent = String(summary?.manualCount || 0);
    elements.latest.textContent = latest ? formatDateTime(latest.modifiedAt) : "Sin respaldo";
    elements.verifyButton.disabled = !latest;
    renderList(summary?.backups || []);
  }

  async function loadSummary({ quiet = true } = {}) {
    if (state.loading || typeof window.almacen?.getBackupsSummary !== "function") {
      return;
    }

    state.loading = true;

    try {
      const response = await window.almacen.getBackupsSummary();

      if (!response.ok) {
        if (!quiet && response.code !== "ADMIN_SESSION_REQUIRED") {
          showToast(response.message || "No se pudieron consultar los respaldos.");
        }
        return;
      }

      render(response.backups);
    } catch (error) {
      console.error("No fue posible cargar los respaldos:", error);
      if (!quiet) {
        showToast("No se pudieron cargar los respaldos.");
      }
    } finally {
      state.loading = false;
    }
  }

  async function createBackup() {
    elements.createButton.disabled = true;
    elements.createButton.textContent = "Creando…";

    try {
      const response = await window.almacen.createBackup();

      if (!response.ok) {
        showToast(response.message || "No se pudo crear el respaldo.", 5000);
        return;
      }

      render(response.backups);
      showToast("Respaldo creado y verificado correctamente.", 5000);
    } catch (error) {
      console.error("No fue posible crear el respaldo:", error);
      showToast("Ocurrió un error al crear el respaldo.", 5000);
    } finally {
      elements.createButton.disabled = false;
      elements.createButton.textContent = "Crear respaldo ahora";
    }
  }

  async function verifyBackup(fileName, button = elements.verifyButton) {
    if (!fileName) {
      showToast("No existe un respaldo para verificar.");
      return;
    }

    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = "Verificando…";

    try {
      const response = await window.almacen.verifyBackup(fileName);

      if (!response.ok) {
        showToast(response.message || "No se pudo verificar el respaldo.", 5000);
        return;
      }

      showToast(
        response.verification.healthy
          ? `Respaldo correcto. Esquema v${response.verification.schemaVersion}.`
          : "El respaldo presenta errores y no debe utilizarse.",
        5200
      );
    } catch (error) {
      console.error("No fue posible verificar el respaldo:", error);
      showToast("Ocurrió un error al verificar el respaldo.", 5000);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  }

  async function verifyLatest() {
    await verifyBackup(state.summary?.latest?.fileName, elements.verifyButton);
  }

  async function openFolder() {
    elements.folderButton.disabled = true;

    try {
      const response = await window.almacen.openBackupsFolder();
      if (!response.ok) {
        showToast(response.message || "No se pudo abrir la carpeta.", 5000);
      }
    } catch (error) {
      console.error("No fue posible abrir la carpeta de respaldos:", error);
      showToast("No se pudo abrir la carpeta de respaldos.", 5000);
    } finally {
      elements.folderButton.disabled = false;
    }
  }

  function observeAdministration() {
    if (!elements.adminScreen) {
      return;
    }

    const observer = new MutationObserver(() => {
      if (!elements.adminScreen.classList.contains("hidden")) {
        loadSummary({ quiet: true });
      }
    });

    observer.observe(elements.adminScreen, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function start() {
    render(null);
    elements.createButton?.addEventListener("click", createBackup);
    elements.verifyButton?.addEventListener("click", verifyLatest);
    elements.folderButton?.addEventListener("click", openFolder);
    observeAdministration();
  }

  start();
})(window, document);
