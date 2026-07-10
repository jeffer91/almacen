/* =========================================================
Nombre completo: migrations.js
Ruta o ubicación: /app/main/database/migrations.js
Función o funciones:
- Definir las migraciones versionadas de la base local.
- Crear las tablas fundamentales de usuarios, canales y equipos.
- Preparar auditoría, salud del sistema y cola de sincronización.
- Insertar los usuarios y canales iniciales de la familia.
========================================================= */

"use strict";

const MIGRATIONS = Object.freeze([
  Object.freeze({
    version: 1,
    name: "estructura_local_inicial",
    sql: `
      CREATE TABLE users (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('operator', 'administrator')),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE channels (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('physical_store', 'virtual_store')),
        owner_user_id TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT
      ) STRICT;

      CREATE TABLE devices (
        id TEXT PRIMARY KEY,
        device_name TEXT NOT NULL,
        platform TEXT NOT NULL,
        app_version TEXT NOT NULL,
        assigned_user_id TEXT,
        assigned_channel_id TEXT,
        first_registered_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        last_database_check_at TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'maintenance')),
        FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
        FOREIGN KEY (assigned_channel_id) REFERENCES channels(id) ON UPDATE CASCADE ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE device_settings (
        device_id TEXT NOT NULL,
        setting_key TEXT NOT NULL,
        setting_value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (device_id, setting_key),
        FOREIGN KEY (device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE CASCADE
      ) STRICT, WITHOUT ROWID;

      CREATE TABLE audit_events (
        id TEXT PRIMARY KEY,
        event_type TEXT NOT NULL,
        entity_type TEXT,
        entity_id TEXT,
        actor_user_id TEXT,
        device_id TEXT,
        details_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        synchronized_at TEXT,
        sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed')),
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE sync_queue (
        id TEXT PRIMARY KEY,
        source_table TEXT NOT NULL,
        record_id TEXT NOT NULL,
        operation TEXT NOT NULL CHECK (operation IN ('insert', 'update', 'archive', 'restore')),
        target TEXT NOT NULL DEFAULT 'primary',
        payload_json TEXT NOT NULL,
        priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 1 AND 100),
        attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
        next_attempt_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT
      ) STRICT;

      CREATE TABLE system_health (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        integrity_status TEXT NOT NULL CHECK (integrity_status IN ('unknown', 'healthy', 'warning', 'error')),
        last_integrity_check_at TEXT,
        last_error TEXT,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX idx_devices_assigned_user ON devices(assigned_user_id);
      CREATE INDEX idx_devices_assigned_channel ON devices(assigned_channel_id);
      CREATE INDEX idx_audit_events_created_at ON audit_events(created_at DESC);
      CREATE INDEX idx_audit_events_sync_status ON audit_events(sync_status, created_at);
      CREATE INDEX idx_sync_queue_pending ON sync_queue(completed_at, priority DESC, created_at);
    `
  }),
  Object.freeze({
    version: 2,
    name: "usuarios_canales_y_salud_inicial",
    sql: `
      INSERT OR IGNORE INTO users (id, display_name, role, is_active, created_at, updated_at)
      VALUES
        ('edgar', 'Edgar', 'operator', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('gloria', 'Gloria', 'operator', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('jefferson', 'Jefferson', 'administrator', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

      INSERT OR IGNORE INTO channels (id, name, type, owner_user_id, is_active, created_at, updated_at)
      VALUES
        ('local-edgar', 'Local de Edgar', 'physical_store', 'edgar', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('local-gloria', 'Local de Gloria', 'physical_store', 'gloria', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        ('tienda-virtual', 'Tienda virtual', 'virtual_store', 'jefferson', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

      INSERT OR IGNORE INTO system_health (id, integrity_status, last_integrity_check_at, last_error, updated_at)
      VALUES (1, 'unknown', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
    `
  })
]);

module.exports = { MIGRATIONS };
