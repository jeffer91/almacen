/* =========================================================
Nombre completo: main.js
Ruta o ubicación: /app/main/main.js
Función o funciones:
- Iniciar la aplicación Electron.
- Crear y proteger la ventana principal.
- Exponer operaciones seguras mediante IPC.
- Leer y guardar el perfil fijo de cada computadora.
- Gestionar el acceso administrativo protegido y su sesión temporal.
- Inicializar, probar y cerrar correctamente la base local SQLite.
- Aplicar y guardar preferencias visuales y del equipo.
- Ejecutar y consultar diagnósticos de aplicación y pantallas.
- Coordinar y exponer el estado verificado del arranque.
========================================================= */

"use strict";

const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { PROFILES, readProfile, saveProfile } = require("./profile-store");
const {
  createAdminCredential,
  isAdminConfigured,
  verifyAdminPassword
} = require("./admin-auth-store");
const { AdminSessionManager } = require("./admin-session");
const { LocalDatabaseService } = require("./database/local-database-service");
const { DiagnosticsService } = require("./diagnostics/diagnostics-service");
const { inspectStartup } = require("./startup/startup-service");
const {
  defaultsForProfile,
  getDevicePreferences,
  saveDevicePreferences,
  saveTextSize
} = require("./device-preferences");

let mainWindow = null;
let startupReport = null;

const adminSession = new AdminSessionManager();
const localDatabase = new LocalDatabaseService();
const diagnostics = new DiagnosticsService(localDatabase);

function success(data = {}) {
  return { ok: true, ...data };
}

function failure(code, message, data = {}) {
  return { ok: false, code, message, ...data };
}

async function refreshStartupReport() {
  startupReport = await inspectStartup({
    userDataPath: app.getPath("userData"),
    appVersion: app.getVersion(),
    databaseService: localDatabase
  });

  return startupReport;
}

async function initializeLocalDatabase(profile = null) {
  try {
    return localDatabase.initialize({
      userDataPath: app.getPath("userData"),
      appVersion: app.getVersion(),
      profile
    });
  } catch (error) {
    console.error("No fue posible iniciar la base local:", error);
    return localDatabase.getSummary();
  }
}

function currentPreferences(profile) {
  try {
    return getDevicePreferences(localDatabase, profile);
  } catch (error) {
    console.error("No fue posible leer las preferencias del equipo:", error);
    return defaultsForProfile(profile);
  }
}

function applyWindowPreferences(preferences) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (preferences?.startMaximized) {
    mainWindow.maximize();
  } else if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  }
}

function windowState() {
  const available = Boolean(mainWindow && !mainWindow.isDestroyed());

  return {
    available,
    visible: available ? mainWindow.isVisible() : false,
    focused: available ? mainWindow.isFocused() : false,
    maximized: available ? mainWindow.isMaximized() : false
  };
}

async function buildAdminStatus() {
  const userDataPath = app.getPath("userData");
  const profile = await readProfile(userDataPath);

  try {
    const configured = await isAdminConfigured(userDataPath);

    return {
      configured,
      canInitialize: profile?.id === "jefferson",
      profileId: profile?.id || null,
      profileName: profile?.displayName || null,
      ...adminSession.getStatus()
    };
  } catch (error) {
    console.error("No fue posible obtener el estado administrativo:", error);

    return {
      configured: false,
      canInitialize: false,
      profileId: profile?.id || null,
      profileName: profile?.displayName || null,
      authDataError: true,
      authDataErrorMessage: error.message,
      ...adminSession.logout()
    };
  }
}

function createMainWindow(preferences = null) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f7f8fb",
    title: "Almacén Familiar",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: process.env.NODE_ENV === "development"
    }
  });

  mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));

  mainWindow.once("ready-to-show", () => {
    applyWindowPreferences(preferences);
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) {
      shell.openExternal(url).catch((error) => {
        console.error("No fue posible abrir el enlace externo:", error);
      });
    }

    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL();
    if (currentUrl && url !== currentUrl) {
      event.preventDefault();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
    adminSession.logout();
  });
}

function registerIpcHandlers() {
  ipcMain.handle("app:get-info", () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  }));

  ipcMain.handle("startup:get-state", async () => {
    if (!startupReport) {
      await refreshStartupReport();
    }

    return success({ startup: startupReport });
  });

  ipcMain.handle("profile:list", () => Object.values(PROFILES));

  ipcMain.handle("profile:get", async () => {
    return readProfile(app.getPath("userData"));
  });

  ipcMain.handle("profile:save", async (_event, profileId) => {
    const profile = await saveProfile(app.getPath("userData"), profileId);

    try {
      if (!localDatabase.getSummary().initialized) {
        await initializeLocalDatabase(profile);
      } else {
        localDatabase.registerDeviceProfile(profile, app.getVersion());
      }

      currentPreferences(profile);
      await refreshStartupReport();
    } catch (error) {
      console.error("El perfil se guardó, pero no pudo registrarse en la base local:", error);
    }

    return profile;
  });

  ipcMain.handle("device:get-preferences", async () => {
    const profile = await readProfile(app.getPath("userData"));

    if (!profile) {
      return failure(
        "PROFILE_REQUIRED",
        "Primero debes elegir quién utilizará esta computadora."
      );
    }

    return success({
      preferences: currentPreferences(profile),
      device: {
        id: profile.deviceId,
        systemName: os.hostname(),
        platform: process.platform,
        profileId: profile.id,
        profileName: profile.displayName,
        channelName: profile.channelName
      }
    });
  });

  ipcMain.handle("device:set-text-size", async (_event, textSize) => {
    const profile = await readProfile(app.getPath("userData"));

    if (!profile) {
      return failure(
        "PROFILE_REQUIRED",
        "Primero debes elegir quién utilizará esta computadora."
      );
    }

    try {
      const preferences = saveTextSize(localDatabase, profile, textSize);
      return success({ preferences });
    } catch (error) {
      console.error("No fue posible guardar el tamaño de letra:", error);
      return failure(
        error.code || "PREFERENCES_SAVE_FAILED",
        error.message || "No se pudo guardar el tamaño de letra."
      );
    }
  });

  ipcMain.handle("device:update-preferences", async (_event, preferences) => {
    if (!adminSession.isUnlocked()) {
      return failure(
        "ADMIN_SESSION_REQUIRED",
        "La sesión administrativa terminó. Ingresa nuevamente.",
        { status: await buildAdminStatus() }
      );
    }

    const profile = await readProfile(app.getPath("userData"));

    if (!profile) {
      return failure(
        "PROFILE_REQUIRED",
        "Este equipo todavía no tiene un perfil configurado.",
        { status: await buildAdminStatus() }
      );
    }

    try {
      const saved = saveDevicePreferences(localDatabase, profile, preferences);
      applyWindowPreferences(saved);
      adminSession.touch();

      if (startupReport) {
        startupReport = { ...startupReport, preferences: saved };
      }

      return success({
        preferences: saved,
        device: {
          id: profile.deviceId,
          systemName: os.hostname(),
          platform: process.platform,
          profileId: profile.id,
          profileName: profile.displayName,
          channelName: profile.channelName
        },
        status: await buildAdminStatus()
      });
    } catch (error) {
      console.error("No fue posible guardar la configuración del equipo:", error);
      return failure(
        error.code || "PREFERENCES_SAVE_FAILED",
        error.message || "No se pudo guardar la configuración del equipo.",
        { status: await buildAdminStatus() }
      );
    }
  });

  ipcMain.handle("database:get-summary", () => {
    return success({ database: localDatabase.getSummary() });
  });

  ipcMain.handle("database:run-diagnostic", async () => {
    if (!adminSession.isUnlocked()) {
      return failure(
        "ADMIN_SESSION_REQUIRED",
        "La sesión administrativa terminó. Ingresa nuevamente.",
        { status: await buildAdminStatus() }
      );
    }

    try {
      const diagnostic = localDatabase.runDiagnostic();
      adminSession.touch();
      return success({
        diagnostic,
        database: localDatabase.getAdminStatus(),
        status: await buildAdminStatus()
      });
    } catch (error) {
      console.error("No fue posible probar la base local:", error);
      return failure(
        error.code || "DATABASE_DIAGNOSTIC_FAILED",
        error.message || "No se pudo probar la base local.",
        {
          database: localDatabase.getAdminStatus(),
          status: await buildAdminStatus()
        }
      );
    }
  });

  ipcMain.handle("diagnostics:report-screens", (_event, reports) => {
    try {
      const saved = diagnostics.reportScreens(reports);
      return success({ savedCount: saved.length });
    } catch (error) {
      console.error("No fue posible guardar el reporte de pantallas:", error);
      return failure(
        error.code || "SCREEN_REPORT_FAILED",
        error.message || "No se pudo guardar el reporte de pantallas."
      );
    }
  });

  ipcMain.handle("diagnostics:get-summary", async () => {
    if (!adminSession.isUnlocked()) {
      return failure(
        "ADMIN_SESSION_REQUIRED",
        "La sesión administrativa terminó. Ingresa nuevamente.",
        { status: await buildAdminStatus() }
      );
    }

    try {
      return success({
        diagnostics: diagnostics.getSummary(),
        status: await buildAdminStatus()
      });
    } catch (error) {
      console.error("No fue posible leer los diagnósticos:", error);
      return failure(
        error.code || "DIAGNOSTICS_READ_FAILED",
        error.message || "No se pudieron leer los diagnósticos.",
        { status: await buildAdminStatus() }
      );
    }
  });

  ipcMain.handle("diagnostics:run", async () => {
    if (!adminSession.isUnlocked()) {
      return failure(
        "ADMIN_SESSION_REQUIRED",
        "La sesión administrativa terminó. Ingresa nuevamente.",
        { status: await buildAdminStatus() }
      );
    }

    try {
      const profile = await readProfile(app.getPath("userData"));
      const preferences = currentPreferences(profile);
      const result = diagnostics.run({
        appVersion: app.getVersion(),
        profile,
        preferences,
        windowState: windowState()
      });
      adminSession.touch();

      return success({
        result,
        diagnostics: diagnostics.getSummary(),
        database: localDatabase.getAdminStatus(),
        status: await buildAdminStatus()
      });
    } catch (error) {
      console.error("No fue posible ejecutar el diagnóstico general:", error);
      return failure(
        error.code || "DIAGNOSTICS_RUN_FAILED",
        error.message || "No se pudo ejecutar el diagnóstico general.",
        { status: await buildAdminStatus() }
      );
    }
  });

  ipcMain.handle("admin:get-status", async () => {
    return success({ status: await buildAdminStatus() });
  });

  ipcMain.handle("admin:setup", async (_event, payload = {}) => {
    const userDataPath = app.getPath("userData");
    const profile = await readProfile(userDataPath);
    const status = await buildAdminStatus();

    if (!profile) {
      return failure(
        "PROFILE_REQUIRED",
        "Primero debes elegir quién utilizará esta computadora.",
        { status }
      );
    }

    if (profile.id !== "jefferson") {
      return failure(
        "SETUP_NOT_ALLOWED",
        "La contraseña administrativa inicial solo puede configurarse desde el perfil de Jefferson.",
        { status }
      );
    }

    if (status.configured) {
      return failure(
        "AUTH_ALREADY_CONFIGURED",
        "La contraseña administrativa ya está configurada en este equipo.",
        { status }
      );
    }

    if (payload.password !== payload.confirmation) {
      return failure(
        "PASSWORDS_DO_NOT_MATCH",
        "Las contraseñas no coinciden.",
        { status }
      );
    }

    try {
      await createAdminCredential(userDataPath, payload.password);
      adminSession.registerSuccessfulLogin();
      return success({ status: await buildAdminStatus() });
    } catch (error) {
      console.error("No fue posible configurar la contraseña administrativa:", error);
      return failure(
        error.code || "AUTH_SETUP_FAILED",
        error.message || "No se pudo configurar la contraseña administrativa.",
        { status: await buildAdminStatus() }
      );
    }
  });

  ipcMain.handle("admin:login", async (_event, password) => {
    const userDataPath = app.getPath("userData");
    const statusBefore = await buildAdminStatus();

    if (statusBefore.authDataError) {
      return failure(
        "AUTH_DATA_INVALID",
        statusBefore.authDataErrorMessage || "La configuración administrativa está dañada.",
        { status: statusBefore }
      );
    }

    if (!statusBefore.configured) {
      return failure(
        "AUTH_NOT_CONFIGURED",
        "La contraseña administrativa todavía no está configurada en este equipo.",
        { status: statusBefore }
      );
    }

    if (statusBefore.locked) {
      return failure(
        "AUTH_TEMPORARILY_LOCKED",
        "El acceso está bloqueado temporalmente por varios intentos incorrectos.",
        { status: statusBefore }
      );
    }

    try {
      const valid = await verifyAdminPassword(userDataPath, password);

      if (!valid) {
        const sessionStatus = adminSession.registerFailedLogin();
        const status = await buildAdminStatus();

        return failure(
          sessionStatus.locked ? "AUTH_TEMPORARILY_LOCKED" : "INVALID_PASSWORD",
          sessionStatus.locked
            ? "El acceso fue bloqueado temporalmente por varios intentos incorrectos."
            : "La contraseña no es correcta.",
          { status }
        );
      }

      adminSession.registerSuccessfulLogin();
      return success({ status: await buildAdminStatus() });
    } catch (error) {
      console.error("No fue posible verificar la contraseña administrativa:", error);
      return failure(
        error.code || "AUTH_LOGIN_FAILED",
        error.message || "No se pudo verificar la contraseña.",
        { status: await buildAdminStatus() }
      );
    }
  });

  ipcMain.handle("admin:touch", async () => {
    return success({
      status: {
        ...(await buildAdminStatus()),
        ...adminSession.touch()
      }
    });
  });

  ipcMain.handle("admin:logout", async () => {
    adminSession.logout();
    return success({ status: await buildAdminStatus() });
  });

  ipcMain.handle("admin:get-dashboard", async () => {
    if (!adminSession.isUnlocked()) {
      return failure(
        "ADMIN_SESSION_REQUIRED",
        "La sesión administrativa terminó. Ingresa nuevamente.",
        { status: await buildAdminStatus() }
      );
    }

    const profile = await readProfile(app.getPath("userData"));
    const sessionStatus = adminSession.touch();
    const preferences = currentPreferences(profile);
    let diagnosticSummary = null;

    try {
      diagnosticSummary = diagnostics.getSummary();
    } catch (error) {
      console.error("No fue posible leer el resumen de diagnóstico:", error);
    }

    return success({
      dashboard: {
        appName: app.getName(),
        appVersion: app.getVersion(),
        deviceName: preferences.friendlyName,
        systemDeviceName: os.hostname(),
        platform: process.platform,
        profile,
        preferences,
        startup: startupReport,
        session: sessionStatus,
        database: localDatabase.getAdminStatus(),
        diagnostics: diagnosticSummary,
        modules: {
          startup: startupReport?.status === "ready" ? "ready" : "attention",
          localDatabase: localDatabase.getSummary().healthy ? "ready" : "attention",
          devicePreferences: "ready",
          synchronization: "pending",
          diagnostics: diagnosticSummary?.latest ? "ready" : "attention"
        }
      },
      status: await buildAdminStatus()
    });
  });
}

app.whenReady().then(async () => {
  await refreshStartupReport();
  registerIpcHandlers();
  createMainWindow(startupReport?.preferences || defaultsForProfile(null));

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await refreshStartupReport();
      createMainWindow(startupReport?.preferences || defaultsForProfile(null));
    }
  });
});

app.on("before-quit", () => {
  localDatabase.close();
});

app.on("window-all-closed", () => {
  adminSession.logout();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("uncaughtException", (error) => {
  console.error("Error no controlado en el proceso principal:", error);
});

process.on("unhandledRejection", (reason) => {
  console.error("Promesa rechazada sin controlar:", reason);
});
