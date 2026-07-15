/* =========================================================
Nombre completo: connection-config-service.js
Ruta o ubicación: /app/main/connections/connection-config-service.js
Función o funciones:
- Guardar la configuración local de Firebase, Supabase y Google Sheets.
- Proteger claves mediante safeStorage de Electron cuando está disponible.
- Entregar datos públicos sin revelar secretos.
- Probar cada conexión desde el proceso principal.
Con qué se conecta:
- app/main/main.js
- app/main/sync/firebase-sync-service.js
- app/renderer/connections.js
========================================================= */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const FILE_NAME = "connections-config.json";
const SCHEMA_VERSION = 1;
const TEST_TIMEOUT_MS = 12_000;

const DEFAULT_CONNECTIONS = Object.freeze({
  firebase: Object.freeze({
    enabled: true,
    projectId: "almacen-59227",
    collection: "almacen_familiar_devices",
    apiKey: "AIzaSyAXO_u1O0-8NYQL6oM8GWBdcmr2_--9Dp8"
  }),
  supabase: Object.freeze({
    enabled: false,
    url: "",
    table: "almacen_snapshots",
    anonKey: ""
  }),
  googleSheets: Object.freeze({
    enabled: false,
    webAppUrl: "",
    spreadsheetId: "",
    sheetName: "Productos"
  })
});

const PROVIDERS = Object.freeze({
  firebase: {
    label: "Firebase",
    secretField: "apiKey",
    publicFields: ["enabled", "projectId", "collection"]
  },
  supabase: {
    label: "Supabase",
    secretField: "anonKey",
    publicFields: ["enabled", "url", "table"]
  },
  googleSheets: {
    label: "Google Sheets",
    secretField: null,
    publicFields: ["enabled", "webAppUrl", "spreadsheetId", "sheetName"]
  }
});

function nowIso() {
  return new Date().toISOString();
}

function clean(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizeUrl(value) {
  const raw = clean(value, 1200);
  if (!raw) return "";
  const parsed = new URL(raw);
  if (!/^https?:$/.test(parsed.protocol)) throw new Error("La dirección debe comenzar con https:// o http://.");
  return parsed.toString().replace(/\/$/, "");
}

function providerError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function maskSecret(value) {
  const text = String(value || "");
  if (!text) return "";
  const tail = text.slice(-4);
  return `${"•".repeat(Math.max(4, Math.min(12, text.length - 4)))}${tail}`;
}

function cloneDefaults() {
  return {
    firebase: { ...DEFAULT_CONNECTIONS.firebase },
    supabase: { ...DEFAULT_CONNECTIONS.supabase },
    googleSheets: { ...DEFAULT_CONNECTIONS.googleSheets }
  };
}

class ConnectionConfigService {
  constructor({ userDataPath, safeStorage = null, fetchImpl = globalThis.fetch } = {}) {
    if (!userDataPath) throw new Error("userDataPath es obligatorio.");
    this.userDataPath = userDataPath;
    this.safeStorage = safeStorage;
    this.fetch = fetchImpl;
  }

  get filePath() {
    return path.join(this.userDataPath, FILE_NAME);
  }

  encryptionAvailable() {
    try {
      return Boolean(this.safeStorage?.isEncryptionAvailable?.());
    } catch {
      return false;
    }
  }

  encodeSecret(value) {
    const secret = String(value || "");
    if (!secret) return null;
    if (this.encryptionAvailable()) {
      return {
        mode: "safeStorage",
        value: this.safeStorage.encryptString(secret).toString("base64")
      };
    }
    return {
      mode: "base64",
      value: Buffer.from(secret, "utf8").toString("base64")
    };
  }

  decodeSecret(record) {
    if (!record?.value) return "";
    try {
      const buffer = Buffer.from(record.value, "base64");
      if (record.mode === "safeStorage" && this.safeStorage?.decryptString) {
        return this.safeStorage.decryptString(buffer);
      }
      return buffer.toString("utf8");
    } catch {
      return "";
    }
  }

  defaultDocument() {
    const defaults = cloneDefaults();
    return {
      schemaVersion: SCHEMA_VERSION,
      updatedAt: null,
      providers: {
        firebase: {
          enabled: defaults.firebase.enabled,
          projectId: defaults.firebase.projectId,
          collection: defaults.firebase.collection,
          secret: this.encodeSecret(defaults.firebase.apiKey),
          lastTestAt: null,
          lastTestOk: null,
          lastTestMessage: null
        },
        supabase: {
          enabled: defaults.supabase.enabled,
          url: defaults.supabase.url,
          table: defaults.supabase.table,
          secret: null,
          lastTestAt: null,
          lastTestOk: null,
          lastTestMessage: null
        },
        googleSheets: {
          enabled: defaults.googleSheets.enabled,
          webAppUrl: defaults.googleSheets.webAppUrl,
          spreadsheetId: defaults.googleSheets.spreadsheetId,
          sheetName: defaults.googleSheets.sheetName,
          lastTestAt: null,
          lastTestOk: null,
          lastTestMessage: null
        }
      }
    };
  }

  readDocument() {
    if (!fs.existsSync(this.filePath)) return this.defaultDocument();
    try {
      const parsed = JSON.parse(fs.readFileSync(this.filePath, "utf8"));
      const fallback = this.defaultDocument();
      return {
        schemaVersion: SCHEMA_VERSION,
        updatedAt: parsed.updatedAt || null,
        providers: {
          firebase: { ...fallback.providers.firebase, ...(parsed.providers?.firebase || {}) },
          supabase: { ...fallback.providers.supabase, ...(parsed.providers?.supabase || {}) },
          googleSheets: { ...fallback.providers.googleSheets, ...(parsed.providers?.googleSheets || {}) }
        }
      };
    } catch (error) {
      try {
        const damaged = `${this.filePath}.invalid-${Date.now()}`;
        fs.renameSync(this.filePath, damaged);
      } catch {}
      const reset = this.defaultDocument();
      reset.loadWarning = error.message;
      return reset;
    }
  }

  writeDocument(document) {
    fs.mkdirSync(this.userDataPath, { recursive: true });
    const next = { ...document, schemaVersion: SCHEMA_VERSION, updatedAt: nowIso() };
    const temporary = `${this.filePath}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(temporary, `${JSON.stringify(next, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    fs.renameSync(temporary, this.filePath);
    return next;
  }

  resolveProvider(providerId, document = this.readDocument()) {
    const definition = PROVIDERS[providerId];
    if (!definition) throw providerError("CONNECTION_PROVIDER_INVALID", "La conexión seleccionada no existe.");
    const stored = document.providers[providerId] || {};
    const defaults = DEFAULT_CONNECTIONS[providerId];
    const result = { ...defaults, ...stored };
    if (definition.secretField) {
      result[definition.secretField] = this.decodeSecret(stored.secret) || defaults[definition.secretField] || "";
    }
    delete result.secret;
    return result;
  }

  validate(providerId, config, { allowDisabled = true } = {}) {
    if (allowDisabled && !config.enabled) return;
    if (providerId === "firebase") {
      if (!clean(config.projectId) || !clean(config.collection) || !clean(config.apiKey)) {
        throw providerError("FIREBASE_CONFIG_INCOMPLETE", "Completa el proyecto, la colección y la API key de Firebase.");
      }
    } else if (providerId === "supabase") {
      if (!clean(config.url) || !clean(config.table) || !clean(config.anonKey)) {
        throw providerError("SUPABASE_CONFIG_INCOMPLETE", "Completa la URL, la tabla y la clave anónima de Supabase.");
      }
      normalizeUrl(config.url);
    } else if (providerId === "googleSheets") {
      if (!clean(config.webAppUrl) || !clean(config.spreadsheetId) || !clean(config.sheetName)) {
        throw providerError("SHEETS_CONFIG_INCOMPLETE", "Completa la URL de Apps Script, el ID del documento y la hoja.");
      }
      normalizeUrl(config.webAppUrl);
    }
  }

  publicProvider(providerId, document = this.readDocument()) {
    const definition = PROVIDERS[providerId];
    const resolved = this.resolveProvider(providerId, document);
    const stored = document.providers[providerId];
    const output = {
      id: providerId,
      label: definition.label,
      enabled: Boolean(resolved.enabled),
      configured: false,
      lastTestAt: stored.lastTestAt || null,
      lastTestOk: typeof stored.lastTestOk === "boolean" ? stored.lastTestOk : null,
      lastTestMessage: stored.lastTestMessage || null
    };
    for (const field of definition.publicFields) output[field] = resolved[field];
    if (definition.secretField) {
      const secret = resolved[definition.secretField];
      output.hasSecret = Boolean(secret);
      output.maskedSecret = maskSecret(secret);
    }
    try {
      this.validate(providerId, resolved, { allowDisabled: false });
      output.configured = true;
    } catch {
      output.configured = false;
    }
    return output;
  }

  getPublicConfig() {
    const document = this.readDocument();
    return {
      updatedAt: document.updatedAt || null,
      protection: this.encryptionAvailable() ? "system" : "basic",
      providers: {
        firebase: this.publicProvider("firebase", document),
        supabase: this.publicProvider("supabase", document),
        googleSheets: this.publicProvider("googleSheets", document)
      }
    };
  }

  getRuntimeConfig(providerId) {
    return this.resolveProvider(providerId);
  }

  save(providerId, payload = {}) {
    const definition = PROVIDERS[providerId];
    if (!definition) throw providerError("CONNECTION_PROVIDER_INVALID", "La conexión seleccionada no existe.");
    const document = this.readDocument();
    const current = document.providers[providerId];
    const next = { ...current };
    next.enabled = Boolean(payload.enabled);

    for (const field of definition.publicFields) {
      if (field === "enabled") continue;
      if (!(field in payload)) continue;
      if (field === "url" || field === "webAppUrl") next[field] = payload[field] ? normalizeUrl(payload[field]) : "";
      else next[field] = clean(payload[field], field === "sheetName" ? 120 : 500);
    }

    if (definition.secretField) {
      const supplied = clean(payload[definition.secretField], 3000);
      if (supplied) next.secret = this.encodeSecret(supplied);
      if (payload.clearSecret === true) next.secret = null;
    }

    next.lastTestAt = null;
    next.lastTestOk = null;
    next.lastTestMessage = "Configuración modificada; prueba nuevamente la conexión.";
    document.providers[providerId] = next;
    const resolved = this.resolveProvider(providerId, document);
    this.validate(providerId, resolved, { allowDisabled: true });
    const saved = this.writeDocument(document);
    return this.publicProvider(providerId, saved);
  }

  async request(url, options = {}) {
    if (typeof this.fetch !== "function") throw providerError("CONNECTION_FETCH_UNAVAILABLE", "Este equipo no puede realizar la prueba de conexión.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);
    try {
      return await this.fetch(url, { ...options, signal: controller.signal });
    } catch (error) {
      if (error?.name === "AbortError") throw providerError("CONNECTION_TIMEOUT", "La conexión tardó demasiado en responder.");
      throw providerError("CONNECTION_NETWORK_ERROR", error?.message || "No se pudo contactar con el servicio.");
    } finally {
      clearTimeout(timer);
    }
  }

  async testFirebase(config) {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/${encodeURIComponent(config.collection)}?pageSize=1&key=${encodeURIComponent(config.apiKey)}`;
    return this.request(url, { method: "GET" });
  }

  async testSupabase(config) {
    const url = `${normalizeUrl(config.url)}/rest/v1/${encodeURIComponent(config.table)}?select=*&limit=1`;
    return this.request(url, {
      method: "GET",
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        Accept: "application/json"
      }
    });
  }

  async testGoogleSheets(config) {
    const url = new URL(normalizeUrl(config.webAppUrl));
    url.searchParams.set("action", "ping");
    url.searchParams.set("spreadsheetId", config.spreadsheetId);
    url.searchParams.set("sheet", config.sheetName);
    return this.request(url.toString(), { method: "GET", redirect: "follow" });
  }

  async recordTest(providerId, result) {
    const document = this.readDocument();
    const provider = document.providers[providerId];
    provider.lastTestAt = result.testedAt;
    provider.lastTestOk = result.ok;
    provider.lastTestMessage = result.message;
    this.writeDocument(document);
    return result;
  }

  async test(providerId, payload = null) {
    const document = this.readDocument();
    let config = this.resolveProvider(providerId, document);
    if (payload && typeof payload === "object") {
      config = { ...config, ...payload };
      const definition = PROVIDERS[providerId];
      if (definition?.secretField && !clean(payload[definition.secretField])) {
        config[definition.secretField] = this.resolveProvider(providerId, document)[definition.secretField];
      }
    }
    config.enabled = true;
    this.validate(providerId, config, { allowDisabled: false });
    const testedAt = nowIso();

    try {
      let response;
      if (providerId === "firebase") response = await this.testFirebase(config);
      else if (providerId === "supabase") response = await this.testSupabase(config);
      else if (providerId === "googleSheets") response = await this.testGoogleSheets(config);
      else throw providerError("CONNECTION_PROVIDER_INVALID", "La conexión seleccionada no existe.");

      const text = await response.text().catch(() => "");
      if (!response.ok) {
        const short = clean(text, 700);
        return this.recordTest(providerId, {
          ok: false,
          provider: providerId,
          statusCode: response.status,
          testedAt,
          message: short || `El servicio respondió con el código ${response.status}.`
        });
      }

      return this.recordTest(providerId, {
        ok: true,
        provider: providerId,
        statusCode: response.status,
        testedAt,
        message: `${PROVIDERS[providerId].label} respondió correctamente.`
      });
    } catch (error) {
      return this.recordTest(providerId, {
        ok: false,
        provider: providerId,
        statusCode: null,
        testedAt,
        code: error.code || "CONNECTION_TEST_FAILED",
        message: error.message || "No se pudo probar la conexión."
      });
    }
  }
}

module.exports = {
  ConnectionConfigService,
  DEFAULT_CONNECTIONS,
  FILE_NAME,
  PROVIDERS,
  maskSecret
};
