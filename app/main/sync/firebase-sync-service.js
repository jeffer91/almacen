/* =========================================================
Nombre completo: firebase-sync-service.js
Ruta o ubicación: /app/main/sync/firebase-sync-service.js
Función o funciones:
- Sincronizar el catálogo local con Firebase Firestore mediante REST.
- Publicar una instantánea por computadora.
- Descargar y combinar datos de otras computadoras por fecha de actualización.
- Mantener estado, errores y reintentos sin impedir el trabajo local.
Con qué se conecta:
- app/main/database/local-database-service.js
- app/main/main.js
- Firebase proyecto Jeff (jeff-2f92d)
========================================================= */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const MAX_FIRESTORE_PHOTO_BYTES = 520 * 1024;

const DEFAULT_CONFIG = Object.freeze({
  apiKey: process.env.ALMACEN_FIREBASE_API_KEY || "AIzaSyAXO_u1O0-8NYQL6oM8GWBdcmr2_--9Dp8",
  projectId: process.env.ALMACEN_FIREBASE_PROJECT_ID || "almacen-59227",
  collection: process.env.ALMACEN_FIREBASE_COLLECTION || "almacen_familiar_devices"
});

function nowIso() {
  return new Date().toISOString();
}

function syncError(code, message, cause = null) {
  const error = new Error(message);
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function safeJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function latestDate(...values) {
  return values
    .filter(Boolean)
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
    .reduce((max, value) => Math.max(max, value), 0);
}

class FirebaseSyncService {
  constructor({ databaseService, userDataPath, fetchImpl = globalThis.fetch, config = DEFAULT_CONFIG }) {
    this.databaseService = databaseService;
    this.userDataPath = userDataPath;
    this.fetch = fetchImpl;
    this.config = { ...DEFAULT_CONFIG, ...(config || {}) };
    this.running = false;
  }

  get database() {
    this.databaseService.assertReady();
    return this.databaseService.database;
  }

  isConfigured() {
    return Boolean(this.config.apiKey && this.config.projectId && this.config.collection && this.fetch);
  }

  baseUrl() {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.config.projectId)}/databases/(default)/documents/${encodeURIComponent(this.config.collection)}`;
  }

  documentUrl(deviceId) {
    return `${this.baseUrl()}/${encodeURIComponent(deviceId)}?key=${encodeURIComponent(this.config.apiKey)}`;
  }

  listUrl() {
    return `${this.baseUrl()}?pageSize=100&key=${encodeURIComponent(this.config.apiKey)}`;
  }

  photoCollection() {
    return `${this.config.collection}_photos`;
  }

  photoBaseUrl() {
    return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(this.config.projectId)}/databases/(default)/documents/${encodeURIComponent(this.photoCollection())}`;
  }

  photoDocumentUrl(photoId) {
    return `${this.photoBaseUrl()}/${encodeURIComponent(photoId)}?key=${encodeURIComponent(this.config.apiKey)}`;
  }

  photoListUrl() {
    return `${this.photoBaseUrl()}?pageSize=1000&key=${encodeURIComponent(this.config.apiKey)}`;
  }

  setState(patch) {
    const current = this.database.prepare("SELECT * FROM sync_state WHERE id = 1").get() || {};
    const next = {
      status: patch.status ?? current.status ?? "idle",
      lastRunAt: patch.lastRunAt ?? current.last_run_at ?? null,
      lastSuccessAt: patch.lastSuccessAt ?? current.last_success_at ?? null,
      lastError: patch.lastError ?? current.last_error ?? null,
      remoteDocuments: patch.remoteDocuments ?? Number(current.remote_documents || 0),
      pushedRecords: patch.pushedRecords ?? Number(current.pushed_records || 0),
      pulledRecords: patch.pulledRecords ?? Number(current.pulled_records || 0),
      updatedAt: nowIso()
    };

    this.database
      .prepare(
        `INSERT INTO sync_state (
          id, status, last_run_at, last_success_at, last_error,
          remote_documents, pushed_records, pulled_records, updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          status = excluded.status,
          last_run_at = excluded.last_run_at,
          last_success_at = excluded.last_success_at,
          last_error = excluded.last_error,
          remote_documents = excluded.remote_documents,
          pushed_records = excluded.pushed_records,
          pulled_records = excluded.pulled_records,
          updated_at = excluded.updated_at`
      )
      .run(
        next.status,
        next.lastRunAt,
        next.lastSuccessAt,
        next.lastError,
        next.remoteDocuments,
        next.pushedRecords,
        next.pulledRecords,
        next.updatedAt
      );

    return this.getStatus();
  }

  getStatus() {
    const row = this.database.prepare("SELECT * FROM sync_state WHERE id = 1").get();
    const pending = this.database
      .prepare("SELECT COUNT(*) AS total FROM sync_queue WHERE completed_at IS NULL")
      .get();

    return {
      configured: this.isConfigured(),
      running: this.running,
      status: row?.status || "idle",
      lastRunAt: row?.last_run_at || null,
      lastSuccessAt: row?.last_success_at || null,
      lastError: row?.last_error || null,
      remoteDocuments: Number(row?.remote_documents || 0),
      pushedRecords: Number(row?.pushed_records || 0),
      pulledRecords: Number(row?.pulled_records || 0),
      pendingRecords: Number(pending.total || 0),
      projectId: this.config.projectId,
      collection: this.config.collection
    };
  }

  tableRows(table) {
    return this.database.prepare(`SELECT * FROM ${table}`).all().map((row) => ({ ...row }));
  }

  buildSnapshot(profile, appVersion) {
    const tables = [
      "products",
      "product_variants",
      "product_photos",
      "product_links",
      "suppliers",
      "product_costs",
      "product_prices"
    ];
    const data = {};
    for (const table of tables) {
      data[table] = this.tableRows(table);
    }
    data.product_photos = data.product_photos.map((photo) => ({
      ...photo,
      local_path: null
    }));

    return {
      schemaVersion: this.databaseService.getSummary().schemaVersion,
      appVersion,
      generatedAt: nowIso(),
      device: {
        id: profile.deviceId,
        userId: profile.id,
        channelId: profile.channelId,
        role: profile.role
      },
      data
    };
  }

  firestoreDocument(profile, appVersion, payload) {
    const updatedAt = nowIso();
    return {
      fields: {
        deviceId: { stringValue: profile.deviceId },
        profileId: { stringValue: profile.id },
        channelId: { stringValue: profile.channelId },
        appVersion: { stringValue: String(appVersion || "") },
        updatedAt: { timestampValue: updatedAt },
        payload: { stringValue: JSON.stringify(payload) }
      }
    };
  }

  async pushSnapshot(profile, appVersion) {
    const snapshot = this.buildSnapshot(profile, appVersion);
    const response = await this.fetch(this.documentUrl(profile.deviceId), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.firestoreDocument(profile, appVersion, snapshot))
    });

    if (!response.ok) {
      const text = await response.text();
      throw syncError("FIREBASE_PUSH_FAILED", `Firebase rechazó la subida (${response.status}). ${text.slice(0, 300)}`);
    }

    const pending = this.database
      .prepare("SELECT COUNT(*) AS total FROM sync_queue WHERE completed_at IS NULL")
      .get();
    const timestamp = nowIso();
    this.database
      .prepare(
        `UPDATE sync_queue
         SET completed_at = ?, updated_at = ?, last_error = NULL
         WHERE completed_at IS NULL AND source_table <> 'product_photos'`
      )
      .run(timestamp, timestamp);
    this.database
      .prepare("UPDATE audit_events SET sync_status = 'synced', synchronized_at = ? WHERE sync_status = 'pending'")
      .run(timestamp);
    this.database
      .prepare("UPDATE catalog_events SET sync_status = 'synced', synchronized_at = ? WHERE sync_status = 'pending'")
      .run(timestamp);
    this.database
      .prepare("UPDATE product_costs SET sync_status = 'synced', synchronized_at = ? WHERE sync_status = 'pending'")
      .run(timestamp);
    this.database
      .prepare("UPDATE product_prices SET sync_status = 'synced', synchronized_at = ? WHERE sync_status = 'pending'")
      .run(timestamp);
    this.database
      .prepare(
        `UPDATE sync_queue
         SET completed_at = ?, updated_at = ?, last_error = NULL
         WHERE completed_at IS NULL
           AND source_table = 'product_photos'
           AND EXISTS (
             SELECT 1
             FROM product_photos pp
             WHERE pp.id = sync_queue.record_id
               AND (pp.status <> 'active' OR pp.sync_status = 'synced')
           )`
      )
      .run(timestamp, timestamp);

    return { pushedRecords: Number(pending.total || 0), snapshot };
  }


  photoDocument(photo, contentBase64) {
    return {
      fields: {
        photoId: { stringValue: photo.id },
        sourceDeviceId: { stringValue: photo.device_id || "" },
        fileName: { stringValue: photo.file_name || `${photo.id}.jpg` },
        mimeType: { stringValue: photo.mime_type || "image/jpeg" },
        checksumSha256: { stringValue: photo.checksum_sha256 || "" },
        fileSizeBytes: { integerValue: String(photo.file_size_bytes || 0) },
        updatedAt: { timestampValue: photo.updated_at || nowIso() },
        contentBase64: { stringValue: contentBase64 }
      }
    };
  }

  async uploadPhotos() {
    const rows = this.database
      .prepare(
        `SELECT * FROM product_photos
         WHERE status = 'active' AND sync_status <> 'synced'
         ORDER BY created_at`
      )
      .all();
    let uploaded = 0;

    for (const photo of rows) {
      if (!photo.local_path || String(photo.local_path).startsWith("remote://") || !fs.existsSync(photo.local_path)) {
        continue;
      }

      const buffer = fs.readFileSync(photo.local_path);
      if (!buffer.length || buffer.length > MAX_FIRESTORE_PHOTO_BYTES) {
        this.database
          .prepare("UPDATE product_photos SET sync_status = 'failed', sync_error = ? WHERE id = ?")
          .run("La fotografía supera el tamaño permitido para sincronización.", photo.id);
        continue;
      }

      const response = await this.fetch(this.photoDocumentUrl(photo.id), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(this.photoDocument(photo, buffer.toString("base64")))
      });

      if (!response.ok) {
        const text = await response.text();
        this.database
          .prepare("UPDATE product_photos SET sync_status = 'failed', sync_error = ? WHERE id = ?")
          .run(`Firebase rechazó la fotografía (${response.status}). ${text.slice(0, 220)}`, photo.id);
        continue;
      }

      const timestamp = nowIso();
      this.database
        .prepare("UPDATE product_photos SET sync_status = 'synced', sync_error = NULL, updated_at = ? WHERE id = ?")
        .run(timestamp, photo.id);
      this.database
        .prepare(
          `UPDATE sync_queue SET completed_at = ?, updated_at = ?, last_error = NULL
           WHERE completed_at IS NULL AND source_table = 'product_photos' AND record_id = ?`
        )
        .run(timestamp, timestamp, photo.id);
      uploaded += 1;
    }

    return uploaded;
  }

  parsePhotoDocument(document) {
    const fields = document?.fields || {};
    const photoId = fields.photoId?.stringValue;
    const contentBase64 = fields.contentBase64?.stringValue;
    if (!photoId || !contentBase64) return null;
    return {
      photoId,
      sourceDeviceId: fields.sourceDeviceId?.stringValue || null,
      fileName: fields.fileName?.stringValue || `${photoId}.jpg`,
      mimeType: fields.mimeType?.stringValue || "image/jpeg",
      checksumSha256: fields.checksumSha256?.stringValue || null,
      fileSizeBytes: Number(fields.fileSizeBytes?.integerValue || 0),
      updatedAt: fields.updatedAt?.timestampValue || document.updateTime || null,
      contentBase64
    };
  }

  async fetchPhotoDocuments() {
    const response = await this.fetch(this.photoListUrl(), { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw syncError(
        "FIREBASE_PHOTO_PULL_FAILED",
        `Firebase rechazó la descarga de fotografías (${response.status}). ${text.slice(0, 300)}`
      );
    }
    const body = await response.json();
    return (body.documents || []).map((document) => this.parsePhotoDocument(document)).filter(Boolean);
  }

  restoreRemotePhotos(documents, currentDeviceId) {
    const directory = path.join(this.userDataPath, "photos");
    fs.mkdirSync(directory, { recursive: true });
    let restored = 0;

    for (const document of documents || []) {
      if (document.sourceDeviceId === currentDeviceId) continue;
      const row = this.database.prepare("SELECT * FROM product_photos WHERE id = ?").get(document.photoId);
      if (!row) continue;
      if (row.local_path && !String(row.local_path).startsWith("remote://") && fs.existsSync(row.local_path)) {
        continue;
      }

      let buffer;
      try {
        buffer = Buffer.from(document.contentBase64, "base64");
      } catch {
        continue;
      }
      if (!buffer.length || buffer.length > MAX_FIRESTORE_PHOTO_BYTES) continue;
      if (document.checksumSha256) {
        const actual = require("node:crypto").createHash("sha256").update(buffer).digest("hex");
        if (actual !== document.checksumSha256) continue;
      }

      const safeName = `${document.photoId}.jpg`.replace(/[^a-zA-Z0-9._-]/g, "_");
      const localPath = path.join(directory, safeName);
      fs.writeFileSync(localPath, buffer);
      this.database
        .prepare(
          `UPDATE product_photos SET
             local_path = ?, file_name = ?, mime_type = ?, file_size_bytes = ?,
             checksum_sha256 = COALESCE(?, checksum_sha256), sync_status = 'synced',
             sync_error = NULL, updated_at = COALESCE(?, updated_at)
           WHERE id = ?`
        )
        .run(
          localPath,
          safeName,
          document.mimeType,
          buffer.length,
          document.checksumSha256,
          document.updatedAt,
          document.photoId
        );
      restored += 1;
    }

    return restored;
  }

  parseDocument(document) {
    const fields = document?.fields || {};
    const payload = safeJson(fields.payload?.stringValue, null);
    if (!payload?.device?.id || !payload?.data) return null;
    return {
      name: document.name,
      updateTime: document.updateTime || fields.updatedAt?.timestampValue || null,
      payload
    };
  }

  async fetchSnapshots() {
    const response = await this.fetch(this.listUrl(), { method: "GET" });
    if (!response.ok) {
      const text = await response.text();
      throw syncError("FIREBASE_PULL_FAILED", `Firebase rechazó la descarga (${response.status}). ${text.slice(0, 300)}`);
    }

    const body = await response.json();
    return (body.documents || []).map((document) => this.parseDocument(document)).filter(Boolean);
  }

  ensureRemoteDevice(snapshot) {
    const device = snapshot.device;
    const userId = ["edgar", "gloria", "jefferson"].includes(device.userId) ? device.userId : "jefferson";
    const channelId = ["local-edgar", "local-gloria", "tienda-virtual"].includes(device.channelId)
      ? device.channelId
      : "tienda-virtual";
    const timestamp = snapshot.generatedAt || nowIso();

    this.database
      .prepare(
        `INSERT INTO devices (
          id, device_name, platform, app_version, assigned_user_id, assigned_channel_id,
          first_registered_at, last_seen_at, last_database_check_at, status
        ) VALUES (?, ?, 'remote', ?, ?, ?, ?, ?, NULL, 'active')
        ON CONFLICT(id) DO UPDATE SET
          app_version = excluded.app_version,
          assigned_user_id = excluded.assigned_user_id,
          assigned_channel_id = excluded.assigned_channel_id,
          last_seen_at = excluded.last_seen_at`
      )
      .run(
        device.id,
        `Equipo remoto ${userId}`,
        snapshot.appVersion || "remoto",
        userId,
        channelId,
        timestamp,
        timestamp
      );
  }

  shouldReplace(local, remote, dateFields) {
    if (!local) return true;
    const localDate = latestDate(...dateFields.map((field) => local[field]));
    const remoteDate = latestDate(...dateFields.map((field) => remote[field]));
    return remoteDate > localDate;
  }

  mergeProducts(rows) {
    let count = 0;
    for (const row of rows || []) {
      const local = this.database.prepare("SELECT * FROM products WHERE id = ?").get(row.id);
      if (!this.shouldReplace(local, row, ["updated_at", "created_at", "retired_at", "restored_at"])) continue;
      this.database
        .prepare(
          `INSERT INTO products (
            id, canonical_name, normalized_name, brand, category, description, notes,
            status, version, created_by_user_id, created_device_id, created_at,
            updated_by_user_id, updated_device_id, updated_at,
            retired_by_user_id, retired_device_id, retired_at, retirement_reason,
            restored_by_user_id, restored_device_id, restored_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            canonical_name = excluded.canonical_name,
            normalized_name = excluded.normalized_name,
            brand = excluded.brand,
            category = excluded.category,
            description = excluded.description,
            notes = excluded.notes,
            status = excluded.status,
            version = excluded.version,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_device_id = excluded.updated_device_id,
            updated_at = excluded.updated_at,
            retired_by_user_id = excluded.retired_by_user_id,
            retired_device_id = excluded.retired_device_id,
            retired_at = excluded.retired_at,
            retirement_reason = excluded.retirement_reason,
            restored_by_user_id = excluded.restored_by_user_id,
            restored_device_id = excluded.restored_device_id,
            restored_at = excluded.restored_at`
        )
        .run(
          row.id, row.canonical_name, row.normalized_name, row.brand, row.category, row.description, row.notes,
          row.status, row.version, row.created_by_user_id, row.created_device_id, row.created_at,
          row.updated_by_user_id, row.updated_device_id, row.updated_at,
          row.retired_by_user_id, row.retired_device_id, row.retired_at, row.retirement_reason,
          row.restored_by_user_id, row.restored_device_id, row.restored_at
        );
      count += 1;
    }
    return count;
  }

  mergeVariants(rows) {
    let count = 0;
    for (const row of rows || []) {
      const local = this.database.prepare("SELECT * FROM product_variants WHERE id = ?").get(row.id);
      if (!this.shouldReplace(local, row, ["updated_at", "created_at", "retired_at", "restored_at"])) continue;
      this.database
        .prepare(
          `INSERT INTO product_variants (
            id, product_id, variant_name, normalized_name, presentation, unit_name,
            quantity_value, internal_code, notes, status, version,
            created_by_user_id, created_device_id, created_at,
            updated_by_user_id, updated_device_id, updated_at,
            retired_by_user_id, retired_device_id, retired_at, retirement_reason,
            restored_by_user_id, restored_device_id, restored_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            variant_name = excluded.variant_name,
            normalized_name = excluded.normalized_name,
            presentation = excluded.presentation,
            unit_name = excluded.unit_name,
            quantity_value = excluded.quantity_value,
            internal_code = excluded.internal_code,
            notes = excluded.notes,
            status = excluded.status,
            version = excluded.version,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_device_id = excluded.updated_device_id,
            updated_at = excluded.updated_at,
            retired_by_user_id = excluded.retired_by_user_id,
            retired_device_id = excluded.retired_device_id,
            retired_at = excluded.retired_at,
            retirement_reason = excluded.retirement_reason,
            restored_by_user_id = excluded.restored_by_user_id,
            restored_device_id = excluded.restored_device_id,
            restored_at = excluded.restored_at`
        )
        .run(
          row.id, row.product_id, row.variant_name, row.normalized_name, row.presentation, row.unit_name,
          row.quantity_value, row.internal_code, row.notes, row.status, row.version,
          row.created_by_user_id, row.created_device_id, row.created_at,
          row.updated_by_user_id, row.updated_device_id, row.updated_at,
          row.retired_by_user_id, row.retired_device_id, row.retired_at, row.retirement_reason,
          row.restored_by_user_id, row.restored_device_id, row.restored_at
        );
      count += 1;
    }
    return count;
  }

  mergeSimple(table, rows, columns) {
    let count = 0;
    const placeholders = columns.map(() => "?").join(", ");
    const insert = this.database.prepare(
      `INSERT OR IGNORE INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`
    );
    for (const row of rows || []) {
      const result = insert.run(...columns.map((column) => row[column] ?? null));
      count += Number(result.changes || 0);
    }
    return count;
  }

  mergeSuppliers(rows) {
    let count = 0;
    for (const row of rows || []) {
      const local = this.database.prepare("SELECT * FROM suppliers WHERE id = ?").get(row.id);
      if (!this.shouldReplace(local, row, ["updated_at", "created_at"])) continue;
      this.database
        .prepare(
          `INSERT INTO suppliers (
            id, name, normalized_name, contact_name, phone, email, notes, status,
            created_by_user_id, created_device_id, created_at,
            updated_by_user_id, updated_device_id, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            normalized_name = excluded.normalized_name,
            contact_name = excluded.contact_name,
            phone = excluded.phone,
            email = excluded.email,
            notes = excluded.notes,
            status = excluded.status,
            updated_by_user_id = excluded.updated_by_user_id,
            updated_device_id = excluded.updated_device_id,
            updated_at = excluded.updated_at`
        )
        .run(
          row.id, row.name, row.normalized_name, row.contact_name, row.phone, row.email, row.notes, row.status,
          row.created_by_user_id, row.created_device_id, row.created_at,
          row.updated_by_user_id, row.updated_device_id, row.updated_at
        );
      count += 1;
    }
    return count;
  }

  mergePhotos(rows) {
    let count = 0;
    for (const row of rows || []) {
      const existing = this.database.prepare("SELECT id FROM product_photos WHERE id = ?").get(row.id);
      if (existing) continue;
      const remotePath = `remote://${row.device_id || "equipo"}/${row.file_name || row.id}`;
      try {
        this.database
          .prepare(
            `INSERT INTO product_photos (
              id, product_id, variant_id, owner_user_id, channel_id, device_id,
              local_path, file_name, mime_type, file_size_bytes, width_pixels, height_pixels,
              checksum_sha256, is_default_global, is_default_channel, status, sync_status,
              sync_error, replaces_photo_id, created_at, updated_at, hidden_at, retired_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', NULL, ?, ?, ?, ?, ?)`
          )
          .run(
            row.id, row.product_id, row.variant_id, row.owner_user_id, row.channel_id, row.device_id,
            remotePath, row.file_name, row.mime_type, row.file_size_bytes, row.width_pixels, row.height_pixels,
            row.checksum_sha256, row.is_default_global, row.is_default_channel, row.status,
            row.replaces_photo_id, row.created_at, row.updated_at, row.hidden_at, row.retired_at
          );
        count += 1;
      } catch {
        // Una foto principal duplicada no debe bloquear el resto de la sincronización.
      }
    }
    return count;
  }

  mergeSnapshot(snapshot, currentDeviceId) {
    if (!snapshot?.device?.id || snapshot.device.id === currentDeviceId) return 0;
    this.ensureRemoteDevice(snapshot);
    const data = snapshot.data || {};
    this.database.exec("BEGIN IMMEDIATE");
    try {
      let count = 0;
      count += this.mergeProducts(data.products);
      count += this.mergeVariants(data.product_variants);
      count += this.mergeSuppliers(data.suppliers);
      count += this.mergeSimple("product_costs", data.product_costs, [
        "id", "product_id", "variant_id", "supplier_id", "amount", "currency", "notes",
        "created_by_user_id", "device_id", "created_at", "sync_status", "synchronized_at"
      ]);
      count += this.mergeSimple("product_prices", data.product_prices, [
        "id", "product_id", "variant_id", "channel_id", "amount", "currency", "notes",
        "created_by_user_id", "device_id", "created_at", "sync_status", "synchronized_at"
      ]);
      count += this.mergePhotos(data.product_photos);
      count += this.mergeSimple("product_links", data.product_links, [
        "id", "source_product_id", "target_product_id", "link_type", "status", "reason",
        "created_by_user_id", "created_device_id", "created_at",
        "revoked_by_user_id", "revoked_device_id", "revoked_at"
      ]);
      this.database.exec("COMMIT");
      return count;
    } catch (error) {
      try { this.database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }

  async syncNow(profile, appVersion) {
    if (this.running) return { ok: false, code: "SYNC_ALREADY_RUNNING", status: this.getStatus() };
    if (!this.isConfigured()) {
      throw syncError("FIREBASE_NOT_CONFIGURED", "Firebase no está configurado.");
    }
    if (!profile?.deviceId) {
      throw syncError("PROFILE_REQUIRED", "Este equipo todavía no tiene un perfil configurado.");
    }

    this.running = true;
    const startedAt = nowIso();
    this.setState({ status: "running", lastRunAt: startedAt, lastError: null });

    try {
      const pushed = await this.pushSnapshot(profile, appVersion);
      const uploadedPhotos = await this.uploadPhotos();
      const snapshots = await this.fetchSnapshots();
      for (const item of snapshots) {
        if (item.payload?.device?.id && item.payload.device.id !== profile.deviceId) {
          this.ensureRemoteDevice(item.payload);
        }
      }
      let pulledRecords = 0;
      for (const item of snapshots) {
        pulledRecords += this.mergeSnapshot(item.payload, profile.deviceId);
      }
      const photoDocuments = await this.fetchPhotoDocuments();
      pulledRecords += this.restoreRemotePhotos(photoDocuments, profile.deviceId);
      const completedAt = nowIso();
      const status = this.setState({
        status: "ready",
        lastRunAt: startedAt,
        lastSuccessAt: completedAt,
        lastError: null,
        remoteDocuments: snapshots.length,
        pushedRecords: pushed.pushedRecords + uploadedPhotos,
        pulledRecords
      });
      return { ok: true, status };
    } catch (error) {
      const status = this.setState({
        status: "error",
        lastRunAt: startedAt,
        lastError: error.message || "La sincronización no pudo completarse."
      });
      throw syncError(error.code || "SYNC_FAILED", error.message || "La sincronización no pudo completarse.", error);
    } finally {
      this.running = false;
    }
  }
}

module.exports = {
  DEFAULT_CONFIG,
  FirebaseSyncService,
  MAX_FIRESTORE_PHOTO_BYTES
};
