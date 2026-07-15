/* =========================================================
Nombre completo: sync.test.js
Ruta o ubicación: /tests/sync.test.js
Función o funciones:
- Probar la sincronización Firebase con transporte simulado.
- Confirmar que el trabajo local no depende de una conexión real.
Con qué se conecta:
- app/main/sync/firebase-sync-service.js
- app/main/database/local-database-service.js
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const { FirebaseSyncService } = require("../app/main/sync/firebase-sync-service");

function profile() {
  return {
    id: "jefferson",
    displayName: "Jefferson",
    channelId: "tienda-virtual",
    channelName: "Tienda virtual",
    role: "administrator",
    deviceId: "device-sync-001",
    configuredAt: new Date().toISOString()
  };
}

async function withDatabase(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-sync-"));
  const database = new LocalDatabaseService();
  try {
    database.initialize({ userDataPath: directory, appVersion: "1.0.0", profile: profile() });
    await callback(database, directory);
  } finally {
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("publica y consulta instantáneas con un transporte simulado", async () => {
  await withDatabase(async (database, directory) => {
    const calls = [];
    const fakeFetch = async (url, options = {}) => {
      calls.push({ url, method: options.method || "GET" });
      if ((options.method || "GET") === "PATCH") {
        return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
      }
      return { ok: true, status: 200, json: async () => ({ documents: [] }), text: async () => "" };
    };

    const sync = new FirebaseSyncService({
      databaseService: database,
      userDataPath: directory,
      fetchImpl: fakeFetch,
      config: { apiKey: "test", projectId: "project-test", collection: "devices" }
    });

    const result = await sync.syncNow(profile(), "1.0.0");
    assert.equal(result.ok, true);
    assert.equal(result.status.status, "ready");
    assert.equal(calls.some((call) => call.method === "PATCH"), true);
    assert.equal(calls.some((call) => call.method === "GET"), true);
  });
});
