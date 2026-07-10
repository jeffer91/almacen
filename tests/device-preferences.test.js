/* =========================================================
Nombre completo: device-preferences.test.js
Ruta o ubicación: /tests/device-preferences.test.js
Función o funciones:
- Verificar valores predeterminados por perfil.
- Confirmar la validación de tamaños y nombres.
- Comprobar persistencia en la base local.
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const {
  defaultsForProfile,
  normalizePreferences,
  getDevicePreferences,
  saveDevicePreferences,
  saveTextSize
} = require("../app/main/device-preferences");

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-preferences-"));

  try {
    await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function profile(id = "gloria") {
  const names = {
    edgar: "Edgar",
    gloria: "Gloria",
    jefferson: "Jefferson"
  };
  const channels = {
    edgar: ["local-edgar", "Local de Edgar"],
    gloria: ["local-gloria", "Local de Gloria"],
    jefferson: ["tienda-virtual", "Tienda virtual"]
  };

  return {
    id,
    displayName: names[id],
    channelId: channels[id][0],
    channelName: channels[id][1],
    role: id === "jefferson" ? "administrator" : "operator",
    deviceId: `device-${id}`,
    configuredAt: new Date().toISOString()
  };
}

test("Edgar y Gloria reciben letra grande y movimiento reducido", () => {
  const gloria = defaultsForProfile(profile("gloria"));
  const jefferson = defaultsForProfile(profile("jefferson"));

  assert.equal(gloria.textSize, "large");
  assert.equal(gloria.reducedMotion, true);
  assert.equal(gloria.friendlyName, "Computadora de Gloria");
  assert.equal(jefferson.textSize, "normal");
  assert.equal(jefferson.reducedMotion, false);
});

test("normaliza valores desconocidos y limita el nombre del equipo", () => {
  const normalized = normalizePreferences(
    {
      friendlyName: "   Computadora    principal   ",
      textSize: "gigante",
      highContrast: "sí",
      reducedMotion: true,
      startMaximized: false
    },
    profile("edgar")
  );

  assert.equal(normalized.friendlyName, "Computadora principal");
  assert.equal(normalized.textSize, "large");
  assert.equal(normalized.highContrast, false);
  assert.equal(normalized.reducedMotion, true);
  assert.equal(normalized.startMaximized, false);
});

test("guarda y recupera las preferencias desde SQLite", async () => {
  await withTempDirectory(async (directory) => {
    const service = new LocalDatabaseService();
    const currentProfile = profile("gloria");

    service.initialize({
      userDataPath: directory,
      appVersion: "0.4.0",
      profile: currentProfile
    });

    const initial = getDevicePreferences(service, currentProfile);
    assert.equal(initial.textSize, "large");

    const saved = saveDevicePreferences(service, currentProfile, {
      friendlyName: "Caja de Gloria",
      textSize: "xlarge",
      highContrast: true,
      reducedMotion: true,
      startMaximized: true
    });

    assert.equal(saved.friendlyName, "Caja de Gloria");
    assert.equal(saved.highContrast, true);

    const textChanged = saveTextSize(service, currentProfile, "normal");
    assert.equal(textChanged.textSize, "normal");
    assert.equal(textChanged.friendlyName, "Caja de Gloria");

    service.close();
  });
});
