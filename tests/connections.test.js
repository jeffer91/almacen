/* =========================================================
Nombre completo: connections.test.js
Ruta o ubicación: /tests/connections.test.js
Función o funciones:
- Verificar guardado local y protección de secretos.
- Confirmar configuración pública sin revelar claves.
- Probar Firebase, Supabase y Google Sheets con transporte simulado.
Con qué se conecta:
- app/main/connections/connection-config-service.js
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { ConnectionConfigService } = require("../app/main/connections/connection-config-service");

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-connections-"));
  try {
    await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function safeStorageMock() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (buffer) => buffer.toString("utf8").replace(/^encrypted:/, "")
  };
}

function okFetch(calls) {
  return async (url, options = {}) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 200,
      text: async () => '{"ok":true}'
    };
  };
}

test("guarda secretos protegidos y no los expone en la configuración pública", async () => {
  await withTempDirectory(async (directory) => {
    const service = new ConnectionConfigService({
      userDataPath: directory,
      safeStorage: safeStorageMock(),
      fetchImpl: okFetch([])
    });

    service.save("supabase", {
      enabled: true,
      url: "https://demo.supabase.co",
      table: "almacen_snapshots",
      anonKey: "clave-super-secreta"
    });

    const publicConfig = service.getPublicConfig();
    assert.equal(publicConfig.protection, "system");
    assert.equal(publicConfig.providers.supabase.hasSecret, true);
    assert.match(publicConfig.providers.supabase.maskedSecret, /reta$/);
    assert.equal("anonKey" in publicConfig.providers.supabase, false);

    const runtime = service.getRuntimeConfig("supabase");
    assert.equal(runtime.anonKey, "clave-super-secreta");
  });
});

test("conserva la clave existente cuando el formulario se guarda vacío", async () => {
  await withTempDirectory(async (directory) => {
    const service = new ConnectionConfigService({
      userDataPath: directory,
      safeStorage: safeStorageMock(),
      fetchImpl: okFetch([])
    });

    service.save("firebase", {
      enabled: true,
      projectId: "proyecto-uno",
      collection: "equipos",
      apiKey: "clave-original"
    });
    service.save("firebase", {
      enabled: true,
      projectId: "proyecto-dos",
      collection: "equipos",
      apiKey: ""
    });

    assert.equal(service.getRuntimeConfig("firebase").apiKey, "clave-original");
    assert.equal(service.getRuntimeConfig("firebase").projectId, "proyecto-dos");
  });
});

test("prueba los tres proveedores desde el proceso principal", async () => {
  await withTempDirectory(async (directory) => {
    const calls = [];
    const service = new ConnectionConfigService({
      userDataPath: directory,
      safeStorage: safeStorageMock(),
      fetchImpl: okFetch(calls)
    });

    service.save("supabase", {
      enabled: true,
      url: "https://demo.supabase.co",
      table: "almacen_snapshots",
      anonKey: "anon-test"
    });
    service.save("googleSheets", {
      enabled: true,
      webAppUrl: "https://script.google.com/macros/s/demo/exec",
      spreadsheetId: "sheet-123",
      sheetName: "Productos"
    });

    const firebase = await service.test("firebase");
    const supabase = await service.test("supabase");
    const sheets = await service.test("googleSheets");

    assert.equal(firebase.ok, true);
    assert.equal(supabase.ok, true);
    assert.equal(sheets.ok, true);
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /firestore\.googleapis\.com/);
    assert.match(calls[1].url, /supabase\.co\/rest\/v1\/almacen_snapshots/);
    assert.match(calls[2].url, /action=ping/);
  });
});

test("registra el error devuelto por un proveedor", async () => {
  await withTempDirectory(async (directory) => {
    const service = new ConnectionConfigService({
      userDataPath: directory,
      safeStorage: safeStorageMock(),
      fetchImpl: async () => ({
        ok: false,
        status: 403,
        text: async () => "Permission denied"
      })
    });

    const result = await service.test("firebase");
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 403);
    assert.match(result.message, /Permission denied/);
    assert.equal(service.getPublicConfig().providers.firebase.lastTestOk, false);
  });
});
