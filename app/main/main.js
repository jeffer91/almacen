/* =========================================================
Nombre completo: main.js
Ruta o ubicación: /app/main/main.js
Función o funciones:
- Iniciar la aplicación Electron.
- Crear y proteger la ventana principal.
- Exponer operaciones seguras mediante IPC.
- Leer y guardar el perfil fijo de cada computadora.
========================================================= */

"use strict";

const path = require("node:path");
const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { PROFILES, readProfile, saveProfile } = require("./profile-store");

let mainWindow = null;

function createMainWindow() {
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
  });
}

function registerIpcHandlers() {
  ipcMain.handle("app:get-info", () => ({
    name: app.getName(),
    version: app.getVersion(),
    platform: process.platform
  }));

  ipcMain.handle("profile:list", () => Object.values(PROFILES));

  ipcMain.handle("profile:get", async () => {
    return readProfile(app.getPath("userData"));
  });

  ipcMain.handle("profile:save", async (_event, profileId) => {
    return saveProfile(app.getPath("userData"), profileId);
  });
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
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
