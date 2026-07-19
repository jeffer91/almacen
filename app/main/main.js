/* =========================================================
Nombre completo: main.js
Ruta o ubicación: /app/main/main.js
Función o funciones:
- Iniciar Electron y proteger la ventana principal.
- Gestionar perfiles, administración, SQLite, respaldos y diagnósticos.
- Conectar catálogo, proveedores, costos, precios, fotografías y recientes.
- Ejecutar sincronización local-first con Firebase.
Con qué se conecta:
- app/preload/preload.js
- app/main/database/*
- app/main/catalog/*
- app/main/sync/firebase-sync-service.js
========================================================= */

"use strict";

const os = require("node:os");
const path = require("node:path");
const {
  app,
  BrowserWindow,
  ipcMain,
  shell,
  dialog,
  nativeImage,
  safeStorage
} = require("electron");
const { PROFILES, readProfile, saveProfile } = require("./profile-store");
const {
  createAdminCredential,
  isAdminConfigured,
  verifyAdminPassword
} = require("./admin-auth-store");
const { AdminSessionManager } = require("./admin-session");
const { LocalDatabaseService } = require("./database/local-database-service");
const { DiagnosticsService } = require("./diagnostics/diagnostics-service");
const { BackupService } = require("./backups/backup-service");
const { inspectStartup } = require("./startup/startup-service");
const { CatalogService } = require("./catalog/catalog-service");
const { CommerceService } = require("./catalog/commerce-service");
const { ProductEntryService } = require("./catalog/product-entry-service");
const { PhotoStorageService } = require("./catalog/photo-storage-service");
const { FirebaseSyncService } = require("./sync/firebase-sync-service");
const { ConnectionConfigService } = require("./connections/connection-config-service");
const {
  defaultsForProfile,
  getDevicePreferences,
  saveDevicePreferences,
  saveTextSize
} = require("./device-preferences");

let mainWindow = null;
let startupReport = null;
let backupService = null;
let photoStorageService = null;
let connectionConfigService = null;
let syncService = null;
let automaticSyncTimer = null;

const adminSession = new AdminSessionManager();
const localDatabase = new LocalDatabaseService();
const diagnostics = new DiagnosticsService(localDatabase);
const catalog = new CatalogService(localDatabase);
const commerce = new CommerceService(localDatabase);
const productEntry = new ProductEntryService(localDatabase, catalog, commerce);

const PROFILE_TESTING_ENABLED =
  process.env.NODE_ENV === "development" || process.env.ALMACEN_ALLOW_PROFILE_CHANGE === "1";

function success(data = {}) {
  return { ok: true, ...data };
}

function failure(code, message, data = {}) {
  return { ok: false, code, message, ...data };
}

function errorResponse(error, fallbackCode, fallbackMessage, data = {}) {
  console.error(fallbackMessage, error);
  return failure(error?.code || fallbackCode, error?.message || fallbackMessage, data);
}

function getBackupService() {
  if (!backupService) {
    backupService = new BackupService({
      userDataPath: app.getPath("userData"),
      databaseService: localDatabase,
      appVersion: app.getVersion()
    });
  }
  return backupService;
}

function getPhotoStorageService() {
  if (!photoStorageService) {
    photoStorageService = new PhotoStorageService({
      userDataPath: app.getPath("userData"),
      dialog,
      nativeImage
    });
  }
  return photoStorageService;
}

function getConnectionConfigService() {
  if (!connectionConfigService) {
    connectionConfigService = new ConnectionConfigService({
      userDataPath: app.getPath("userData"),
      safeStorage
    });
  }
  return connectionConfigService;
}

function getSyncService() {
  if (!syncService) {
    syncService = new FirebaseSyncService({
      databaseService: localDatabase,
      userDataPath: app.getPath("userData"),
      config: getConnectionConfigService().getRuntimeConfig("firebase")
    });
  }
  return syncService;
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
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (preferences?.startMaximized) mainWindow.maximize();
  else if (mainWindow.isMaximized()) mainWindow.unmaximize();
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

async function requireProfile() {
  const profile = await readProfile(app.getPath("userData"));
  if (!profile) {
    const error = new Error("Primero debes elegir quién utilizará esta computadora.");
    error.code = "PROFILE_REQUIRED";
    throw error;
  }
  if (!localDatabase.getSummary().initialized) await initializeLocalDatabase(profile);
  else localDatabase.registerDeviceProfile(profile, app.getVersion());
  return profile;
}

function contextFromProfile(profile) {
  return {
    userId: profile.id,
    deviceId: profile.deviceId,
    channelId: profile.channelId,
    role: profile.role
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
    width: 1360,
    height: 860,
    minWidth: 960,
    minHeight: 680,
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
    if (url.startsWith("https://")) shell.openExternal(url).catch(console.error);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const currentUrl = mainWindow?.webContents.getURL();
    if (currentUrl && url !== currentUrl) event.preventDefault();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
    adminSession.logout();
  });
}

function registerCoreHandlers() {
  ipcMain.handle("app:get-info", () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform,
    profileTestingEnabled: PROFILE_TESTING_ENABLED
  }));

  ipcMain.handle("startup:get-state", async () => {
    if (!startupReport) await refreshStartupReport();
    return success({ startup: startupReport });
  });

  ipcMain.handle("profile:list", () => Object.values(PROFILES));
  ipcMain.handle("profile:get", () => readProfile(app.getPath("userData")));
  ipcMain.handle("profile:save", async (_event, profileId) => {
    const profile = await saveProfile(app.getPath("userData"), profileId, {
      allowChange: PROFILE_TESTING_ENABLED
    });
    if (!localDatabase.getSummary().initialized) await initializeLocalDatabase(profile);
    else localDatabase.registerDeviceProfile(profile, app.getVersion());
    adminSession.logout();
    const preferences = currentPreferences(profile);
    applyWindowPreferences(preferences);
    await refreshStartupReport();
    scheduleAutomaticSync();
    return profile;
  });

  ipcMain.handle("device:get-preferences", async () => {
    try {
      const profile = await requireProfile();
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
    } catch (error) {
      return errorResponse(error, "PREFERENCES_READ_FAILED", "No se pudo leer la configuración visual.");
    }
  });

  ipcMain.handle("device:set-text-size", async (_event, textSize) => {
    try {
      const profile = await requireProfile();
      return success({ preferences: saveTextSize(localDatabase, profile, textSize) });
    } catch (error) {
      return errorResponse(error, "PREFERENCES_SAVE_FAILED", "No se pudo guardar el tamaño de letra.");
    }
  });

  ipcMain.handle("device:update-preferences", async (_event, preferences) => {
    if (!adminSession.isUnlocked()) {
      return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó. Ingresa nuevamente.", {
        status: await buildAdminStatus()
      });
    }
    try {
      const profile = await requireProfile();
      const saved = saveDevicePreferences(localDatabase, profile, preferences);
      applyWindowPreferences(saved);
      adminSession.touch();
      if (startupReport) startupReport = { ...startupReport, preferences: saved };
      return success({ preferences: saved, status: await buildAdminStatus() });
    } catch (error) {
      return errorResponse(error, "PREFERENCES_SAVE_FAILED", "No se pudo guardar la configuración del equipo.", {
        status: await buildAdminStatus()
      });
    }
  });

  ipcMain.handle("database:get-summary", () => success({ database: localDatabase.getSummary() }));
  ipcMain.handle("database:run-diagnostic", async () => {
    if (!adminSession.isUnlocked()) {
      return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó. Ingresa nuevamente.", {
        status: await buildAdminStatus()
      });
    }
    try {
      const diagnostic = localDatabase.runDiagnostic();
      adminSession.touch();
      return success({ diagnostic, database: localDatabase.getAdminStatus(), status: await buildAdminStatus() });
    } catch (error) {
      return errorResponse(error, "DATABASE_DIAGNOSTIC_FAILED", "No se pudo probar la base local.", {
        database: localDatabase.getAdminStatus(),
        status: await buildAdminStatus()
      });
    }
  });
}

function registerBackupHandlers() {
  ipcMain.handle("backups:get-summary", async () => {
    if (!adminSession.isUnlocked()) return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó.");
    try {
      return success({ backups: await getBackupService().getSummary(), status: await buildAdminStatus() });
    } catch (error) {
      return errorResponse(error, "BACKUP_LIST_FAILED", "No se pudieron consultar los respaldos.");
    }
  });

  ipcMain.handle("backups:create", async () => {
    if (!adminSession.isUnlocked()) return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó.");
    try {
      const backup = await getBackupService().create("manual");
      adminSession.touch();
      return success({ backup, backups: await getBackupService().getSummary() });
    } catch (error) {
      return errorResponse(error, "BACKUP_CREATE_FAILED", "No se pudo crear el respaldo.");
    }
  });

  ipcMain.handle("backups:verify", async (_event, fileName) => {
    if (!adminSession.isUnlocked()) return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó.");
    try {
      return success({ verification: await getBackupService().verify(fileName) });
    } catch (error) {
      return errorResponse(error, "BACKUP_VERIFY_FAILED", "No se pudo verificar el respaldo.");
    }
  });

  ipcMain.handle("backups:open-folder", async () => {
    if (!adminSession.isUnlocked()) return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó.");
    try {
      const directory = await getBackupService().ensureDirectory();
      const openError = await shell.openPath(directory);
      return openError ? failure("BACKUP_FOLDER_OPEN_FAILED", openError) : success({ directory });
    } catch (error) {
      return errorResponse(error, "BACKUP_FOLDER_OPEN_FAILED", "No se pudo abrir la carpeta de respaldos.");
    }
  });
}

function registerDiagnosticsHandlers() {
  ipcMain.handle("diagnostics:report-screens", (_event, reports) => {
    try {
      return success({ savedCount: diagnostics.reportScreens(reports).length });
    } catch (error) {
      return errorResponse(error, "SCREEN_REPORT_FAILED", "No se pudo guardar el reporte de pantallas.");
    }
  });

  ipcMain.handle("diagnostics:get-summary", async () => {
    if (!adminSession.isUnlocked()) return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó.");
    try {
      return success({ diagnostics: diagnostics.getSummary() });
    } catch (error) {
      return errorResponse(error, "DIAGNOSTICS_READ_FAILED", "No se pudieron leer los diagnósticos.");
    }
  });

  ipcMain.handle("diagnostics:run", async () => {
    if (!adminSession.isUnlocked()) return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó.");
    try {
      const profile = await readProfile(app.getPath("userData"));
      const result = diagnostics.run({
        appVersion: app.getVersion(),
        profile,
        preferences: currentPreferences(profile),
        windowState: windowState()
      });
      adminSession.touch();
      return success({ result, diagnostics: diagnostics.getSummary(), database: localDatabase.getAdminStatus() });
    } catch (error) {
      return errorResponse(error, "DIAGNOSTICS_RUN_FAILED", "No se pudo ejecutar el diagnóstico general.");
    }
  });
}

function registerAdminHandlers() {
  ipcMain.handle("admin:get-status", async () => success({ status: await buildAdminStatus() }));

  ipcMain.handle("admin:setup", async (_event, payload = {}) => {
    const userDataPath = app.getPath("userData");
    const profile = await readProfile(userDataPath);
    const status = await buildAdminStatus();
    if (!profile) return failure("PROFILE_REQUIRED", "Primero debes elegir quién utilizará esta computadora.", { status });
    if (profile.id !== "jefferson") {
      return failure("SETUP_NOT_ALLOWED", "La contraseña inicial solo puede configurarse desde Jefferson.", { status });
    }
    if (status.configured) return failure("AUTH_ALREADY_CONFIGURED", "La contraseña ya está configurada.", { status });
    if (payload.password !== payload.confirmation) {
      return failure("PASSWORDS_DO_NOT_MATCH", "Las contraseñas no coinciden.", { status });
    }
    try {
      await createAdminCredential(userDataPath, payload.password);
      adminSession.registerSuccessfulLogin();
      return success({ status: await buildAdminStatus() });
    } catch (error) {
      return errorResponse(error, "AUTH_SETUP_FAILED", "No se pudo configurar la contraseña.", { status: await buildAdminStatus() });
    }
  });

  ipcMain.handle("admin:login", async (_event, password) => {
    const userDataPath = app.getPath("userData");
    const before = await buildAdminStatus();
    if (before.authDataError) return failure("AUTH_DATA_INVALID", before.authDataErrorMessage, { status: before });
    if (!before.configured) return failure("AUTH_NOT_CONFIGURED", "La contraseña todavía no está configurada.", { status: before });
    if (before.locked) return failure("AUTH_TEMPORARILY_LOCKED", "El acceso está bloqueado temporalmente.", { status: before });
    try {
      const valid = await verifyAdminPassword(userDataPath, password);
      if (!valid) {
        const session = adminSession.registerFailedLogin();
        return failure(session.locked ? "AUTH_TEMPORARILY_LOCKED" : "INVALID_PASSWORD", session.locked ? "El acceso fue bloqueado temporalmente." : "La contraseña no es correcta.", { status: await buildAdminStatus() });
      }
      adminSession.registerSuccessfulLogin();
      return success({ status: await buildAdminStatus() });
    } catch (error) {
      return errorResponse(error, "AUTH_LOGIN_FAILED", "No se pudo verificar la contraseña.", { status: await buildAdminStatus() });
    }
  });

  ipcMain.handle("admin:touch", async () => success({ status: { ...(await buildAdminStatus()), ...adminSession.touch() } }));
  ipcMain.handle("admin:logout", async () => {
    adminSession.logout();
    return success({ status: await buildAdminStatus() });
  });

  ipcMain.handle("admin:get-dashboard", async () => {
    if (!adminSession.isUnlocked()) {
      return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó. Ingresa nuevamente.", { status: await buildAdminStatus() });
    }
    try {
      const profile = await requireProfile();
      const preferences = currentPreferences(profile);
      const backupSummary = await getBackupService().getSummary().catch(() => null);
      const diagnosticSummary = (() => { try { return diagnostics.getSummary(); } catch { return null; } })();
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
          session: adminSession.touch(),
          database: localDatabase.getAdminStatus(),
          diagnostics: diagnosticSummary,
          backups: backupSummary,
          catalog: catalog.getSummary(),
          commerce: commerce.getSummary(),
          synchronization: getSyncService().getStatus(),
          connections: getConnectionConfigService().getPublicConfig(),
          modules: {
            startup: startupReport?.status === "ready" ? "ready" : "attention",
            localDatabase: localDatabase.getSummary().healthy ? "ready" : "attention",
            catalog: "ready",
            commerce: "ready",
            devicePreferences: "ready",
            backups: backupSummary?.latest ? "ready" : "attention",
            synchronization: getSyncService().getStatus().lastSuccessAt ? "ready" : "attention",
            diagnostics: diagnosticSummary?.latest ? "ready" : "attention"
          }
        },
        status: await buildAdminStatus()
      });
    } catch (error) {
      return errorResponse(error, "ADMIN_DASHBOARD_FAILED", "No se pudo cargar Administración.");
    }
  });
}

function registerCatalogHandlers() {
  ipcMain.handle("catalog:list", async (_event, options = {}) => {
    try {
      await requireProfile();
      return success({ products: catalog.listProducts(options), summary: catalog.getSummary() });
    } catch (error) {
      return errorResponse(error, "CATALOG_LIST_FAILED", "No se pudieron buscar los productos.");
    }
  });

  ipcMain.handle("catalog:get", async (_event, productId) => {
    try {
      const profile = await requireProfile();
      const detail = catalog.getProduct(productId);
      commerce.recordRecent(productId, "viewed", contextFromProfile(profile));
      return success({ detail: { ...detail, commerce: commerce.getProductCommerce(productId) } });
    } catch (error) {
      return errorResponse(error, "CATALOG_READ_FAILED", "No se pudo abrir el producto.");
    }
  });

  ipcMain.handle("catalog:create", async (_event, input) => {
    try {
      const profile = await requireProfile();
      const created = catalog.createProduct(input, contextFromProfile(profile));
      commerce.recordRecent(created.product.id, "created", contextFromProfile(profile));
      return success({ created, detail: { ...catalog.getProduct(created.product.id), commerce: commerce.getProductCommerce(created.product.id) } });
    } catch (error) {
      return errorResponse(error, "CATALOG_CREATE_FAILED", "No se pudo crear el producto.");
    }
  });

  ipcMain.handle("catalog:create-complete", async (_event, input) => {
    try {
      const profile = await requireProfile();
      const result = productEntry.create(input, contextFromProfile(profile));
      const productId = result.created.product.id;
      return success({ ...result, detail: { ...catalog.getProduct(productId), commerce: commerce.getProductCommerce(productId) } });
    } catch (error) {
      return errorResponse(error, "PRODUCT_ENTRY_FAILED", "No se pudo completar el registro del producto.");
    }
  });

  ipcMain.handle("catalog:add-variant", async (_event, productId, input) => {
    try {
      const profile = await requireProfile();
      const variant = catalog.addVariant(productId, input, contextFromProfile(profile));
      commerce.recordRecent(productId, "variant_added", contextFromProfile(profile));
      return success({ variant, detail: { ...catalog.getProduct(productId), commerce: commerce.getProductCommerce(productId) } });
    } catch (error) {
      return errorResponse(error, "VARIANT_CREATE_FAILED", "No se pudo agregar la variación.");
    }
  });

  ipcMain.handle("catalog:set-product-status", async (_event, productId, status, reason) => {
    try {
      const profile = await requireProfile();
      const product = catalog.setProductStatus(productId, status, reason, contextFromProfile(profile));
      commerce.recordRecent(productId, `status_${status}`, contextFromProfile(profile));
      return success({ product });
    } catch (error) {
      return errorResponse(error, "PRODUCT_STATUS_FAILED", "No se pudo cambiar el estado del producto.");
    }
  });

  ipcMain.handle("catalog:set-variant-status", async (_event, variantId, status, reason) => {
    try {
      const profile = await requireProfile();
      return success({ variant: catalog.setVariantStatus(variantId, status, reason, contextFromProfile(profile)) });
    } catch (error) {
      return errorResponse(error, "VARIANT_STATUS_FAILED", "No se pudo cambiar el estado de la variación.");
    }
  });

  ipcMain.handle("catalog:add-photo", async (_event, productId, options = {}) => {
    try {
      const profile = await requireProfile();
      const stored = await getPhotoStorageService().chooseAndStore(mainWindow);
      if (!stored) return failure("PHOTO_CANCELLED", "No se seleccionó ninguna fotografía.");
      const photo = catalog.addPhoto(productId, { ...stored, ...options }, contextFromProfile(profile));
      commerce.recordRecent(productId, "photo_added", contextFromProfile(profile));
      return success({ photo, detail: { ...catalog.getProduct(productId), commerce: commerce.getProductCommerce(productId) } });
    } catch (error) {
      return errorResponse(error, "PHOTO_ADD_FAILED", "No se pudo agregar la fotografía.");
    }
  });

  ipcMain.handle("catalog:set-photo-status", async (_event, photoId, status) => {
    try {
      const profile = await requireProfile();
      return success({ photo: catalog.setPhotoStatus(photoId, status, contextFromProfile(profile)) });
    } catch (error) {
      return errorResponse(error, "PHOTO_STATUS_FAILED", "No se pudo cambiar la fotografía.");
    }
  });

  ipcMain.handle("catalog:references", async () => {
    try {
      await requireProfile();
      const channels = localDatabase.database
        .prepare("SELECT id, name, type FROM channels WHERE is_active = 1 ORDER BY name")
        .all()
        .map((row) => ({ id: row.id, name: row.name, type: row.type }));
      return success({ channels, suppliers: commerce.listSuppliers() });
    } catch (error) {
      return errorResponse(error, "CATALOG_REFERENCES_FAILED", "No se pudieron cargar las opciones.");
    }
  });
}

function registerCommerceHandlers() {
  ipcMain.handle("commerce:suppliers:list", async (_event, options = {}) => {
    try {
      await requireProfile();
      return success({ suppliers: commerce.listSuppliers(options) });
    } catch (error) {
      return errorResponse(error, "SUPPLIERS_LIST_FAILED", "No se pudieron consultar los proveedores.");
    }
  });

  ipcMain.handle("commerce:supplier:save", async (_event, input) => {
    try {
      const profile = await requireProfile();
      return success({ supplier: commerce.saveSupplier(input, contextFromProfile(profile)), suppliers: commerce.listSuppliers() });
    } catch (error) {
      return errorResponse(error, "SUPPLIER_SAVE_FAILED", "No se pudo guardar el proveedor.");
    }
  });

  ipcMain.handle("commerce:cost:save", async (_event, input) => {
    try {
      const profile = await requireProfile();
      const cost = commerce.recordCost(input, contextFromProfile(profile));
      return success({ cost, commerce: commerce.getProductCommerce(input.productId) });
    } catch (error) {
      return errorResponse(error, "COST_SAVE_FAILED", "No se pudo guardar el costo.");
    }
  });

  ipcMain.handle("commerce:price:save", async (_event, input) => {
    try {
      const profile = await requireProfile();
      const price = commerce.recordPrice(input, contextFromProfile(profile));
      return success({ price, commerce: commerce.getProductCommerce(input.productId) });
    } catch (error) {
      return errorResponse(error, "PRICE_SAVE_FAILED", "No se pudo guardar el precio.");
    }
  });

  ipcMain.handle("commerce:recent:list", async (_event, limit) => {
    try {
      const profile = await requireProfile();
      return success({ products: commerce.listRecent(contextFromProfile(profile), limit) });
    } catch (error) {
      return errorResponse(error, "RECENT_LIST_FAILED", "No se pudieron cargar los productos recientes.");
    }
  });
}

function registerConnectionHandlers() {
  ipcMain.handle("connections:get", async () => {
    if (!adminSession.isUnlocked()) {
      return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó. Ingresa nuevamente.");
    }
    try {
      adminSession.touch();
      return success({ connections: getConnectionConfigService().getPublicConfig() });
    } catch (error) {
      return errorResponse(error, "CONNECTIONS_READ_FAILED", "No se pudo leer la configuración de conexiones.");
    }
  });

  ipcMain.handle("connections:save", async (_event, providerId, payload = {}) => {
    if (!adminSession.isUnlocked()) {
      return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó. Ingresa nuevamente.");
    }
    try {
      getConnectionConfigService().save(providerId, payload);
      if (providerId === "firebase") syncService = null;
      adminSession.touch();
      return success({ connections: getConnectionConfigService().getPublicConfig() });
    } catch (error) {
      return errorResponse(error, "CONNECTION_SAVE_FAILED", "No se pudo guardar la conexión.");
    }
  });

  ipcMain.handle("connections:test", async (_event, providerId, payload = {}) => {
    if (!adminSession.isUnlocked()) {
      return failure("ADMIN_SESSION_REQUIRED", "La sesión administrativa terminó. Ingresa nuevamente.");
    }
    try {
      const result = await getConnectionConfigService().test(providerId, payload);
      adminSession.touch();
      return success({ result, connections: getConnectionConfigService().getPublicConfig() });
    } catch (error) {
      return errorResponse(error, "CONNECTION_TEST_FAILED", "No se pudo probar la conexión.");
    }
  });
}

function registerSyncHandlers() {
  ipcMain.handle("sync:get-status", async () => {
    try {
      await requireProfile();
      return success({ synchronization: getSyncService().getStatus() });
    } catch (error) {
      return errorResponse(error, "SYNC_STATUS_FAILED", "No se pudo leer el estado de sincronización.");
    }
  });

  ipcMain.handle("sync:run", async () => {
    try {
      const profile = await requireProfile();
      return await getSyncService().syncNow(profile, app.getVersion());
    } catch (error) {
      return errorResponse(error, "SYNC_FAILED", "No se pudo completar la sincronización.", {
        synchronization: getSyncService().getStatus()
      });
    }
  });
}

function registerIpcHandlers() {
  registerCoreHandlers();
  registerBackupHandlers();
  registerDiagnosticsHandlers();
  registerAdminHandlers();
  registerCatalogHandlers();
  registerCommerceHandlers();
  registerConnectionHandlers();
  registerSyncHandlers();
}

function scheduleAutomaticSync() {
  if (automaticSyncTimer) clearInterval(automaticSyncTimer);
  const run = async () => {
    try {
      const profile = await readProfile(app.getPath("userData"));
      if (profile && localDatabase.getSummary().initialized && getSyncService().isConfigured() && !getSyncService().running) {
        await getSyncService().syncNow(profile, app.getVersion());
      }
    } catch (error) {
      console.warn("La sincronización automática quedó pendiente:", error.message);
    }
  };
  setTimeout(run, 20_000);
  automaticSyncTimer = setInterval(run, 10 * 60 * 1000);
}

app.whenReady().then(async () => {
  await refreshStartupReport();
  getBackupService();
  getPhotoStorageService();
  getConnectionConfigService();
  getSyncService();
  if (localDatabase.getSummary().initialized) {
    backupService.maybeCreateAutomatic().catch((error) => console.error("No fue posible crear el respaldo automático:", error));
  }
  registerIpcHandlers();
  createMainWindow(startupReport?.preferences || defaultsForProfile(null));
  scheduleAutomaticSync();

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await refreshStartupReport();
      createMainWindow(startupReport?.preferences || defaultsForProfile(null));
    }
  });
});

app.on("before-quit", () => {
  if (automaticSyncTimer) clearInterval(automaticSyncTimer);
  localDatabase.close();
});

app.on("window-all-closed", () => {
  adminSession.logout();
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (error) => console.error("Error no controlado en el proceso principal:", error));
process.on("unhandledRejection", (reason) => console.error("Promesa rechazada sin controlar:", reason));
