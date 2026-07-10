/* =========================================================
Nombre completo: profile-store.js
Ruta o ubicación: /app/main/profile-store.js
Función o funciones:
- Guardar el perfil asignado a cada computadora.
- Leer e inspeccionar la configuración local de forma segura.
- Validar que solo se utilicen los perfiles autorizados.
- Conservar un identificador único por instalación.
- Impedir cambios de perfil sin autorización administrativa.
- Respaldar configuraciones dañadas antes de reemplazarlas.
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

function createProfileError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function buildFilePath(userDataPath) {
  return path.join(userDataPath, FILE_NAME);
}

function publicProfile(profileId) {
  return PROFILES[profileId] ? { ...PROFILES[profileId] } : null;
}

function isIsoDate(value) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validateStoredProfile(stored) {
  if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
    return { valid: false, code: "PROFILE_DATA_INVALID", message: "El archivo no contiene un perfil válido." };
  }

  if (stored.configVersion !== CONFIG_VERSION) {
    return {
      valid: false,
      code: "PROFILE_VERSION_UNSUPPORTED",
      message: "La versión de la configuración del perfil no es compatible."
    };
  }

  if (!publicProfile(stored.profileId)) {
    return {
      valid: false,
      code: "PROFILE_ID_INVALID",
      message: "El usuario guardado no corresponde a un perfil autorizado."
    };
  }

  if (typeof stored.deviceId !== "string" || stored.deviceId.trim().length < 8) {
    return {
      valid: false,
      code: "DEVICE_ID_INVALID",
      message: "El identificador local del equipo no es válido."
    };
  }

  if (!isIsoDate(stored.configuredAt) || !isIsoDate(stored.updatedAt)) {
    return {
      valid: false,
      code: "PROFILE_DATE_INVALID",
      message: "Las fechas guardadas en la configuración no son válidas."
    };
  }

  return { valid: true };
}

async function inspectProfile(userDataPath) {
  const filePath = buildFilePath(userDataPath);

  try {
    const raw = await fs.readFile(filePath, "utf8");
    let stored;

    try {
      stored = JSON.parse(raw);
    } catch {
      return {
        status: "invalid",
        filePath,
        issue: {
          code: "PROFILE_JSON_INVALID",
          message: "La configuración del perfil no se puede interpretar."
        }
      };
    }

    const validation = validateStoredProfile(stored);

    if (!validation.valid) {
      return {
        status: "invalid",
        filePath,
        issue: {
          code: validation.code,
          message: validation.message
        }
      };
    }

    return {
      status: "valid",
      filePath,
      profile: {
        ...publicProfile(stored.profileId),
        deviceId: stored.deviceId,
        configuredAt: stored.configuredAt,
        updatedAt: stored.updatedAt
      }
    };
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return { status: "missing", filePath, profile: null };
    }

    return {
      status: "invalid",
      filePath,
      issue: {
        code: error.code || "PROFILE_READ_FAILED",
        message: "No fue posible leer la configuración local del perfil."
      }
    };
  }
}

async function readProfile(userDataPath) {
  const state = await inspectProfile(userDataPath);
  return state.status === "valid" ? state.profile : null;
}

function invalidBackupPath(filePath) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${filePath}.invalid-${stamp}.bak`;
}

async function backupInvalidProfile(state) {
  if (state?.status !== "invalid" || !state.filePath) {
    return null;
  }

  const backupPath = invalidBackupPath(state.filePath);

  try {
    await fs.rename(state.filePath, backupPath);
    return backupPath;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

async function replaceFileAtomically(filePath, payload) {
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  try {
    await fs.rename(temporaryPath, filePath);
  } catch (error) {
    if (error?.code !== "EEXIST" && error?.code !== "EPERM") {
      await fs.rm(temporaryPath, { force: true });
      throw error;
    }

    await fs.rm(filePath, { force: true });
    await fs.rename(temporaryPath, filePath);
  }
}

async function saveProfile(userDataPath, profileId, options = {}) {
  const profile = publicProfile(profileId);

  if (!profile) {
    throw createProfileError("PROFILE_ID_INVALID", "El perfil seleccionado no es válido.");
  }

  await fs.mkdir(userDataPath, { recursive: true });

  const state = await inspectProfile(userDataPath);
  const current = state.status === "valid" ? state.profile : null;
  const allowChange = options.allowChange === true;

  if (current && current.id !== profile.id && !allowChange) {
    throw createProfileError(
      "PROFILE_CHANGE_REQUIRES_ADMIN",
      "El perfil de esta computadora solo puede cambiarse desde Administración."
    );
  }

  if (state.status === "invalid") {
    await backupInvalidProfile(state);
  }

  const now = new Date().toISOString();
  const payload = {
    configVersion: CONFIG_VERSION,
    profileId: profile.id,
    deviceId: current?.deviceId || crypto.randomUUID(),
    configuredAt: current?.configuredAt || now,
    updatedAt: now
  };

  const filePath = buildFilePath(userDataPath);
  await replaceFileAtomically(filePath, payload);

  const verified = await inspectProfile(userDataPath);

  if (verified.status !== "valid" || verified.profile.id !== profile.id) {
    throw createProfileError(
      "PROFILE_WRITE_VERIFICATION_FAILED",
      "El perfil se escribió, pero no pudo verificarse correctamente."
    );
  }

  return verified.profile;
}

module.exports = {
  CONFIG_VERSION,
  FILE_NAME,
  PROFILES,
  backupInvalidProfile,
  buildFilePath,
  inspectProfile,
  publicProfile,
  readProfile,
  saveProfile,
  validateStoredProfile
};
