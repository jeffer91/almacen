/* =========================================================
Nombre completo: preload.js
Ruta o ubicación: /app/preload/preload.js
Función o funciones:
- Exponer una API mínima y segura a la interfaz.
- Conectar perfiles, administración, SQLite, catálogo, comercio y sincronización.
- Evitar acceso directo de la pantalla a Node.js.
Con qué se conecta:
- app/main/main.js
- app/renderer/*.js
========================================================= */

"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const api = Object.freeze({
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  getStartupState: () => ipcRenderer.invoke("startup:get-state"),
  listProfiles: () => ipcRenderer.invoke("profile:list"),
  getProfile: () => ipcRenderer.invoke("profile:get"),
  saveProfile: (profileId) => ipcRenderer.invoke("profile:save", profileId),

  getDevicePreferences: () => ipcRenderer.invoke("device:get-preferences"),
  setTextSize: (textSize) => ipcRenderer.invoke("device:set-text-size", textSize),
  updateDevicePreferences: (preferences) => ipcRenderer.invoke("device:update-preferences", preferences),

  getDatabaseSummary: () => ipcRenderer.invoke("database:get-summary"),
  runDatabaseDiagnostic: () => ipcRenderer.invoke("database:run-diagnostic"),

  getBackupsSummary: () => ipcRenderer.invoke("backups:get-summary"),
  createBackup: () => ipcRenderer.invoke("backups:create"),
  verifyBackup: (fileName) => ipcRenderer.invoke("backups:verify", fileName),
  openBackupsFolder: () => ipcRenderer.invoke("backups:open-folder"),

  reportScreenDiagnostics: (reports) => ipcRenderer.invoke("diagnostics:report-screens", reports),
  getDiagnosticsSummary: () => ipcRenderer.invoke("diagnostics:get-summary"),
  runFullDiagnostics: () => ipcRenderer.invoke("diagnostics:run"),

  getAdminStatus: () => ipcRenderer.invoke("admin:get-status"),
  setupAdminPassword: (password, confirmation) => ipcRenderer.invoke("admin:setup", { password, confirmation }),
  loginAdmin: (password) => ipcRenderer.invoke("admin:login", password),
  touchAdminSession: () => ipcRenderer.invoke("admin:touch"),
  logoutAdmin: () => ipcRenderer.invoke("admin:logout"),
  getAdminDashboard: () => ipcRenderer.invoke("admin:get-dashboard"),

  listProducts: (options) => ipcRenderer.invoke("catalog:list", options),
  getProduct: (productId) => ipcRenderer.invoke("catalog:get", productId),
  createProduct: (input) => ipcRenderer.invoke("catalog:create", input),
  addVariant: (productId, input) => ipcRenderer.invoke("catalog:add-variant", productId, input),
  setProductStatus: (productId, status, reason) => ipcRenderer.invoke("catalog:set-product-status", productId, status, reason),
  setVariantStatus: (variantId, status, reason) => ipcRenderer.invoke("catalog:set-variant-status", variantId, status, reason),
  addProductPhoto: (productId, options) => ipcRenderer.invoke("catalog:add-photo", productId, options),
  setPhotoStatus: (photoId, status) => ipcRenderer.invoke("catalog:set-photo-status", photoId, status),
  getCatalogReferences: () => ipcRenderer.invoke("catalog:references"),

  listSuppliers: (options) => ipcRenderer.invoke("commerce:suppliers:list", options),
  saveSupplier: (input) => ipcRenderer.invoke("commerce:supplier:save", input),
  saveCost: (input) => ipcRenderer.invoke("commerce:cost:save", input),
  savePrice: (input) => ipcRenderer.invoke("commerce:price:save", input),
  listRecentProducts: (limit) => ipcRenderer.invoke("commerce:recent:list", limit),

  getConnectionsConfig: () => ipcRenderer.invoke("connections:get"),
  saveConnectionConfig: (providerId, payload) => ipcRenderer.invoke("connections:save", providerId, payload),
  testConnection: (providerId, payload) => ipcRenderer.invoke("connections:test", providerId, payload),

  getSyncStatus: () => ipcRenderer.invoke("sync:get-status"),
  runSync: () => ipcRenderer.invoke("sync:run")
});

contextBridge.exposeInMainWorld("almacen", api);
