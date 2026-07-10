/* =========================================================
Nombre completo: device-preferences.js
Ruta o ubicación: /app/main/device-preferences.js
Función o funciones:
- Definir preferencias visuales y del equipo.
- Aplicar valores predeterminados según el perfil asignado.
- Validar los cambios antes de guardarlos en SQLite.
- Permitir cambiar únicamente el tamaño de letra sin acceso administrativo.
========================================================= */

"use strict";

const SETTINGS_KEY = "devicePreferences";
const TEXT_SIZES = Object.freeze(["normal", "large", "xlarge"]);
const MAX_FRIENDLY_NAME_LENGTH = 60;

function defaultFriendlyName(profile) {
  if (profile?.displayName) {
    return `Computadora de ${profile.displayName}`;
  }

  return "Computadora del almacén";
}

function defaultsForProfile(profile) {
  const simpleProfile = profile?.id === "edgar" || profile?.id === "gloria";

  return {
    friendlyName: defaultFriendlyName(profile),
    textSize: simpleProfile ? "large" : "normal",
    highContrast: false,
    reducedMotion: simpleProfile,
    startMaximized: true
  };
}

function normalizeBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeFriendlyName(value, fallback) {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, MAX_FRIENDLY_NAME_LENGTH) : fallback;
}

function normalizePreferences(value, profile) {
  const defaults = defaultsForProfile(profile);
  const source = value && typeof value === "object" ? value : {};

  return {
    friendlyName: normalizeFriendlyName(source.friendlyName, defaults.friendlyName),
    textSize: TEXT_SIZES.includes(source.textSize) ? source.textSize : defaults.textSize,
    highContrast: normalizeBoolean(source.highContrast, defaults.highContrast),
    reducedMotion: normalizeBoolean(source.reducedMotion, defaults.reducedMotion),
    startMaximized: normalizeBoolean(source.startMaximized, defaults.startMaximized)
  };
}

function getDevicePreferences(databaseService, profile) {
  if (!profile?.deviceId || !databaseService?.getSummary().initialized) {
    return normalizePreferences(null, profile);
  }

  const stored = databaseService.getDeviceSetting(profile.deviceId, SETTINGS_KEY, null);
  const preferences = normalizePreferences(stored, profile);

  if (!stored) {
    databaseService.setDeviceSetting(profile.deviceId, SETTINGS_KEY, preferences);
  }

  return preferences;
}

function saveDevicePreferences(databaseService, profile, value) {
  if (!profile?.deviceId) {
    const error = new Error("El equipo todavía no tiene un perfil configurado.");
    error.code = "DEVICE_PROFILE_REQUIRED";
    throw error;
  }

  if (!databaseService?.getSummary().initialized) {
    const error = new Error("La base local todavía no está disponible.");
    error.code = "DATABASE_NOT_READY";
    throw error;
  }

  const preferences = normalizePreferences(value, profile);
  databaseService.setDeviceSetting(profile.deviceId, SETTINGS_KEY, preferences);
  return preferences;
}

function saveTextSize(databaseService, profile, textSize) {
  if (!TEXT_SIZES.includes(textSize)) {
    const error = new Error("El tamaño de letra seleccionado no es válido.");
    error.code = "INVALID_TEXT_SIZE";
    throw error;
  }

  const current = getDevicePreferences(databaseService, profile);
  return saveDevicePreferences(databaseService, profile, {
    ...current,
    textSize
  });
}

module.exports = {
  SETTINGS_KEY,
  TEXT_SIZES,
  MAX_FRIENDLY_NAME_LENGTH,
  defaultsForProfile,
  normalizePreferences,
  getDevicePreferences,
  saveDevicePreferences,
  saveTextSize
};
