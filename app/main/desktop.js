"use strict";
// Nicole Encajes · app de administración (Jefferson): carga web/jefferson con su clave cifrada.
{
  const { app, BrowserWindow, ipcMain, shell, safeStorage } = require("electron");
  const fs = require("node:fs");
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
  // La clave privada de Jefferson se cifra con el almacén seguro de Windows.
  ipcMain.handle("family:access:get", (event) => {
    if (!senderValid(event) || !safeStorage.isEncryptionAvailable()) return "";
    try {
      const bytes = fs.readFileSync(path.join(app.getPath("userData"), "nicole-access.bin"));
      const secret = safeStorage.decryptString(bytes);
      return /^[a-f0-9]{64}$/i.test(secret) ? secret : "";
    } catch { return ""; }
  });
  ipcMain.handle("family:access:put", (event, secret) => {
    if (!senderValid(event) || !safeStorage.isEncryptionAvailable()) return false;
    if (typeof secret !== "string" || !/^[a-f0-9]{64}$/i.test(secret)) return false;
    const file = path.join(app.getPath("userData"), "nicole-access.bin");
    const temp = file + ".tmp";
    try {
      fs.writeFileSync(temp, safeStorage.encryptString(secret), { mode: 0o600 });
      fs.renameSync(temp, file);
      return true;
    } catch { try { fs.rmSync(temp, { force: true }); } catch {} return false; }
  });
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
