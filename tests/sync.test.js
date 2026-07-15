/* =========================================================
Nombre completo: sync.test.js
Ruta o ubicación: /tests/sync.test.js
Función o funciones:
- Probar la sincronización Firebase con transporte simulado.
- Confirmar que el trabajo local no depende de una conexión real.
- Verificar la configuración predeterminada y el cierre de la cola de fotografías.
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
const { DEFAULT_CONFIG, FirebaseSyncService } = require("../app/main/sync/firebase-sync-service");

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

function successfulFetch(calls = []) {
  return async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET" });
    if ((options.method || "GET") === "PATCH") {
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    }
    return { ok: true, status: 200, json: async () => ({ documents: [] }), text: async () => "" };
  };
}

test("usa el proyecto Firebase correcto como configuración predeterminada", () => {
  assert.equal(DEFAULT_CONFIG.projectId, "almacen-59227");
  assert.equal(DEFAULT_CONFIG.collection, "almacen_familiar_devices");
  assert.equal(DEFAULT_CONFIG.apiKey, "AIzaSyAXO_u1O0-8NYQL6oM8GWBdcmr2_--9Dp8");
});

test("publica y consulta instantáneas con un transporte simulado", async () => {
  await withDatabase(async (database, directory) => {
    const calls = [];
    const sync = new FirebaseSyncService({
      databaseService: database,
      userDataPath: directory,
      fetchImpl: successfulFetch(calls),
      config: { apiKey: "test", projectId: "project-test", collection: "devices" }
    });

    const result = await sync.syncNow(profile(), "1.0.0");
    assert.equal(result.ok, true);
    assert.equal(result.status.status, "ready");
    assert.equal(calls.some((call) => call.method === "PATCH"), true);
    assert.equal(calls.some((call) => call.method === "GET"), true);
  });
});

test("completa la cola de una fotografía retirada después de publicar metadatos", async () => {
  await withDatabase(async (database, directory) => {
    const productId = "product-photo-sync";
    const photoId = "photo-retired-sync";
    const timestamp = new Date().toISOString();
    database.database.prepare(`INSERT INTO products (
      id, canonical_name, normalized_name, brand, category, description, notes, status, version,
      created_by_user_id, created_device_id, created_at, updated_by_user_id, updated_device_id, updated_at,
      retired_by_user_id, retired_device_id, retired_at, retirement_reason,
      restored_by_user_id, restored_device_id, restored_at
    ) VALUES (?, 'Producto foto', 'producto foto', NULL, NULL, NULL, NULL, 'active', 1,
      'jefferson', ?, ?, 'jefferson', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`).run(
      productId, profile().deviceId, timestamp, profile().deviceId, timestamp
    );
    database.database.prepare(`INSERT INTO product_photos (
      id, product_id, variant_id, owner_user_id, channel_id, device_id, local_path, file_name,
      mime_type, file_size_bytes, width_pixels, height_pixels, checksum_sha256,
      is_default_global, is_default_channel, status, sync_status, sync_error, replaces_photo_id,
      created_at, updated_at, hidden_at, retired_at
    ) VALUES (?, ?, NULL, 'jefferson', 'tienda-virtual', ?, 'remote://retirada.jpg', 'retirada.jpg',
      'image/jpeg', 100, NULL, NULL, NULL, 0, 0, 'retired', 'metadata_pending', NULL, NULL,
      ?, ?, NULL, ?)`).run(photoId, productId, profile().deviceId, timestamp, timestamp, timestamp);
    database.database.prepare(`INSERT INTO sync_queue (
      id, source_table, record_id, operation, target, payload_json, priority, attempts,
      next_attempt_at, last_error, created_at, updated_at, completed_at
    ) VALUES ('queue-retired-photo', 'product_photos', ?, 'archive', 'primary', '{}', 80, 0,
      NULL, NULL, ?, ?, NULL)`).run(photoId, timestamp, timestamp);

    const sync = new FirebaseSyncService({
      databaseService: database,
      userDataPath: directory,
      fetchImpl: successfulFetch(),
      config: { apiKey: "test", projectId: "project-test", collection: "devices" }
    });
    await sync.pushSnapshot(profile(), "1.0.0");

    const queue = database.database
      .prepare("SELECT completed_at, last_error FROM sync_queue WHERE id = 'queue-retired-photo'")
      .get();
    assert.ok(queue.completed_at);
    assert.equal(queue.last_error, null);
  });
});
