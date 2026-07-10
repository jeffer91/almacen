/* =========================================================
Nombre completo: preload.js
Ruta o ubicación: /app/preload/preload.js
Función o funciones:
- Exponer una API mínima y segura a la interfaz.
- Evitar el acceso directo de la pantalla a Node.js.
- Comunicar la interfaz con el proceso principal mediante IPC.
========================================================= */

"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const api = Object.freeze({
  getAppInfo: () => ipcRenderer.invoke("app:get-info"),
  listProfiles: () => ipcRenderer.invoke("profile:list"),
  getProfile: () => ipcRenderer.invoke("profile:get"),
  saveProfile: (profileId) => ipcRenderer.invoke("profile:save", profileId)
});

contextBridge.exposeInMainWorld("almacen", api);
