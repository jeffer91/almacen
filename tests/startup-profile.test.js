/* =========================================================
Nombre completo: startup-profile.test.js
Ruta o ubicación: /tests/startup-profile.test.js
Función o funciones:
- Verificar el primer arranque sin perfil.
- Confirmar que un perfil válido abre la pantalla principal.
- Comprobar la persistencia del identificador del equipo.
- Impedir cambios de perfil sin autorización administrativa.
- Recuperar una configuración de perfil dañada sin perder evidencia.
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const { inspectStartup } = require("../app/main/startup/startup-service");
const {
  FILE_NAME,
  inspectProfile,
  readProfile,
  saveProfile
} = require("../app/main/profile-store");

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-startup-"));

  try {
    await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("el primer arranque abre configuración e inicializa SQLite", async () => {
  await withTempDirectory(async (directory) => {
    const database = new LocalDatabaseService();
    const startup = await inspectStartup({
      userDataPath: directory,
      appVersion: "0.9.0",
      databaseService: database
    });

    assert.equal(startup.targetScreen, "setup");
    assert.equal(startup.needsProfileSelection, true);
    assert.equal(startup.profileStatus, "missing");
    assert.equal(startup.database.initialized, true);
    assert.equal(startup.database.healthy, true);
    assert.equal(startup.database.schemaVersion, 4);
    database.close();
  });
});

test("un perfil guardado abre inicio con sus preferencias recomendadas", async () => {
  await withTempDirectory(async (directory) => {
    const saved = await saveProfile(directory, "gloria");
    const database = new LocalDatabaseService();
    const startup = await inspectStartup({
      userDataPath: directory,
      appVersion: "0.9.0",
      databaseService: database
    });

    assert.equal(startup.targetScreen, "home");
    assert.equal(startup.needsProfileSelection, false);
    assert.equal(startup.profileStatus, "valid");
    assert.equal(startup.profile.id, "gloria");
    assert.equal(startup.profile.deviceId, saved.deviceId);
    assert.equal(startup.preferences.textSize, "large");
    assert.equal(startup.preferences.reducedMotion, true);
    database.close();
  });
});

test("guardar el mismo perfil conserva el equipo y cambiarlo exige administración", async () => {
  await withTempDirectory(async (directory) => {
    const first = await saveProfile(directory, "edgar");
    const second = await saveProfile(directory, "edgar");

    assert.equal(second.deviceId, first.deviceId);
    assert.equal(second.configuredAt, first.configuredAt);

    await assert.rejects(
      saveProfile(directory, "gloria"),
      (error) => error.code === "PROFILE_CHANGE_REQUIRES_ADMIN"
    );

    const persisted = await readProfile(directory);
    assert.equal(persisted.id, "edgar");
    assert.equal(persisted.deviceId, first.deviceId);
  });
});

test("una configuración dañada se detecta, respalda y reemplaza", async () => {
  await withTempDirectory(async (directory) => {
    const filePath = path.join(directory, FILE_NAME);
    await fs.writeFile(filePath, "{ perfil dañado", "utf8");

    const invalid = await inspectProfile(directory);
    assert.equal(invalid.status, "invalid");
    assert.equal(invalid.issue.code, "PROFILE_JSON_INVALID");

    const database = new LocalDatabaseService();
    const startup = await inspectStartup({
      userDataPath: directory,
      appVersion: "0.9.0",
      databaseService: database
    });

    assert.equal(startup.targetScreen, "setup");
    assert.equal(startup.status, "warning");
    assert.equal(startup.warnings[0].code, "PROFILE_REQUIRES_RECONFIGURATION");
    database.close();

    const recovered = await saveProfile(directory, "jefferson");
    assert.equal(recovered.id, "jefferson");

    const files = await fs.readdir(directory);
    assert.equal(files.some((name) => name.startsWith(`${FILE_NAME}.invalid-`)), true);
    assert.equal((await inspectProfile(directory)).status, "valid");
  });
});
