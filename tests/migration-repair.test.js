/* =========================================================
Nombre completo: migration-repair.test.js
Ruta o ubicación: /tests/migration-repair.test.js
Función o funciones:
- Verificar la reparación segura del checksum legado de la migración 4.
- Confirmar que la migración 5 se aplique después de reparar los metadatos.
- Impedir la reparación cuando falta parte del esquema esperado.
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const { openLocalDatabase } = require("../app/main/database/connection");
const { MIGRATIONS } = require("../app/main/database/migrations");
const { runMigrations } = require("../app/main/database/migration-runner");

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-migration-repair-"));
  try {
    await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function profile() {
  return {
    id: "edgar",
    displayName: "Edgar",
    channelId: "local-edgar",
    channelName: "Local de Edgar",
    role: "operator",
    deviceId: "device-migration-repair-001",
    configuredAt: new Date().toISOString()
  };
}

function createLegacySchemaFour(directory) {
  const opened = openLocalDatabase(directory);
  runMigrations(
    opened.database,
    MIGRATIONS.filter((migration) => migration.version <= 4)
  );
  opened.database
    .prepare("UPDATE schema_migrations SET checksum = ? WHERE version = 4")
    .run("checksum-legado-por-formato");
  opened.database.close();
}

test("repara el checksum legado de la migración 4 y aplica la migración 6", async () => {
  await withTempDirectory(async (directory) => {
    createLegacySchemaFour(directory);

    const service = new LocalDatabaseService();
    const summary = service.initialize({
      userDataPath: directory,
      appVersion: "1.0.0",
      profile: profile()
    });

    assert.equal(summary.healthy, true);
    assert.equal(summary.schemaVersion, 6);
    assert.deepEqual(service.migrationResult.repaired, [4]);
    assert.deepEqual(service.migrationResult.newlyApplied, [5]);

    const migration = service.database
      .prepare("SELECT checksum FROM schema_migrations WHERE version = 4")
      .get();
    assert.notEqual(migration.checksum, "checksum-legado-por-formato");
    assert.ok(
      service.database
        .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = 'product_prices'")
        .get()
    );
    service.close();
  });
});

test("no repara el checksum cuando falta un índice de la migración 4", async () => {
  await withTempDirectory(async (directory) => {
    createLegacySchemaFour(directory);

    const opened = openLocalDatabase(directory);
    opened.database.exec("DROP INDEX idx_product_photos_sync");
    opened.database.close();

    const service = new LocalDatabaseService();
    assert.throws(
      () => service.initialize({ userDataPath: directory, appVersion: "1.0.0", profile: profile() }),
      (error) => error.code === "MIGRATION_CHECKSUM_MISMATCH"
    );
    service.close();
  });
});
