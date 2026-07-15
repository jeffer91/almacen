/* =========================================================
Nombre completo: connections.js
Ruta o ubicación: /app/renderer/connections.js
Función o funciones:
- Crear la sección Conexiones dentro de Administración.
- Configurar Firebase, Supabase y Google Sheets.
- Guardar y probar cada servicio desde la interfaz.
- Mostrar estado, última prueba y protección local de secretos.
Con qué se conecta:
- app/preload/preload.js
- app/main/connections/connection-config-service.js
- app/renderer/admin-navigation.js
========================================================= */

"use strict";

(function initializeConnections(window, document) {
  const adminScreen = document.getElementById("admin-screen");
  if (!adminScreen || document.getElementById("connections-panel")) return;

  const PROVIDERS = Object.freeze({
    firebase: {
      label: "Firebase",
      description: "Sincronización remota entre las computadoras.",
      fields: [
        { id: "projectId", label: "ID del proyecto", placeholder: "almacen-59227" },
        { id: "collection", label: "Colección", placeholder: "almacen_familiar_devices" },
        { id: "apiKey", label: "API key", type: "password", placeholder: "Dejar vacío para conservar la clave" }
      ]
    },
    supabase: {
      label: "Supabase",
      description: "Base paralela de respaldo y recuperación.",
      fields: [
        { id: "url", label: "URL del proyecto", placeholder: "https://xxxxx.supabase.co" },
        { id: "table", label: "Tabla", placeholder: "almacen_snapshots" },
        { id: "anonKey", label: "Anon key", type: "password", placeholder: "Dejar vacío para conservar la clave" }
      ]
    },
    googleSheets: {
      label: "Google Sheets",
      description: "Copia visible mediante una aplicación web de Apps Script.",
      fields: [
        { id: "webAppUrl", label: "URL de Apps Script", placeholder: "https://script.google.com/macros/s/.../exec" },
        { id: "spreadsheetId", label: "ID del documento", placeholder: "ID de Google Sheets" },
        { id: "sheetName", label: "Nombre de la hoja", placeholder: "Productos" }
      ]
    }
  });

  const panel = document.createElement("section");
  panel.className = "connections-panel";
  panel.id = "connections-panel";
  panel.dataset.status = "neutral";
  panel.setAttribute("aria-labelledby", "connections-title");
  panel.innerHTML = `
    <div class="connections-header">
      <div>
        <p class="admin-card-label">Conexiones externas</p>
        <h2 id="connections-title">Configurar bases y servicios</h2>
        <p id="connections-description">Configura y prueba cada conexión desde esta computadora.</p>
      </div>
      <span class="admin-state-badge admin-state-neutral" id="connections-badge">Pendiente</span>
    </div>
    <div class="connections-security-note" id="connections-security-note" role="note">
      Las claves se guardan localmente. Cuando Windows lo permite, se protegen con el sistema operativo.
    </div>
    <div class="connections-grid" id="connections-grid"></div>
  `;
  adminScreen.append(panel);

  const grid = panel.querySelector("#connections-grid");
  const securityNote = panel.querySelector("#connections-security-note");
  const overallBadge = panel.querySelector("#connections-badge");
  const description = panel.querySelector("#connections-description");
  const state = { loaded: false, config: null, busy: new Set() };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setBadge(element, kind, text) {
    element.className = `admin-state-badge admin-state-${kind}`;
    element.textContent = text;
  }

  function providerStatus(provider) {
    if (!provider.enabled) return { kind: "neutral", text: "Desactivada" };
    if (!provider.configured) return { kind: "warning", text: "Incompleta" };
    if (provider.lastTestOk === true) return { kind: "healthy", text: "Conectada" };
    if (provider.lastTestOk === false) return { kind: "error", text: "Con error" };
    return { kind: "warning", text: "Sin probar" };
  }

  function cardTemplate(providerId, provider) {
    const definition = PROVIDERS[providerId];
    const status = providerStatus(provider);
    const fields = definition.fields.map((field) => {
      const value = field.type === "password" ? "" : (provider[field.id] || "");
      const helper = field.type === "password" && provider.hasSecret
        ? `<small>Clave guardada: ${esc(provider.maskedSecret)}</small>`
        : "";
      return `
        <label class="form-field connection-field">
          <span>${esc(field.label)}</span>
          <input class="text-input" data-connection-field="${esc(field.id)}" type="${field.type || "text"}" value="${esc(value)}" placeholder="${esc(field.placeholder || "")}" autocomplete="off">
          ${helper}
        </label>`;
    }).join("");

    const lastTest = provider.lastTestAt
      ? `${new Date(provider.lastTestAt).toLocaleString("es-EC")} · ${esc(provider.lastTestMessage || "")}`
      : esc(provider.lastTestMessage || "Todavía no se ha probado.");

    return `
      <article class="connection-card" data-provider="${esc(providerId)}">
        <div class="connection-card-heading">
          <div>
            <p class="admin-card-label">${esc(definition.label)}</p>
            <h3>${esc(definition.description)}</h3>
          </div>
          <span class="admin-state-badge admin-state-${status.kind}" data-connection-badge>${status.text}</span>
        </div>
        <label class="connection-enabled">
          <input type="checkbox" data-connection-enabled ${provider.enabled ? "checked" : ""}>
          <span>Usar esta conexión</span>
        </label>
        <div class="connection-fields">${fields}</div>
        <p class="connection-last-test" data-connection-message>${lastTest}</p>
        <p class="form-error hidden" data-connection-error role="alert"></p>
        <div class="connection-actions">
          <button class="button button-secondary" type="button" data-connection-save>Guardar</button>
          <button class="button button-primary" type="button" data-connection-test>Probar conexión</button>
        </div>
      </article>`;
  }

  function updateOverallStatus() {
    const providers = Object.values(state.config?.providers || {});
    if (!providers.length) {
      setBadge(overallBadge, "neutral", "Pendiente");
      panel.dataset.status = "neutral";
      return;
    }
    const enabled = providers.filter((provider) => provider.enabled);
    if (!enabled.length) {
      setBadge(overallBadge, "neutral", "Desactivadas");
      panel.dataset.status = "neutral";
    } else if (enabled.some((provider) => provider.lastTestOk === false)) {
      setBadge(overallBadge, "error", "Con errores");
      panel.dataset.status = "error";
    } else if (enabled.every((provider) => provider.configured && provider.lastTestOk === true)) {
      setBadge(overallBadge, "healthy", "Correctas");
      panel.dataset.status = "healthy";
    } else {
      setBadge(overallBadge, "warning", "Pendientes");
      panel.dataset.status = "warning";
    }
    document.dispatchEvent(new CustomEvent("almacen:connections-updated"));
  }

  function render() {
    if (!state.config) return;
    securityNote.textContent = state.config.protection === "system"
      ? "Las claves están protegidas con el sistema operativo de esta computadora."
      : "Las claves se guardan localmente, pero este sistema no ofrece cifrado del sistema operativo.";
    grid.innerHTML = Object.entries(PROVIDERS)
      .map(([providerId]) => cardTemplate(providerId, state.config.providers[providerId]))
      .join("");
    bindCards();
    updateOverallStatus();
  }

  function payloadFromCard(card) {
    const providerId = card.dataset.provider;
    const payload = { enabled: card.querySelector("[data-connection-enabled]").checked };
    card.querySelectorAll("[data-connection-field]").forEach((input) => {
      payload[input.dataset.connectionField] = input.value.trim();
    });
    return { providerId, payload };
  }

  function setCardBusy(card, busy) {
    card.querySelectorAll("button, input").forEach((element) => { element.disabled = busy; });
    card.classList.toggle("is-busy", busy);
  }

  function showCardError(card, message) {
    const error = card.querySelector("[data-connection-error]");
    error.textContent = message || "";
    error.classList.toggle("hidden", !message);
  }

  async function saveCard(card, { quiet = false } = {}) {
    const { providerId, payload } = payloadFromCard(card);
    if (state.busy.has(providerId)) return null;
    state.busy.add(providerId);
    setCardBusy(card, true);
    showCardError(card, "");
    try {
      const response = await window.almacen.saveConnectionConfig(providerId, payload);
      if (!response?.ok) throw new Error(response?.message || "No se pudo guardar la conexión.");
      state.config = response.connections;
      render();
      if (!quiet) window.AlmacenShell?.showToast?.("Configuración guardada.", "success");
      return payload;
    } catch (error) {
      showCardError(card, error.message || "No se pudo guardar la conexión.");
      return null;
    } finally {
      state.busy.delete(providerId);
      if (document.body.contains(card)) setCardBusy(card, false);
    }
  }

  async function testCard(card) {
    const snapshot = payloadFromCard(card);
    const savedPayload = await saveCard(card, { quiet: true });
    if (!savedPayload) return;
    const currentCard = grid.querySelector(`[data-provider="${snapshot.providerId}"]`);
    if (!currentCard || state.busy.has(snapshot.providerId)) return;
    state.busy.add(snapshot.providerId);
    setCardBusy(currentCard, true);
    showCardError(currentCard, "");
    try {
      const response = await window.almacen.testConnection(snapshot.providerId, savedPayload);
      if (!response?.ok) throw new Error(response?.message || "No se pudo probar la conexión.");
      state.config = response.connections;
      render();
      window.AlmacenShell?.showToast?.(response.result.ok ? "Conexión correcta." : "La conexión respondió con error.", response.result.ok ? "success" : "error");
    } catch (error) {
      showCardError(currentCard, error.message || "No se pudo probar la conexión.");
    } finally {
      state.busy.delete(snapshot.providerId);
      if (document.body.contains(currentCard)) setCardBusy(currentCard, false);
    }
  }

  function bindCards() {
    grid.querySelectorAll("[data-provider]").forEach((card) => {
      card.querySelector("[data-connection-save]")?.addEventListener("click", () => saveCard(card));
      card.querySelector("[data-connection-test]")?.addEventListener("click", () => testCard(card));
    });
  }

  async function load({ force = false } = {}) {
    if (state.loaded && !force) return;
    description.textContent = "Consultando la configuración guardada en esta computadora.";
    try {
      const response = await window.almacen.getConnectionsConfig();
      if (!response?.ok) throw new Error(response?.message || "No se pudo cargar la configuración.");
      state.config = response.connections;
      state.loaded = true;
      description.textContent = "Configura, activa y prueba cada servicio por separado.";
      render();
    } catch (error) {
      description.textContent = error.message || "No se pudo cargar la configuración de conexiones.";
      setBadge(overallBadge, "error", "Error");
      panel.dataset.status = "error";
    }
  }

  document.addEventListener("almacen:admin-section-changed", (event) => {
    if (event.detail?.id === "connections") load({ force: true });
  });
  document.addEventListener("almacen:screen-changed", (event) => {
    if (event.detail?.name !== "admin") state.loaded = false;
  });

  window.AlmacenConnections = Object.freeze({
    load: () => load({ force: true }),
    getConfig: () => state.config
  });
})(window, document);
