/* =========================================================
Nombre completo: migration-runner.js
Ruta o ubicación: /app/main/database/migration-runner.js
Función o funciones:
- Crear el registro interno de migraciones aplicadas.
- Ejecutar migraciones en orden y dentro de transacciones.
- Verificar que una migración aplicada no cambie posteriormente.
- Informar la versión actual del esquema local.
========================================================= */

"use strict";

const crypto = require("node:crypto");

function checksum(sql) {
  return crypto.createHash("sha256").update(sql, "utf8").digest("hex");
}

function ensureMigrationTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `);
}

function runMigrations(database, migrations) {
  ensureMigrationTable(database);

  const appliedRows = database
    .prepare("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version")
    .all();
  const applied = new Map(appliedRows.map((row) => [Number(row.version), row]));
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const newlyApplied = [];

  for (const migration of ordered) {
    const migrationChecksum = checksum(migration.sql);
    const existing = applied.get(migration.version);

    if (existing) {
      if (existing.name !== migration.name || existing.checksum !== migrationChecksum) {
        const error = new Error(
          `La migración ${migration.version} ya fue aplicada, pero su contenido cambió.`
        );
        error.code = "MIGRATION_CHECKSUM_MISMATCH";
        throw error;
      }
      continue;
    }

    database.exec("BEGIN IMMEDIATE");

    try {
      database.exec(migration.sql);
      database
        .prepare(
          "INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)"
        )
        .run(
          migration.version,
          migration.name,
          migrationChecksum,
          new Date().toISOString()
        );
      database.exec("COMMIT");
      newlyApplied.push(migration.version);
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // La transacción podría haberse cerrado automáticamente.
      }

      error.code = error.code || "MIGRATION_FAILED";
      throw error;
    }
  }

  const latest = database
    .prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations")
    .get();

  return {
    schemaVersion: Number(latest.version),
    appliedCount: appliedRows.length + newlyApplied.length,
    newlyApplied
  };
}

module.exports = {
  checksum,
  ensureMigrationTable,
  runMigrations
};
