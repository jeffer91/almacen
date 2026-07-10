/* =========================================================
Nombre completo: preload.js
Ruta o ubicación: /app/preload/preload.js
Función o funciones:
- Exponer una API mínima y segura a la interfaz.
- Evitar el acceso directo de la pantalla a Node.js.
- Comunicar la interfaz con el proceso principal mediante IPC.
- Gestionar el acceso administrativo sin exponer archivos locales.
- Consultar y probar la base local desde canales autorizados.
- Leer y guardar preferencias visuales y del equipo.
- Reportar pantallas y ejecutar diagnósticos generales.
- Consultar el estado coordinado del arranque.
- Crear, verificar y abrir respaldos locales.
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
  updateDevicePreferences: (preferences) =>
    ipcRenderer.invoke("device:update-preferences", preferences),
  getDatabaseSummary: () => ipcRenderer.invoke("database:get-summary"),
  runDatabaseDiagnostic: () => ipcRenderer.invoke("database:run-diagnostic"),
  getBackupsSummary: () => ipcRenderer.invoke("backups:get-summary"),
  createBackup: () => ipcRenderer.invoke("backups:create"),
  verifyBackup: (fileName) => ipcRenderer.invoke("backups:verify", fileName),
  openBackupsFolder: () => ipcRenderer.invoke("backups:open-folder"),
  reportScreenDiagnostics: (reports) =>
    ipcRenderer.invoke("diagnostics:report-screens", reports),
  getDiagnosticsSummary: () => ipcRenderer.invoke("diagnostics:get-summary"),
  runFullDiagnostics: () => ipcRenderer.invoke("diagnostics:run"),
  getAdminStatus: () => ipcRenderer.invoke("admin:get-status"),
  setupAdminPassword: (password, confirmation) =>
    ipcRenderer.invoke("admin:setup", { password, confirmation }),
  loginAdmin: (password) => ipcRenderer.invoke("admin:login", password),
  touchAdminSession: () => ipcRenderer.invoke("admin:touch"),
  logoutAdmin: () => ipcRenderer.invoke("admin:logout"),
  getAdminDashboard: () => ipcRenderer.invoke("admin:get-dashboard")
});

contextBridge.exposeInMainWorld("almacen", api);
