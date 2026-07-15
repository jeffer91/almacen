from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(relative_path, old, new, label):
    path = ROOT / relative_path
    text = path.read_text(encoding="utf-8")
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"No se encontró el bloque esperado: {label} ({relative_path})")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


# main.js
replace_once(
    "app/main/main.js",
    '''  shell,
  dialog,
  nativeImage
} = require("electron");''',
    '''  shell,
  dialog,
  nativeImage,
  safeStorage
} = require("electron");''',
    "safeStorage de Electron"
)
replace_once(
    "app/main/main.js",
    '''const { FirebaseSyncService } = require("./sync/firebase-sync-service");''',
    '''const { FirebaseSyncService } = require("./sync/firebase-sync-service");
const { ConnectionConfigService } = require("./connections/connection-config-service");''',
    "servicio de conexiones"
)
replace_once(
    "app/main/main.js",
    '''let photoStorageService = null;
let syncService = null;
let automaticSyncTimer = null;''',
    '''let photoStorageService = null;
let connectionConfigService = null;
let syncService = null;
let automaticSyncTimer = null;''',
    "variable del servicio de conexiones"
)
replace_once(
    "app/main/main.js",
    '''function getSyncService() {
  if (!syncService) {
    syncService = new FirebaseSyncService({
      databaseService: localDatabase,
      userDataPath: app.getPath("userData")
    });
  }
  return syncService;
}''',
    '''function getConnectionConfigService() {
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
}''',
    "configuración dinámica de Firebase"
)
replace_once(
    "app/main/main.js",
    '''          synchronization: getSyncService().getStatus(),
          modules: {''',
    '''          synchronization: getSyncService().getStatus(),
          connections: getConnectionConfigService().getPublicConfig(),
          modules: {''',
    "conexiones en el panel administrativo"
)
replace_once(
    "app/main/main.js",
    '''function registerSyncHandlers() {''',
    '''function registerConnectionHandlers() {
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

function registerSyncHandlers() {''',
    "controladores IPC de conexiones"
)
replace_once(
    "app/main/main.js",
    '''  registerCommerceHandlers();
  registerSyncHandlers();''',
    '''  registerCommerceHandlers();
  registerConnectionHandlers();
  registerSyncHandlers();''',
    "registro de controladores de conexiones"
)
replace_once(
    "app/main/main.js",
    '''      if (profile && localDatabase.getSummary().initialized && !getSyncService().running) {
        await getSyncService().syncNow(profile, app.getVersion());
      }''',
    '''      if (profile && localDatabase.getSummary().initialized && getSyncService().isConfigured() && !getSyncService().running) {
        await getSyncService().syncNow(profile, app.getVersion());
      }''',
    "respeto a Firebase desactivado"
)
replace_once(
    "app/main/main.js",
    '''  getPhotoStorageService();
  getSyncService();''',
    '''  getPhotoStorageService();
  getConnectionConfigService();
  getSyncService();''',
    "inicio del servicio de conexiones"
)

# preload.js
replace_once(
    "app/preload/preload.js",
    '''  getSyncStatus: () => ipcRenderer.invoke("sync:get-status"),
  runSync: () => ipcRenderer.invoke("sync:run")''',
    '''  getConnectionsConfig: () => ipcRenderer.invoke("connections:get"),
  saveConnectionConfig: (providerId, payload) => ipcRenderer.invoke("connections:save", providerId, payload),
  testConnection: (providerId, payload) => ipcRenderer.invoke("connections:test", providerId, payload),

  getSyncStatus: () => ipcRenderer.invoke("sync:get-status"),
  runSync: () => ipcRenderer.invoke("sync:run")''',
    "API segura de conexiones"
)

# Firebase debe respetar el interruptor activado/desactivado.
replace_once(
    "app/main/sync/firebase-sync-service.js",
    '''  isConfigured() {
    return Boolean(this.config.apiKey && this.config.projectId && this.config.collection && this.fetch);
  }''',
    '''  isConfigured() {
    return Boolean(this.config.enabled !== false && this.config.apiKey && this.config.projectId && this.config.collection && this.fetch);
  }''',
    "estado activado de Firebase"
)
replace_once(
    "app/main/sync/firebase-sync-service.js",
    '''      configured: this.isConfigured(),
      running: this.running,''',
    '''      enabled: this.config.enabled !== false,
      configured: this.isConfigured(),
      running: this.running,''',
    "estado público de Firebase"
)

# index.html
replace_once(
    "app/renderer/index.html",
    '''  <link rel="stylesheet" href="./styles/admin-navigation.css">
  <link rel="stylesheet" href="./styles/preferences.css">''',
    '''  <link rel="stylesheet" href="./styles/admin-navigation.css">
  <link rel="stylesheet" href="./styles/connections.css">
  <link rel="stylesheet" href="./styles/preferences.css">''',
    "estilos de conexiones"
)
replace_once(
    "app/renderer/index.html",
    '''  <script src="./backups.js"></script>
  <script src="./admin-navigation.js"></script>''',
    '''  <script src="./backups.js"></script>
  <script src="./connections.js"></script>
  <script src="./admin-navigation.js"></script>''',
    "script de conexiones antes del menú"
)

# admin-navigation.js
replace_once(
    "app/renderer/admin-navigation.js",
    '''  { id: "database", label: "Base local", icon: "◉", title: "Base local SQLite", description: "Integridad, esquema y tamaño de la información guardada en este equipo." },
  { id: "sync", label: "Sincronización", icon: "↻", title: "Sincronización Firebase", description: "Envío y recepción de cambios entre las computadoras." },''',
    '''  { id: "database", label: "Base local", icon: "◉", title: "Base local SQLite", description: "Integridad, esquema y tamaño de la información guardada en este equipo." },
  { id: "connections", label: "Conexiones", icon: "⚙", title: "Conexiones externas", description: "Configuración de Firebase, Supabase y Google Sheets." },
  { id: "sync", label: "Sincronización", icon: "↻", title: "Sincronización Firebase", description: "Envío y recepción de cambios entre las computadoras." },''',
    "sección Conexiones"
)
replace_once(
    "app/renderer/admin-navigation.js",
    '''  const diagnosticsPanel = document.getElementById("diagnostics-panel");
  const backupsPanel = document.getElementById("backups-panel");''',
    '''  const connectionsPanel = document.getElementById("connections-panel");
  const diagnosticsPanel = document.getElementById("diagnostics-panel");
  const backupsPanel = document.getElementById("backups-panel");''',
    "panel de conexiones"
)
replace_once(
    "app/renderer/admin-navigation.js",
    '''  if (!pageHeader || !sessionBanner || !originalGrid || !diagnosticsPanel || !backupsPanel || !backButton || !logoutButton) return;''',
    '''  if (!pageHeader || !sessionBanner || !originalGrid || !connectionsPanel || !diagnosticsPanel || !backupsPanel || !backButton || !logoutButton) return;''',
    "validación del panel de conexiones"
)
replace_once(
    "app/renderer/admin-navigation.js",
    '''    if (["database", "sync", "diagnostics", "backups"].includes(section.id)) {''',
    '''    if (["database", "connections", "sync", "diagnostics", "backups"].includes(section.id)) {''',
    "indicador de Conexiones"
)
replace_once(
    "app/renderer/admin-navigation.js",
    '''  const summarySection = createSection(ADMIN_SECTIONS[0]);
  const equipmentSection = createSection(ADMIN_SECTIONS[1]);
  const databaseSection = createSection(ADMIN_SECTIONS[2]);
  const syncSection = createSection(ADMIN_SECTIONS[3]);
  const diagnosticsSection = createSection(ADMIN_SECTIONS[4]);
  const backupsSection = createSection(ADMIN_SECTIONS[5]);''',
    '''  const summarySection = createSection(ADMIN_SECTIONS[0]);
  const equipmentSection = createSection(ADMIN_SECTIONS[1]);
  const databaseSection = createSection(ADMIN_SECTIONS[2]);
  const connectionsSection = createSection(ADMIN_SECTIONS[3]);
  const syncSection = createSection(ADMIN_SECTIONS[4]);
  const diagnosticsSection = createSection(ADMIN_SECTIONS[5]);
  const backupsSection = createSection(ADMIN_SECTIONS[6]);''',
    "creación de siete secciones"
)
replace_once(
    "app/renderer/admin-navigation.js",
    '''    { id: "database", label: "Base local", badgeId: "admin-database-badge" },
    { id: "sync", label: "Sincronización", badgeId: "sync-badge" },''',
    '''    { id: "database", label: "Base local", badgeId: "admin-database-badge" },
    { id: "connections", label: "Conexiones", badgeId: "connections-badge" },
    { id: "sync", label: "Sincronización", badgeId: "sync-badge" },''',
    "resumen de Conexiones"
)
replace_once(
    "app/renderer/admin-navigation.js",
    '''  databaseSection.append(databaseCard);
  syncSection.append(syncCard);''',
    '''  databaseSection.append(databaseCard);
  connectionsSection.append(connectionsPanel);
  syncSection.append(syncCard);''',
    "ubicación del panel de conexiones"
)

# prueba del menú
replace_once(
    "tests/admin-navigation.test.js",
    '''test("define las seis secciones del Centro de control", () => {
  assert.deepEqual(
    ADMIN_SECTIONS.map((section) => section.id),
    ["summary", "equipment", "database", "sync", "diagnostics", "backups"]
  );
});''',
    '''test("define las siete secciones del Centro de control", () => {
  assert.deepEqual(
    ADMIN_SECTIONS.map((section) => section.id),
    ["summary", "equipment", "database", "connections", "sync", "diagnostics", "backups"]
  );
});''',
    "prueba de siete secciones"
)

print("Configuración de conexiones integrada.")
