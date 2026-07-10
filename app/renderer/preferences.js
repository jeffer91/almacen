/* =========================================================
Nombre completo: preferences.js
Ruta o ubicación: /app/renderer/preferences.js
Función o funciones:
- Aplicar el tamaño de letra, contraste y movimiento preferidos.
- Permitir a Edgar y Gloria cambiar rápidamente el tamaño de letra.
- Mostrar y guardar la configuración completa desde Administración.
- Mantener la vista actualizada sin recargar la aplicación.
========================================================= */

"use strict";

(function initializePreferences(window, document) {
  const TEXT_SIZES = ["normal", "large", "xlarge"];
  const TEXT_SIZE_LABELS = {
    normal: "Normal",
    large: "Grande",
    xlarge: "Muy grande"
  };

  const state = {
    preferences: null,
    device: null,
    loading: false
  };

  const elements = {
    viewButton: document.getElementById("view-button"),
    adminConfigureButton: document.getElementById("admin-device-configure-button"),
    adminDeviceFriendlyName: document.getElementById("admin-device-friendly-name"),
    adminDevicePreferenceSummary: document.getElementById("admin-device-preference-summary"),
    dialog: document.getElementById("device-preferences-dialog"),
    form: document.getElementById("device-preferences-form"),
    friendlyName: document.getElementById("device-friendly-name"),
    highContrast: document.getElementById("device-high-contrast"),
    reducedMotion: document.getElementById("device-reduced-motion"),
    startMaximized: document.getElementById("device-start-maximized"),
    cancelButton: document.getElementById("device-preferences-cancel"),
    saveButton: document.getElementById("device-preferences-save"),
    error: document.getElementById("device-preferences-error"),
    toast: document.getElementById("toast")
  };

  function showToast(message, duration = 3200) {
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

  function setError(message) {
    elements.error.textContent = message || "";
    elements.error.classList.toggle("hidden", !message);
  }

  function applyPreferences(preferences) {
    if (!preferences) {
      return;
    }

    document.documentElement.dataset.textSize = preferences.textSize;
    document.documentElement.dataset.highContrast = String(preferences.highContrast);
    document.documentElement.dataset.reducedMotion = String(preferences.reducedMotion);
  }

  function preferenceSummary(preferences) {
    if (!preferences) {
      return "Configuración no disponible";
    }

    const parts = [`Letra ${TEXT_SIZE_LABELS[preferences.textSize] || "Normal"}`];

    if (preferences.highContrast) {
      parts.push("contraste alto");
    }

    if (preferences.reducedMotion) {
      parts.push("movimiento reducido");
    }

    return parts.join(" · ");
  }

  function render(preferences, device) {
    state.preferences = preferences;
    state.device = device || state.device;
    applyPreferences(preferences);

    if (elements.viewButton) {
      elements.viewButton.disabled = false;
      elements.viewButton.textContent = `Letra: ${TEXT_SIZE_LABELS[preferences.textSize]}`;
      elements.viewButton.title = "Cambiar el tamaño de la letra";
    }

    if (elements.adminDeviceFriendlyName) {
      elements.adminDeviceFriendlyName.textContent = preferences.friendlyName;
    }

    if (elements.adminDevicePreferenceSummary) {
      elements.adminDevicePreferenceSummary.textContent = preferenceSummary(preferences);
    }
  }

  async function loadPreferences({ quiet = true } = {}) {
    if (state.loading || !window.almacen?.getDevicePreferences) {
      return null;
    }

    state.loading = true;

    try {
      const response = await window.almacen.getDevicePreferences();

      if (!response.ok) {
        if (elements.viewButton) {
          elements.viewButton.disabled = true;
          elements.viewButton.textContent = "Letra";
        }

        if (!quiet) {
          showToast(response.message || "La configuración visual todavía no está disponible.");
        }

        return null;
      }

      render(response.preferences, response.device);
      return response.preferences;
    } catch (error) {
      console.error("No fue posible cargar las preferencias:", error);
      if (!quiet) {
        showToast("No se pudo cargar la configuración visual.", 4500);
      }
      return null;
    } finally {
      state.loading = false;
    }
  }

  function nextTextSize(current) {
    const index = TEXT_SIZES.indexOf(current);
    return TEXT_SIZES[(index + 1) % TEXT_SIZES.length];
  }

  async function cycleTextSize() {
    const current = state.preferences || (await loadPreferences({ quiet: false }));
    if (!current) {
      return;
    }

    elements.viewButton.disabled = true;

    try {
      const response = await window.almacen.setTextSize(nextTextSize(current.textSize));

      if (!response.ok) {
        showToast(response.message || "No se pudo cambiar la letra.", 4500);
        return;
      }

      render(response.preferences, state.device);
      showToast(`Tamaño de letra: ${TEXT_SIZE_LABELS[response.preferences.textSize]}.`);
    } catch (error) {
      console.error("No fue posible cambiar el tamaño de letra:", error);
      showToast("No se pudo cambiar el tamaño de letra.", 4500);
    } finally {
      elements.viewButton.disabled = false;
    }
  }

  function selectedTextSize() {
    return elements.form.querySelector('input[name="device-text-size"]:checked')?.value || "normal";
  }

  function fillForm(preferences) {
    elements.friendlyName.value = preferences.friendlyName;
    const textSizeInput = elements.form.querySelector(
      `input[name="device-text-size"][value="${preferences.textSize}"]`
    );

    if (textSizeInput) {
      textSizeInput.checked = true;
    }

    elements.highContrast.checked = preferences.highContrast;
    elements.reducedMotion.checked = preferences.reducedMotion;
    elements.startMaximized.checked = preferences.startMaximized;
  }

  async function openDialog() {
    setError("");
    const preferences = await loadPreferences({ quiet: false });

    if (!preferences) {
      return;
    }

    fillForm(preferences);
    elements.dialog.showModal();
    elements.friendlyName.focus();
  }

  async function savePreferences(event) {
    event.preventDefault();
    setError("");
    elements.saveButton.disabled = true;
    elements.cancelButton.disabled = true;
    elements.saveButton.textContent = "Guardando…";

    try {
      const response = await window.almacen.updateDevicePreferences({
        friendlyName: elements.friendlyName.value,
        textSize: selectedTextSize(),
        highContrast: elements.highContrast.checked,
        reducedMotion: elements.reducedMotion.checked,
        startMaximized: elements.startMaximized.checked
      });

      if (!response.ok) {
        setError(response.message || "No se pudo guardar la configuración.");
        return;
      }

      render(response.preferences, response.device);
      elements.dialog.close();
      showToast("Configuración del equipo guardada correctamente.", 4200);
    } catch (error) {
      console.error("No fue posible guardar las preferencias:", error);
      setError("No se pudo guardar la configuración. Intenta nuevamente.");
    } finally {
      elements.saveButton.disabled = false;
      elements.cancelButton.disabled = false;
      elements.saveButton.textContent = "Guardar configuración";
    }
  }

  function bindEvents() {
    elements.viewButton?.addEventListener("click", cycleTextSize);
    elements.adminConfigureButton?.addEventListener("click", openDialog);
    elements.form?.addEventListener("submit", savePreferences);
    elements.cancelButton?.addEventListener("click", () => {
      elements.dialog.close();
      setError("");
    });

    window.addEventListener("focus", () => loadPreferences({ quiet: true }));
  }

  function start() {
    bindEvents();
    loadPreferences({ quiet: true });
  }

  start();
})(window, document);
