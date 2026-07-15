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

test("repara el checksum legado de la migración 4 y conserva la base", async () => {
  await withTempDirectory(async (directory) => {
    const first = new LocalDatabaseService();
    first.initialize({ userDataPath: directory, appVersion: "1.0.0", profile: profile() });
    first.close();

    const opened = openLocalDatabase(directory);
    opened.database
      .prepare("UPDATE schema_migrations SET checksum = ? WHERE version = 4")
      .run("checksum-legado-por-formato");
    opened.database.close();

    const second = new LocalDatabaseService();
    const summary = second.initialize({
      userDataPath: directory,
      appVersion: "1.0.0",
      profile: profile()
    });

    assert.equal(summary.healthy, true);
    assert.equal(summary.schemaVersion, 5);
    assert.deepEqual(second.migrationResult.repaired, [4]);

    const migration = second.database
      .prepare("SELECT checksum FROM schema_migrations WHERE version = 4")
      .get();
    assert.notEqual(migration.checksum, "checksum-legado-por-formato");
    second.close();
  });
});

test("no repara el checksum cuando falta un índice de la migración 4", async () => {
  await withTempDirectory(async (directory) => {
    const first = new LocalDatabaseService();
    first.initialize({ userDataPath: directory, appVersion: "1.0.0", profile: profile() });
    first.close();

    const opened = openLocalDatabase(directory);
    opened.database.exec("DROP INDEX idx_product_photos_sync");
    opened.database
      .prepare("UPDATE schema_migrations SET checksum = ? WHERE version = 4")
      .run("checksum-invalido-con-esquema-incompleto");
    opened.database.close();

    const second = new LocalDatabaseService();
    assert.throws(
      () => second.initialize({ userDataPath: directory, appVersion: "1.0.0", profile: profile() }),
      (error) => error.code === "MIGRATION_CHECKSUM_MISMATCH"
    );
    second.close();
  });
});
