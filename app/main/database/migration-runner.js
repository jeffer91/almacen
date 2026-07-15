/* =========================================================
Nombre completo: migration-runner.js
Ruta o ubicación: /app/main/database/migration-runner.js
Función o funciones:
- Crear el registro interno de migraciones aplicadas.
- Ejecutar migraciones en orden y dentro de transacciones.
- Verificar que una migración aplicada no cambie posteriormente.
- Reparar de forma segura el checksum de la migración 4 cuando el esquema real está completo.
- Informar la versión actual del esquema local.
========================================================= */

"use strict";

const crypto = require("node:crypto");

const REPAIRABLE_MIGRATION_STRUCTURES = Object.freeze({
  4: Object.freeze({
    tables: Object.freeze([
      "products",
      "product_variants",
      "product_photos",
      "product_links",
      "catalog_events"
    ]),
    indexes: Object.freeze([
      "idx_products_active_normalized_name",
      "idx_product_variants_active_name",
      "idx_product_photos_global_default",
      "idx_product_photos_channel_default",
      "idx_products_status_name",
      "idx_product_variants_product_status",
      "idx_product_photos_product_channel",
      "idx_product_photos_sync",
      "idx_product_links_source",
      "idx_product_links_target",
      "idx_catalog_events_product_created",
      "idx_catalog_events_sync"
    ])
  })
});

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

function schemaObjectExists(database, type, name) {
  return Boolean(
    database
      .prepare("SELECT 1 AS found FROM sqlite_master WHERE type = ? AND name = ? LIMIT 1")
      .get(type, name)
  );
}

function canRepairChecksumMismatch(database, migration) {
  const structure = REPAIRABLE_MIGRATION_STRUCTURES[migration.version];
  if (!structure) return false;

  const tablesComplete = structure.tables.every((name) => schemaObjectExists(database, "table", name));
  const indexesComplete = structure.indexes.every((name) => schemaObjectExists(database, "index", name));
  return tablesComplete && indexesComplete;
}

function repairMigrationMetadata(database, migration, migrationChecksum) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database
      .prepare("UPDATE schema_migrations SET name = ?, checksum = ? WHERE version = ?")
      .run(migration.name, migrationChecksum, migration.version);
    database.exec("COMMIT");
  } catch (error) {
    try {
      database.exec("ROLLBACK");
    } catch {
      // La transacción podría haberse cerrado automáticamente.
    }
    error.code = error.code || "MIGRATION_METADATA_REPAIR_FAILED";
    throw error;
  }
}

function runMigrations(database, migrations) {
  ensureMigrationTable(database);

  const appliedRows = database
    .prepare("SELECT version, name, checksum, applied_at FROM schema_migrations ORDER BY version")
    .all();
  const applied = new Map(appliedRows.map((row) => [Number(row.version), row]));
  const ordered = [...migrations].sort((a, b) => a.version - b.version);
  const newlyApplied = [];
  const repaired = [];

  for (const migration of ordered) {
    const migrationChecksum = checksum(migration.sql);
    const existing = applied.get(migration.version);

    if (existing) {
      const nameMatches = existing.name === migration.name;
      const checksumMatches = existing.checksum === migrationChecksum;

      if (!nameMatches || !checksumMatches) {
        if (nameMatches && canRepairChecksumMismatch(database, migration)) {
          repairMigrationMetadata(database, migration, migrationChecksum);
          repaired.push(migration.version);
          continue;
        }

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
    newlyApplied,
    repaired
  };
}

module.exports = {
  REPAIRABLE_MIGRATION_STRUCTURES,
  canRepairChecksumMismatch,
  checksum,
  ensureMigrationTable,
  runMigrations
};
