/* =========================================================
Nombre completo: local-database-service.js
Ruta o ubicación: /app/main/database/local-database-service.js
Función o funciones:
- Inicializar la base local y ejecutar sus migraciones.
- Registrar el perfil y el equipo que utiliza la instalación.
- Guardar configuraciones locales por dispositivo.
- Ejecutar pruebas de integridad y claves foráneas.
- Entregar un resumen técnico para el Centro de control.
========================================================= */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { MIGRATIONS } = require("./migrations");
const { openLocalDatabase } = require("./connection");
const { runMigrations } = require("./migration-runner");

const REQUIRED_TABLES = Object.freeze([
  "schema_migrations",
  "users",
  "channels",
  "devices",
  "device_settings",
  "audit_events",
  "sync_queue",
  "system_health"
]);

function nowIso() {
  return new Date().toISOString();
}

function normalizeRows(rows) {
  return rows.map((row) => ({ ...row }));
}

class LocalDatabaseService {
  constructor() {
    this.database = null;
    this.filePath = null;
    this.initialized = false;
    this.startupError = null;
    this.migrationResult = null;
    this.lastDiagnostic = null;
  }

  initialize({ userDataPath, appVersion, profile = null }) {
    if (this.initialized && this.database) {
      if (profile) {
        this.registerDeviceProfile(profile, appVersion);
      }
      return this.getSummary();
    }

    try {
      const opened = openLocalDatabase(userDataPath);
      this.database = opened.database;
      this.filePath = opened.filePath;
      this.migrationResult = runMigrations(this.database, MIGRATIONS);
      this.initialized = true;
      this.startupError = null;

      if (profile) {
        this.registerDeviceProfile(profile, appVersion);
      }

      this.lastDiagnostic = this.runDiagnostic();
      return this.getSummary();
    } catch (error) {
      this.startupError = {
        code: error.code || "DATABASE_STARTUP_FAILED",
        message: error.message || "No se pudo iniciar la base local."
      };
      this.close();
      throw error;
    }
  }

  assertReady() {
    if (!this.initialized || !this.database) {
      const error = new Error("La base local todavía no está disponible.");
      error.code = "DATABASE_NOT_READY";
      throw error;
    }
  }

  registerDeviceProfile(profile, appVersion) {
    this.assertReady();

    if (!profile?.deviceId || !profile?.id || !profile?.channelId) {
      const error = new Error("El perfil del dispositivo está incompleto.");
      error.code = "DEVICE_PROFILE_INVALID";
      throw error;
    }

    const current = this.database
      .prepare(
        `SELECT id, assigned_user_id, assigned_channel_id
         FROM devices
         WHERE id = ?`
      )
      .get(profile.deviceId);
    const timestamp = nowIso();

    this.database
      .prepare(
        `INSERT INTO devices (
          id, device_name, platform, app_version, assigned_user_id, assigned_channel_id,
          first_registered_at, last_seen_at, last_database_check_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'active')
        ON CONFLICT(id) DO UPDATE SET
          device_name = excluded.device_name,
          platform = excluded.platform,
          app_version = excluded.app_version,
          assigned_user_id = excluded.assigned_user_id,
          assigned_channel_id = excluded.assigned_channel_id,
          last_seen_at = excluded.last_seen_at,
          status = 'active'`
      )
      .run(
        profile.deviceId,
        os.hostname(),
        process.platform,
        appVersion,
        profile.id,
        profile.channelId,
        profile.configuredAt || timestamp,
        timestamp
      );

    const changedAssignment =
      !current ||
      current.assigned_user_id !== profile.id ||
      current.assigned_channel_id !== profile.channelId;

    if (changedAssignment) {
      this.database
        .prepare(
          `INSERT INTO audit_events (
            id, event_type, entity_type, entity_id, actor_user_id, device_id,
            details_json, created_at, synchronized_at, sync_status
          ) VALUES (?, 'device_profile_assigned', 'device', ?, ?, ?, ?, ?, NULL, 'pending')`
        )
        .run(
          crypto.randomUUID(),
          profile.deviceId,
          profile.id,
          profile.deviceId,
          JSON.stringify({
            previousUserId: current?.assigned_user_id || null,
            previousChannelId: current?.assigned_channel_id || null,
            assignedUserId: profile.id,
            assignedChannelId: profile.channelId
          }),
          timestamp
        );
    }

    return this.getDevice(profile.deviceId);
  }

  getDevice(deviceId) {
    this.assertReady();

    const row = this.database
      .prepare(
        `SELECT d.*, u.display_name AS assigned_user_name, c.name AS assigned_channel_name
         FROM devices d
         LEFT JOIN users u ON u.id = d.assigned_user_id
         LEFT JOIN channels c ON c.id = d.assigned_channel_id
         WHERE d.id = ?`
      )
      .get(deviceId);

    return row ? { ...row } : null;
  }

  setDeviceSetting(deviceId, key, value) {
    this.assertReady();

    const serialized = JSON.stringify(value);
    const timestamp = nowIso();

    this.database
      .prepare(
        `INSERT INTO device_settings (device_id, setting_key, setting_value, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(device_id, setting_key) DO UPDATE SET
           setting_value = excluded.setting_value,
           updated_at = excluded.updated_at`
      )
      .run(deviceId, key, serialized, timestamp);
  }

  getDeviceSetting(deviceId, key, fallback = null) {
    this.assertReady();

    const row = this.database
      .prepare(
        "SELECT setting_value FROM device_settings WHERE device_id = ? AND setting_key = ?"
      )
      .get(deviceId, key);

    if (!row) {
      return fallback;
    }

    try {
      return JSON.parse(row.setting_value);
    } catch {
      return fallback;
    }
  }

  runDiagnostic() {
    this.assertReady();

    const startedAt = Date.now();
    const checkedAt = nowIso();

    try {
      const quickCheck = normalizeRows(this.database.prepare("PRAGMA quick_check").all());
      const foreignKeyIssues = normalizeRows(
        this.database.prepare("PRAGMA foreign_key_check").all()
      );
      const journalRow = this.database.prepare("PRAGMA journal_mode").get();
      const tableRows = normalizeRows(
        this.database
          .prepare(
            `SELECT name
             FROM sqlite_schema
             WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
             ORDER BY name`
          )
          .all()
      );
      const tables = tableRows.map((row) => row.name);
      const missingTables = REQUIRED_TABLES.filter((table) => !tables.includes(table));
      const quickCheckHealthy =
        quickCheck.length === 1 &&
        String(Object.values(quickCheck[0])[0]).toLowerCase() === "ok";
      const healthy =
        quickCheckHealthy && foreignKeyIssues.length === 0 && missingTables.length === 0;
      const fileStats = fs.statSync(this.filePath);
      const counts = {};

      for (const table of [
        "schema_migrations",
        "users",
        "channels",
        "devices",
        "audit_events",
        "sync_queue"
      ]) {
        const row = this.database.prepare(`SELECT COUNT(*) AS total FROM ${table}`).get();
        counts[table] = Number(row.total);
      }

      this.database
        .prepare(
          `UPDATE system_health
           SET integrity_status = ?, last_integrity_check_at = ?, last_error = NULL, updated_at = ?
           WHERE id = 1`
        )
        .run(healthy ? "healthy" : "warning", checkedAt, checkedAt);

      this.database
        .prepare("UPDATE devices SET last_database_check_at = ? WHERE status = 'active'")
        .run(checkedAt);

      this.lastDiagnostic = {
        healthy,
        status: healthy ? "healthy" : "warning",
        checkedAt,
        durationMs: Date.now() - startedAt,
        schemaVersion: this.migrationResult?.schemaVersion || 0,
        journalMode: String(Object.values(journalRow || { journal_mode: "unknown" })[0]),
        fileSizeBytes: fileStats.size,
        quickCheck,
        foreignKeyIssues,
        tables,
        missingTables,
        counts
      };

      return this.lastDiagnostic;
    } catch (error) {
      try {
        this.database
          .prepare(
            `UPDATE system_health
             SET integrity_status = 'error', last_integrity_check_at = ?, last_error = ?, updated_at = ?
             WHERE id = 1`
          )
          .run(checkedAt, error.message, checkedAt);
      } catch {
        // La base podría no aceptar escrituras durante el fallo.
      }

      this.lastDiagnostic = {
        healthy: false,
        status: "error",
        checkedAt,
        durationMs: Date.now() - startedAt,
        error: error.message
      };

      return this.lastDiagnostic;
    }
  }

  getSummary() {
    return {
      initialized: this.initialized,
      healthy: Boolean(this.lastDiagnostic?.healthy),
      status: this.startupError
        ? "error"
        : this.lastDiagnostic?.status || (this.initialized ? "unknown" : "not_initialized"),
      schemaVersion: this.migrationResult?.schemaVersion || 0,
      migrationCount: this.migrationResult?.appliedCount || 0,
      lastCheckAt: this.lastDiagnostic?.checkedAt || null,
      startupError: this.startupError
    };
  }

  getAdminStatus() {
    return {
      ...this.getSummary(),
      filePath: this.filePath,
      diagnostic: this.lastDiagnostic,
      migrations: this.migrationResult
    };
  }

  close() {
    if (this.database) {
      try {
        this.database.close();
      } catch (error) {
        console.warn("No fue posible cerrar la base local:", error);
      }
    }

    this.database = null;
    this.initialized = false;
  }
}

module.exports = {
  LocalDatabaseService,
  REQUIRED_TABLES
};
