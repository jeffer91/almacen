/* =========================================================
Nombre completo: connection.js
Ruta o ubicación: /app/main/database/connection.js
Función o funciones:
- Crear la carpeta de datos local de la aplicación.
- Abrir la base SQLite del equipo.
- Activar claves foráneas, WAL y espera ante bloqueos.
- Detectar y explicar si SQLite no está disponible.
- Mantener una ruta única para el archivo local.
========================================================= */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DATABASE_DIRECTORY = "data";
const DATABASE_FILE = "almacen-familiar.sqlite3";

function databasePath(userDataPath) {
  return path.join(userDataPath, DATABASE_DIRECTORY, DATABASE_FILE);
}

function loadDatabaseSync() {
  try {
    return require("node:sqlite").DatabaseSync;
  } catch (error) {
    const wrapped = new Error(
      "La versión instalada de la aplicación no incluye el motor SQLite requerido."
    );
    wrapped.code = "SQLITE_MODULE_UNAVAILABLE";
    wrapped.cause = error;
    throw wrapped;
  }
}

function openLocalDatabase(userDataPath) {
  const DatabaseSync = loadDatabaseSync();
  const filePath = databasePath(userDataPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  const database = new DatabaseSync(filePath, {
    open: true,
    readOnly: false,
    enableForeignKeyConstraints: true,
    enableDoubleQuotedStringLiterals: false,
    allowExtension: false,
    timeout: 5000
  });

  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA busy_timeout = 5000;
    PRAGMA temp_store = MEMORY;
    PRAGMA trusted_schema = OFF;
  `);

  return {
    database,
    filePath
  };
}

module.exports = {
  DATABASE_DIRECTORY,
  DATABASE_FILE,
  databasePath,
  loadDatabaseSync,
  openLocalDatabase
};
