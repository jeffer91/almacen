"use strict";
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("almacenDesktop", Object.freeze({
  getCachedSnapshot: () => ipcRenderer.invoke("family:cache:get"),
  saveCachedSnapshot: (value) => ipcRenderer.invoke("family:cache:put", value)
}));
