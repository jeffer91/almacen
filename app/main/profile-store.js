/* =========================================================
Nombre completo: profile-store.js
Ruta o ubicación: /app/main/profile-store.js
Función o funciones:
- Guardar el perfil asignado a cada computadora.
- Leer la configuración local de forma segura.
- Validar que solo se utilicen los perfiles autorizados.
- Conservar un identificador único por instalación.
========================================================= */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const CONFIG_VERSION = 1;
const FILE_NAME = "device-profile.json";

const PROFILES = Object.freeze({
  edgar: Object.freeze({
    id: "edgar",
    displayName: "Edgar",
    channelId: "local-edgar",
    channelName: "Local de Edgar",
    role: "operator"
  }),
  gloria: Object.freeze({
    id: "gloria",
    displayName: "Gloria",
    channelId: "local-gloria",
    channelName: "Local de Gloria",
    role: "operator"
  }),
  jefferson: Object.freeze({
    id: "jefferson",
    displayName: "Jefferson",
    channelId: "tienda-virtual",
    channelName: "Tienda virtual",
    role: "administrator"
  })
});

function buildFilePath(userDataPath) {
  return path.join(userDataPath, FILE_NAME);
}

function publicProfile(profileId) {
  return PROFILES[profileId] ? { ...PROFILES[profileId] } : null;
}

async function readProfile(userDataPath) {
  const filePath = buildFilePath(userDataPath);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    const stored = JSON.parse(raw);
    const profile = publicProfile(stored.profileId);

    if (!profile || stored.configVersion !== CONFIG_VERSION) {
      return null;
    }

    return {
      ...profile,
      deviceId: stored.deviceId,
      configuredAt: stored.configuredAt,
      updatedAt: stored.updatedAt
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return null;
    }

    console.error("No fue posible leer el perfil local:", error);
    return null;
  }
}

async function saveProfile(userDataPath, profileId) {
  const profile = publicProfile(profileId);

  if (!profile) {
    throw new Error("El perfil seleccionado no es válido.");
  }

  await fs.mkdir(userDataPath, { recursive: true });

  const current = await readProfile(userDataPath);
  const now = new Date().toISOString();
  const payload = {
    configVersion: CONFIG_VERSION,
    profileId: profile.id,
    deviceId: current?.deviceId || crypto.randomUUID(),
    configuredAt: current?.configuredAt || now,
    updatedAt: now
  };

  const filePath = buildFilePath(userDataPath);
  const temporaryPath = `${filePath}.tmp`;

  await fs.writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);

  return {
    ...profile,
    deviceId: payload.deviceId,
    configuredAt: payload.configuredAt,
    updatedAt: payload.updatedAt
  };
}

module.exports = {
  PROFILES,
  readProfile,
  saveProfile
};
