/* =========================================================
Nombre completo: backups.test.js
Ruta o ubicación: /tests/backups.test.js
Función o funciones:
- Verificar la creación de un respaldo consistente.
- Confirmar su integridad, checksum y versión del esquema.
- Comprobar el respaldo automático diario.
- Rechazar nombres de archivo externos o inseguros.
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const {
  BackupService,
  parseBackupName,
  secureBackupPath
} = require("../app/main/backups/backup-service");

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-backups-"));

  try {
    await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function profile() {
  return {
    id: "jefferson",
    displayName: "Jefferson",
    channelId: "tienda-virtual",
    channelName: "Tienda virtual",
    role: "administrator",
    deviceId: "device-backup-001",
    configuredAt: new Date().toISOString()
  };
}

test("crea y verifica un respaldo manual de SQLite", async () => {
  await withTempDirectory(async (directory) => {
    const database = new LocalDatabaseService();
    database.initialize({
      userDataPath: directory,
      appVersion: "1.0.0",
      profile: profile()
    });

    const service = new BackupService({
      userDataPath: directory,
      databaseService: database,
      appVersion: "1.0.0"
    });
    const backup = await service.create("manual");

    assert.equal(backup.healthy, true);
    assert.equal(backup.kind, "manual");
    assert.equal(backup.schemaVersion, 5);
    assert.ok(backup.tableCount >= 21);
    assert.match(backup.checksumSha256, /^[a-f0-9]{64}$/);
    assert.equal(parseBackupName(backup.fileName).kind, "manual");

    const summary = await service.getSummary();
    assert.equal(summary.totalCount, 1);
    assert.equal(summary.manualCount, 1);
    assert.equal(summary.latest.fileName, backup.fileName);

    const verification = await service.verify(backup.fileName);
    assert.equal(verification.healthy, true);
    assert.equal(verification.schemaVersion, 5);
    assert.equal(verification.checksumSha256, backup.checksumSha256);
    database.close();
  });
});

test("crea un automático y evita repetirlo durante el mismo día", async () => {
  await withTempDirectory(async (directory) => {
    const database = new LocalDatabaseService();
    database.initialize({
      userDataPath: directory,
      appVersion: "1.0.0",
      profile: profile()
    });

    const service = new BackupService({
      userDataPath: directory,
      databaseService: database,
      appVersion: "1.0.0"
    });
    const first = await service.maybeCreateAutomatic();
    const second = await service.maybeCreateAutomatic();

    assert.equal(first.created, true);
    assert.equal(first.backup.healthy, true);
    assert.equal(second.created, false);
    assert.equal(second.reason, "recent_backup_exists");
    assert.equal((await service.getSummary()).automaticCount, 1);
    database.close();
  });
});

test("rechaza rutas externas y nombres manipulados", () => {
  assert.throws(
    () => secureBackupPath("/tmp/backups", "../base.sqlite3"),
    (error) => error.code === "BACKUP_FILE_INVALID"
  );

  assert.throws(
    () => secureBackupPath("/tmp/backups", "archivo-ajeno.sqlite3"),
    (error) => error.code === "BACKUP_FILE_INVALID"
  );
});
