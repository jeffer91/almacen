"use strict";
// Almacén Familiar: nueva interfaz Electron, misma aplicación visual que GitHub Pages.
// La aplicación heredada permanece disponible con ALMACEN_LEGACY=1.
if (process.env.ALMACEN_LEGACY === "1") {
  require("./main.js");
} else {
  const { app, BrowserWindow, ipcMain, shell } = require("electron");
  const path = require("node:path");
  const { DatabaseSync } = require("node:sqlite");
  let mainWindow;
  let database;
  function ensureDatabase() {
    if (!database) {
      const filename = path.join(app.getPath("userData"), "family-web-cache.sqlite");
      database = new DatabaseSync(filename);
      database.exec("CREATE TABLE IF NOT EXISTS catalog_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, saved_at TEXT NOT NULL)");
    }
    return database;
  }
  function senderValid(event) {
    return Boolean(mainWindow && !mainWindow.isDestroyed() && event.sender.id === mainWindow.webContents.id);
  }
  ipcMain.handle("family:config:get", (event) => {
    if (!senderValid(event)) return "";
    const url = String(process.env.ALMACEN_API_URL || "").trim();
    return /^https:\/\/[a-z0-9-]+\.supabase\.co\/functions\/v1\/catalog-api$/.test(url) ? url : "";
  });
  ipcMain.handle("family:cache:get", (event) => {
    if (!senderValid(event)) return null;
    const result = ensureDatabase().prepare("SELECT data FROM catalog_snapshot WHERE id = 1").get();
    if (!result) return null;
    try { return JSON.parse(result.data); } catch { return null; }
  });
  ipcMain.handle("family:cache:put", (event, value) => {
    if (!senderValid(event)) return false;
    if (!value || typeof value !== "object" || !Array.isArray(value.products)) return false;
    const text = JSON.stringify(value);
    if (Buffer.byteLength(text, "utf8") > 15 * 1024 * 1024) return false;
    ensureDatabase().prepare(
      "INSERT INTO catalog_snapshot (id,data,saved_at) VALUES (1,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,saved_at=excluded.saved_at"
    ).run(text, new Date().toISOString());
    return true;
  });
  function openDesktop() {
    mainWindow = new BrowserWindow({
      width: 1240, height: 840, minWidth: 780, minHeight: 580,
      backgroundColor: "#f8f8fc", autoHideMenuBar: true,
      webPreferences: {
        preload: path.join(__dirname, "../preload/family-preload.js"),
        contextIsolation: true, nodeIntegration: false, sandbox: true,
        webSecurity: true
      }
    });
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https:\/\//.test(url)) shell.openExternal(url);
      return { action: "deny" };
    });
    mainWindow.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith("file:")) event.preventDefault();
    });
    mainWindow.setTitle("Nicole Encajes · Jefferson");
    mainWindow.loadFile(path.join(__dirname, "../../web/jefferson/index.html"));
  }
  app.whenReady().then(() => {
    openDesktop();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) openDesktop();
    });
  });
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => { if (database) { database.close(); database = null; } });
}
