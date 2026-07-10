/* =========================================================
Nombre completo: local-database.test.js
Ruta o ubicación: /tests/local-database.test.js
Función o funciones:
- Verificar la creación de la base local.
- Confirmar la aplicación de migraciones y datos iniciales.
- Comprobar el registro del equipo y su perfil.
- Validar persistencia de configuraciones y diagnóstico de integridad.
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-db-"));

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
    deviceId: "device-test-001",
    configuredAt: new Date().toISOString()
  };
}

test("crea la base, aplica migraciones y registra el dispositivo", async () => {
  await withTempDirectory(async (directory) => {
    const service = new LocalDatabaseService();
    const summary = service.initialize({
      userDataPath: directory,
      appVersion: "0.3.0",
      profile: profile()
    });

    assert.equal(summary.initialized, true);
    assert.equal(summary.healthy, true);
    assert.equal(summary.schemaVersion, 2);

    const device = service.getDevice("device-test-001");
    assert.equal(device.assigned_user_id, "jefferson");
    assert.equal(device.assigned_channel_id, "tienda-virtual");

    const diagnostic = service.runDiagnostic();
    assert.equal(diagnostic.healthy, true);
    assert.equal(diagnostic.counts.users, 3);
    assert.equal(diagnostic.counts.channels, 3);
    assert.equal(diagnostic.missingTables.length, 0);

    service.close();
  });
});

test("guarda configuración local y la conserva al reabrir", async () => {
  await withTempDirectory(async (directory) => {
    const first = new LocalDatabaseService();
    first.initialize({
      userDataPath: directory,
      appVersion: "0.3.0",
      profile: profile()
    });
    first.setDeviceSetting("device-test-001", "textScale", 1.25);
    first.close();

    const second = new LocalDatabaseService();
    const summary = second.initialize({
      userDataPath: directory,
      appVersion: "0.3.0",
      profile: profile()
    });

    assert.equal(summary.schemaVersion, 2);
    assert.equal(second.getDeviceSetting("device-test-001", "textScale"), 1.25);
    assert.equal(second.runDiagnostic().healthy, true);
    second.close();
  });
});
