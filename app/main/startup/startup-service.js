/* =========================================================
Nombre completo: startup-service.js
Ruta o ubicación: /app/main/startup/startup-service.js
Función o funciones:
- Coordinar la lectura del perfil durante el arranque.
- Inicializar la base local antes de abrir la interfaz.
- Determinar si debe mostrarse configuración inicial o inicio.
- Registrar advertencias recuperables sin impedir que la app abra.
========================================================= */

"use strict";

const { inspectProfile } = require("../profile-store");
const { defaultsForProfile, getDevicePreferences } = require("../device-preferences");

function createStartupResult({
  startedAt,
  profileState,
  databaseSummary,
  preferences,
  warnings,
  completedAt
}) {
  const validProfile = profileState.status === "valid";
  const databaseReady = Boolean(databaseSummary?.initialized);
  const databaseHealthy = Boolean(databaseSummary?.healthy);

  return {
    status: databaseReady ? (warnings.length > 0 || !databaseHealthy ? "warning" : "ready") : "error",
    targetScreen: validProfile ? "home" : "setup",
    needsProfileSelection: !validProfile,
    profileStatus: profileState.status,
    profile: validProfile ? profileState.profile : null,
    profileIssue: profileState.status === "invalid" ? profileState.issue : null,
    database: databaseSummary,
    preferences,
    warnings,
    startedAt,
    completedAt,
    durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime())
  };
}

async function inspectStartup({ userDataPath, appVersion, databaseService }) {
  const startedAt = new Date().toISOString();
  const warnings = [];
  const profileState = await inspectProfile(userDataPath);
  const profile = profileState.status === "valid" ? profileState.profile : null;

  if (profileState.status === "invalid") {
    warnings.push({
      code: "PROFILE_REQUIRES_RECONFIGURATION",
      message: "La configuración del perfil está dañada y debe seleccionarse nuevamente."
    });
  }

  let databaseSummary;

  try {
    databaseSummary = databaseService.initialize({
      userDataPath,
      appVersion,
      profile
    });
  } catch (error) {
    databaseSummary = databaseService.getSummary();
    warnings.push({
      code: error.code || "DATABASE_STARTUP_FAILED",
      message: error.message || "No se pudo iniciar la base local."
    });
  }

  let preferences = defaultsForProfile(profile);

  if (profile && databaseSummary?.initialized) {
    try {
      preferences = getDevicePreferences(databaseService, profile);
    } catch (error) {
      warnings.push({
        code: error.code || "PREFERENCES_STARTUP_FAILED",
        message: error.message || "Se usarán preferencias visuales predeterminadas."
      });
    }
  }

  return createStartupResult({
    startedAt,
    profileState,
    databaseSummary,
    preferences,
    warnings,
    completedAt: new Date().toISOString()
  });
}

module.exports = {
  createStartupResult,
  inspectStartup
};
