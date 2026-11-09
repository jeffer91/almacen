"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("almacenDesktop", Object.freeze({
  getCachedSnapshot: () => ipcRenderer.invoke("family:cache:get"),
  saveCachedSnapshot: (value) => ipcRenderer.invoke("family:cache:put", value),
  getApiUrl: () => ipcRenderer.invoke("family:config:get"),
  getAccessKey: () => ipcRenderer.invoke("family:access:get"),
  saveAccessKey: (secret) => ipcRenderer.invoke("family:access:put", secret),
  clearAccessKey: () => ipcRenderer.invoke("family:access:clear")
}));
