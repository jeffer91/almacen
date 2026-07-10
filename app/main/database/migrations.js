/* =========================================================
Nombre completo: migrations.js
Ruta o ubicación: /app/main/database/migrations.js
Función o funciones:
- Definir las migraciones versionadas de la base local.
- Crear las tablas fundamentales de usuarios, canales y equipos.
- Preparar auditoría, salud del sistema y cola de sincronización.
- Insertar los usuarios y canales iniciales de la familia.
- Registrar diagnósticos generales y pruebas de pantallas.
- Crear el catálogo de productos, variaciones, fotografías y eventos.
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
  }),
  Object.freeze({
    version: 3,
    name: "diagnosticos_aplicacion_y_pantallas",
    sql: `
      CREATE TABLE diagnostic_runs (
        id TEXT PRIMARY KEY,
        device_id TEXT,
        overall_status TEXT NOT NULL CHECK (overall_status IN ('healthy', 'warning', 'error')),
        passed_count INTEGER NOT NULL DEFAULT 0 CHECK (passed_count >= 0),
        warning_count INTEGER NOT NULL DEFAULT 0 CHECK (warning_count >= 0),
        failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
        duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
        app_version TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT NOT NULL,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE diagnostic_checks (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        area TEXT NOT NULL CHECK (area IN ('application', 'profile', 'database', 'preferences', 'screen')),
        check_key TEXT NOT NULL,
        label TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('passed', 'warning', 'failed')),
        message TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}',
        duration_ms INTEGER NOT NULL DEFAULT 0 CHECK (duration_ms >= 0),
        created_at TEXT NOT NULL,
        FOREIGN KEY (run_id) REFERENCES diagnostic_runs(id) ON UPDATE CASCADE ON DELETE CASCADE
      ) STRICT;

      CREATE TABLE screen_reports (
        screen_key TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('passed', 'warning', 'failed')),
        message TEXT NOT NULL,
        details_json TEXT NOT NULL DEFAULT '{}',
        reported_at TEXT NOT NULL
      ) STRICT, WITHOUT ROWID;

      CREATE INDEX idx_diagnostic_runs_completed_at ON diagnostic_runs(completed_at DESC);
      CREATE INDEX idx_diagnostic_checks_run ON diagnostic_checks(run_id, area, status);
      CREATE INDEX idx_screen_reports_status ON screen_reports(status, reported_at DESC);
    `
  }),
  Object.freeze({
    version: 4,
    name: "catalogo_productos_variaciones_y_fotografias",
    sql: `
      CREATE TABLE products (
        id TEXT PRIMARY KEY,
        canonical_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        brand TEXT,
        category TEXT,
        description TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'retired')),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
        created_by_user_id TEXT NOT NULL,
        created_device_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        updated_device_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        retired_by_user_id TEXT,
        retired_device_id TEXT,
        retired_at TEXT,
        retirement_reason TEXT,
        restored_by_user_id TEXT,
        restored_device_id TEXT,
        restored_at TEXT,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (retired_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
        FOREIGN KEY (restored_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
        FOREIGN KEY (created_device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (updated_device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (retired_device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE SET NULL,
        FOREIGN KEY (restored_device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE product_variants (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        variant_name TEXT NOT NULL,
        normalized_name TEXT NOT NULL,
        presentation TEXT,
        unit_name TEXT,
        quantity_value REAL,
        internal_code TEXT,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'retired')),
        version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
        created_by_user_id TEXT NOT NULL,
        created_device_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_by_user_id TEXT NOT NULL,
        updated_device_id TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        retired_by_user_id TEXT,
        retired_device_id TEXT,
        retired_at TEXT,
        retirement_reason TEXT,
        restored_by_user_id TEXT,
        restored_device_id TEXT,
        restored_at TEXT,
        FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (retired_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
        FOREIGN KEY (restored_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
        FOREIGN KEY (created_device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (updated_device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (retired_device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE SET NULL,
        FOREIGN KEY (restored_device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE product_photos (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        variant_id TEXT,
        owner_user_id TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        local_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        file_size_bytes INTEGER NOT NULL DEFAULT 0 CHECK (file_size_bytes >= 0),
        width_pixels INTEGER CHECK (width_pixels IS NULL OR width_pixels > 0),
        height_pixels INTEGER CHECK (height_pixels IS NULL OR height_pixels > 0),
        checksum_sha256 TEXT,
        is_default_global INTEGER NOT NULL DEFAULT 0 CHECK (is_default_global IN (0, 1)),
        is_default_channel INTEGER NOT NULL DEFAULT 0 CHECK (is_default_channel IN (0, 1)),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'hidden', 'retired')),
        sync_status TEXT NOT NULL DEFAULT 'local_only' CHECK (
          sync_status IN ('local_only', 'metadata_pending', 'thumbnail_pending', 'full_pending', 'synced', 'failed')
        ),
        sync_error TEXT,
        replaces_photo_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        hidden_at TEXT,
        retired_at TEXT,
        FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON UPDATE CASCADE ON DELETE SET NULL,
        FOREIGN KEY (owner_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (replaces_photo_id) REFERENCES product_photos(id) ON UPDATE CASCADE ON DELETE SET NULL
      ) STRICT;

      CREATE TABLE product_links (
        id TEXT PRIMARY KEY,
        source_product_id TEXT NOT NULL,
        target_product_id TEXT NOT NULL,
        link_type TEXT NOT NULL CHECK (link_type IN ('replacement', 'duplicate', 'merged_into')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
        reason TEXT,
        created_by_user_id TEXT NOT NULL,
        created_device_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        revoked_by_user_id TEXT,
        revoked_device_id TEXT,
        revoked_at TEXT,
        FOREIGN KEY (source_product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (target_product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (created_device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (revoked_by_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
        FOREIGN KEY (revoked_device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE SET NULL,
        CHECK (source_product_id <> target_product_id)
      ) STRICT;

      CREATE TABLE catalog_events (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'variant', 'photo', 'link')),
        entity_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        actor_user_id TEXT NOT NULL,
        device_id TEXT NOT NULL,
        channel_id TEXT,
        previous_json TEXT,
        current_json TEXT NOT NULL DEFAULT '{}',
        reason TEXT,
        created_at TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'failed')),
        synchronized_at TEXT,
        FOREIGN KEY (product_id) REFERENCES products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (actor_user_id) REFERENCES users(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (device_id) REFERENCES devices(id) ON UPDATE CASCADE ON DELETE RESTRICT,
        FOREIGN KEY (channel_id) REFERENCES channels(id) ON UPDATE CASCADE ON DELETE SET NULL
      ) STRICT;

      CREATE UNIQUE INDEX idx_products_active_normalized_name
        ON products(normalized_name)
        WHERE status <> 'retired';

      CREATE UNIQUE INDEX idx_product_variants_active_name
        ON product_variants(product_id, normalized_name)
        WHERE status <> 'retired';

      CREATE UNIQUE INDEX idx_product_photos_global_default
        ON product_photos(product_id)
        WHERE is_default_global = 1 AND status = 'active';

      CREATE UNIQUE INDEX idx_product_photos_channel_default
        ON product_photos(product_id, channel_id)
        WHERE is_default_channel = 1 AND status = 'active';

      CREATE INDEX idx_products_status_name ON products(status, normalized_name);
      CREATE INDEX idx_product_variants_product_status ON product_variants(product_id, status, normalized_name);
      CREATE INDEX idx_product_photos_product_channel ON product_photos(product_id, channel_id, status);
      CREATE INDEX idx_product_photos_sync ON product_photos(sync_status, created_at);
      CREATE INDEX idx_product_links_source ON product_links(source_product_id, status);
      CREATE INDEX idx_product_links_target ON product_links(target_product_id, status);
      CREATE INDEX idx_catalog_events_product_created ON catalog_events(product_id, created_at DESC);
      CREATE INDEX idx_catalog_events_sync ON catalog_events(sync_status, created_at);
    `
  })
]);

module.exports = { MIGRATIONS };
