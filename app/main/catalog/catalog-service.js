/* =========================================================
Nombre completo: catalog-service.js
Ruta o ubicación: /app/main/catalog/catalog-service.js
Función o funciones:
- Crear productos y variaciones sin aprobación previa.
- Registrar fotografías independientes por usuario y canal.
- Aplicar estados activo, inactivo y retirado sin borrado físico.
- Restaurar elementos retirados únicamente con rol administrativo.
- Mantener eventos, auditoría y cola de sincronización.
- Consultar productos, detalles e indicadores del catálogo.
========================================================= */

"use strict";

const crypto = require("node:crypto");

const PRODUCT_STATUSES = Object.freeze(["active", "inactive", "retired"]);
const PHOTO_STATUSES = Object.freeze(["active", "hidden", "retired"]);
const PHOTO_SYNC_STATUSES = Object.freeze([
  "local_only",
  "metadata_pending",
  "thumbnail_pending",
  "full_pending",
  "synced",
  "failed"
]);
const LINK_TYPES = Object.freeze(["replacement", "duplicate", "merged_into"]);
const IMAGE_MIME_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);

function nowIso() {
  return new Date().toISOString();
}

function catalogError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanText(value, { required = false, max = 300, label = "El texto" } = {}) {
  if (value === null || typeof value === "undefined") {
    if (required) {
      throw catalogError("CATALOG_FIELD_REQUIRED", `${label} es obligatorio.`);
    }
    return null;
  }

  const normalized = String(value).replace(/\s+/g, " ").trim();

  if (!normalized) {
    if (required) {
      throw catalogError("CATALOG_FIELD_REQUIRED", `${label} es obligatorio.`);
    }
    return null;
  }

  return normalized.slice(0, max);
}

function normalizeName(value) {
  const cleaned = cleanText(value, {
    required: true,
    max: 180,
    label: "El nombre"
  });

  return cleaned
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function positiveNumber(value, label) {
  if (value === null || typeof value === "undefined" || value === "") {
    return null;
  }

  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw catalogError("CATALOG_NUMBER_INVALID", `${label} debe ser mayor que cero.`);
  }

  return number;
}

function nonNegativeInteger(value, label) {
  if (value === null || typeof value === "undefined" || value === "") {
    return 0;
  }

  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw catalogError("CATALOG_NUMBER_INVALID", `${label} no es válido.`);
  }

  return number;
}

function requireContext(context) {
  if (!context?.userId || !context?.deviceId || !context?.channelId) {
    throw catalogError(
      "CATALOG_CONTEXT_REQUIRED",
      "No se pudo identificar al usuario, equipo o local que realiza la acción."
    );
  }

  return {
    userId: String(context.userId),
    deviceId: String(context.deviceId),
    channelId: String(context.channelId),
    role: context.role === "administrator" ? "administrator" : "operator"
  };
}

function parseJson(value, fallback = {}) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function mapProduct(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    canonicalName: row.canonical_name,
    normalizedName: row.normalized_name,
    brand: row.brand,
    category: row.category,
    description: row.description,
    notes: row.notes,
    status: row.status,
    version: Number(row.version),
    createdByUserId: row.created_by_user_id,
    createdDeviceId: row.created_device_id,
    createdAt: row.created_at,
    updatedByUserId: row.updated_by_user_id,
    updatedDeviceId: row.updated_device_id,
    updatedAt: row.updated_at,
    retiredByUserId: row.retired_by_user_id,
    retiredDeviceId: row.retired_device_id,
    retiredAt: row.retired_at,
    retirementReason: row.retirement_reason,
    restoredByUserId: row.restored_by_user_id,
    restoredDeviceId: row.restored_device_id,
    restoredAt: row.restored_at,
    variantCount: typeof row.variant_count === "undefined" ? undefined : Number(row.variant_count),
    photoCount: typeof row.photo_count === "undefined" ? undefined : Number(row.photo_count)
  };
}

function mapVariant(row) {
  return {
    id: row.id,
    productId: row.product_id,
    variantName: row.variant_name,
    normalizedName: row.normalized_name,
    presentation: row.presentation,
    unitName: row.unit_name,
    quantityValue: row.quantity_value,
    internalCode: row.internal_code,
    notes: row.notes,
    status: row.status,
    version: Number(row.version),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    retirementReason: row.retirement_reason,
    retiredAt: row.retired_at,
    restoredAt: row.restored_at
  };
}

function mapPhoto(row) {
  return {
    id: row.id,
    productId: row.product_id,
    variantId: row.variant_id,
    ownerUserId: row.owner_user_id,
    channelId: row.channel_id,
    deviceId: row.device_id,
    localPath: row.local_path,
    fileName: row.file_name,
    mimeType: row.mime_type,
    fileSizeBytes: Number(row.file_size_bytes),
    widthPixels: row.width_pixels,
    heightPixels: row.height_pixels,
    checksumSha256: row.checksum_sha256,
    isDefaultGlobal: Boolean(row.is_default_global),
    isDefaultChannel: Boolean(row.is_default_channel),
    status: row.status,
    syncStatus: row.sync_status,
    syncError: row.sync_error,
    replacesPhotoId: row.replaces_photo_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    hiddenAt: row.hidden_at,
    retiredAt: row.retired_at
  };
}

class CatalogService {
  constructor(databaseService) {
    this.databaseService = databaseService;
  }

  get database() {
    this.databaseService.assertReady();
    return this.databaseService.database;
  }

  transaction(callback) {
    const database = this.database;
    database.exec("BEGIN IMMEDIATE");

    try {
      const result = callback(database);
      database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // La transacción podría haberse cerrado por el propio motor.
      }
      throw error;
    }
  }

  ensureReferences(context) {
    const database = this.database;
    const user = database.prepare("SELECT id FROM users WHERE id = ? AND is_active = 1").get(context.userId);
    const device = database.prepare("SELECT id FROM devices WHERE id = ?").get(context.deviceId);
    const channel = database.prepare("SELECT id FROM channels WHERE id = ? AND is_active = 1").get(context.channelId);

    if (!user || !device || !channel) {
      throw catalogError(
        "CATALOG_CONTEXT_INVALID",
        "El usuario, equipo o local no está registrado correctamente."
      );
    }
  }

  productRow(productId) {
    const row = this.database.prepare("SELECT * FROM products WHERE id = ?").get(productId);
    if (!row) {
      throw catalogError("PRODUCT_NOT_FOUND", "No se encontró el producto solicitado.");
    }
    return row;
  }

  variantRow(variantId) {
    const row = this.database.prepare("SELECT * FROM product_variants WHERE id = ?").get(variantId);
    if (!row) {
      throw catalogError("VARIANT_NOT_FOUND", "No se encontró la variación solicitada.");
    }
    return row;
  }

  photoRow(photoId) {
    const row = this.database.prepare("SELECT * FROM product_photos WHERE id = ?").get(photoId);
    if (!row) {
      throw catalogError("PHOTO_NOT_FOUND", "No se encontró la fotografía solicitada.");
    }
    return row;
  }

  assertProductNameAvailable(normalizedName) {
    const duplicate = this.database
      .prepare("SELECT id, canonical_name FROM products WHERE normalized_name = ? AND status <> 'retired'")
      .get(normalizedName);

    if (duplicate) {
      throw catalogError(
        "PRODUCT_DUPLICATE",
        `Ya existe un producto activo o inactivo llamado ${duplicate.canonical_name}.`
      );
    }
  }

  assertVariantNameAvailable(productId, normalizedName) {
    const duplicate = this.database
      .prepare(
        "SELECT id, variant_name FROM product_variants WHERE product_id = ? AND normalized_name = ? AND status <> 'retired'"
      )
      .get(productId, normalizedName);

    if (duplicate) {
      throw catalogError(
        "VARIANT_DUPLICATE",
        `Este producto ya tiene una variación llamada ${duplicate.variant_name}.`
      );
    }
  }

  insertAudit(database, { eventType, entityType, entityId, context, details, timestamp }) {
    database
      .prepare(
        `INSERT INTO audit_events (
          id, event_type, entity_type, entity_id, actor_user_id, device_id,
          details_json, created_at, synchronized_at, sync_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending')`
      )
      .run(
        crypto.randomUUID(),
        eventType,
        entityType,
        entityId,
        context.userId,
        context.deviceId,
        JSON.stringify(details || {}),
        timestamp
      );
  }

  insertCatalogEvent(database, {
    entityType,
    entityId,
    productId,
    eventType,
    context,
    previous,
    current,
    reason,
    timestamp
  }) {
    database
      .prepare(
        `INSERT INTO catalog_events (
          id, entity_type, entity_id, product_id, event_type, actor_user_id,
          device_id, channel_id, previous_json, current_json, reason,
          created_at, sync_status, synchronized_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL)`
      )
      .run(
        crypto.randomUUID(),
        entityType,
        entityId,
        productId,
        eventType,
        context.userId,
        context.deviceId,
        context.channelId,
        previous ? JSON.stringify(previous) : null,
        JSON.stringify(current || {}),
        reason || null,
        timestamp
      );
  }

  insertSync(database, { table, recordId, operation, payload, priority = 90, timestamp }) {
    database
      .prepare(
        `INSERT INTO sync_queue (
          id, source_table, record_id, operation, target, payload_json,
          priority, attempts, next_attempt_at, last_error, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, 'primary', ?, ?, 0, NULL, NULL, ?, ?, NULL)`
      )
      .run(
        crypto.randomUUID(),
        table,
        recordId,
        operation,
        JSON.stringify(payload),
        priority,
        timestamp,
        timestamp
      );
  }

  insertVariant(database, productId, input, context, timestamp) {
    const variantName = cleanText(input?.variantName, {
      required: true,
      max: 180,
      label: "El nombre de la variación"
    });
    const normalizedName = normalizeName(variantName);
    this.assertVariantNameAvailable(productId, normalizedName);

    const variant = {
      id: crypto.randomUUID(),
      productId,
      variantName,
      normalizedName,
      presentation: cleanText(input?.presentation, { max: 160 }),
      unitName: cleanText(input?.unitName, { max: 80 }),
      quantityValue: positiveNumber(input?.quantityValue, "La cantidad"),
      internalCode: cleanText(input?.internalCode, { max: 80 }),
      notes: cleanText(input?.notes, { max: 800 }),
      status: "active",
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    database
      .prepare(
        `INSERT INTO product_variants (
          id, product_id, variant_name, normalized_name, presentation, unit_name,
          quantity_value, internal_code, notes, status, version,
          created_by_user_id, created_device_id, created_at,
          updated_by_user_id, updated_device_id, updated_at,
          retired_by_user_id, retired_device_id, retired_at, retirement_reason,
          restored_by_user_id, restored_device_id, restored_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`
      )
      .run(
        variant.id,
        productId,
        variant.variantName,
        variant.normalizedName,
        variant.presentation,
        variant.unitName,
        variant.quantityValue,
        variant.internalCode,
        variant.notes,
        context.userId,
        context.deviceId,
        timestamp,
        context.userId,
        context.deviceId,
        timestamp
      );

    this.insertCatalogEvent(database, {
      entityType: "variant",
      entityId: variant.id,
      productId,
      eventType: "variant_created",
      context,
      current: variant,
      timestamp
    });
    this.insertAudit(database, {
      eventType: "variant_created",
      entityType: "variant",
      entityId: variant.id,
      context,
      details: { productId, variantName },
      timestamp
    });
    this.insertSync(database, {
      table: "product_variants",
      recordId: variant.id,
      operation: "insert",
      payload: variant,
      timestamp
    });

    return variant;
  }

  createProduct(input, rawContext) {
    const context = requireContext(rawContext);
    this.ensureReferences(context);

    const canonicalName = cleanText(input?.canonicalName, {
      required: true,
      max: 180,
      label: "El nombre del producto"
    });
    const normalizedName = normalizeName(canonicalName);
    this.assertProductNameAvailable(normalizedName);

    const timestamp = nowIso();
    const product = {
      id: crypto.randomUUID(),
      canonicalName,
      normalizedName,
      brand: cleanText(input?.brand, { max: 120 }),
      category: cleanText(input?.category, { max: 120 }),
      description: cleanText(input?.description, { max: 1200 }),
      notes: cleanText(input?.notes, { max: 1200 }),
      status: "active",
      version: 1,
      createdByUserId: context.userId,
      createdDeviceId: context.deviceId,
      createdAt: timestamp,
      updatedByUserId: context.userId,
      updatedDeviceId: context.deviceId,
      updatedAt: timestamp
    };

    return this.transaction((database) => {
      database
        .prepare(
          `INSERT INTO products (
            id, canonical_name, normalized_name, brand, category, description, notes,
            status, version, created_by_user_id, created_device_id, created_at,
            updated_by_user_id, updated_device_id, updated_at,
            retired_by_user_id, retired_device_id, retired_at, retirement_reason,
            restored_by_user_id, restored_device_id, restored_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`
        )
        .run(
          product.id,
          product.canonicalName,
          product.normalizedName,
          product.brand,
          product.category,
          product.description,
          product.notes,
          context.userId,
          context.deviceId,
          timestamp,
          context.userId,
          context.deviceId,
          timestamp
        );

      this.insertCatalogEvent(database, {
        entityType: "product",
        entityId: product.id,
        productId: product.id,
        eventType: "product_created",
        context,
        current: product,
        timestamp
      });
      this.insertAudit(database, {
        eventType: "product_created",
        entityType: "product",
        entityId: product.id,
        context,
        details: { canonicalName },
        timestamp
      });
      this.insertSync(database, {
        table: "products",
        recordId: product.id,
        operation: "insert",
        payload: product,
        timestamp
      });

      const initialVariant = input?.initialVariant
        ? this.insertVariant(database, product.id, input.initialVariant, context, timestamp)
        : null;

      return { product, initialVariant };
    });
  }

  addVariant(productId, input, rawContext) {
    const context = requireContext(rawContext);
    this.ensureReferences(context);
    const product = this.productRow(productId);

    if (product.status === "retired") {
      throw catalogError(
        "PRODUCT_RETIRED",
        "No se pueden agregar variaciones a un producto retirado."
      );
    }

    return this.transaction((database) =>
      this.insertVariant(database, productId, input, context, nowIso())
    );
  }

  addPhoto(productId, input, rawContext) {
    const context = requireContext(rawContext);
    this.ensureReferences(context);
    const product = this.productRow(productId);

    if (product.status === "retired") {
      throw catalogError("PRODUCT_RETIRED", "No se pueden agregar fotografías a un producto retirado.");
    }

    const variantId = input?.variantId || null;
    if (variantId) {
      const variant = this.variantRow(variantId);
      if (variant.product_id !== productId) {
        throw catalogError("PHOTO_VARIANT_MISMATCH", "La variación no pertenece a este producto.");
      }
    }

    const mimeType = cleanText(input?.mimeType, {
      required: true,
      max: 80,
      label: "El tipo de archivo"
    });
    if (!IMAGE_MIME_TYPES.includes(mimeType)) {
      throw catalogError("PHOTO_TYPE_INVALID", "La fotografía debe ser JPG, PNG o WEBP.");
    }

    const checksum = cleanText(input?.checksumSha256, { max: 64 });
    if (checksum && !/^[a-f0-9]{64}$/i.test(checksum)) {
      throw catalogError("PHOTO_CHECKSUM_INVALID", "El checksum de la fotografía no es válido.");
    }

    const ownerUserId = context.role === "administrator" && input?.ownerUserId
      ? String(input.ownerUserId)
      : context.userId;
    const channelId = context.role === "administrator" && input?.channelId
      ? String(input.channelId)
      : context.channelId;

    const owner = this.database.prepare("SELECT id FROM users WHERE id = ? AND is_active = 1").get(ownerUserId);
    const channel = this.database.prepare("SELECT id FROM channels WHERE id = ? AND is_active = 1").get(channelId);
    if (!owner || !channel) {
      throw catalogError("PHOTO_OWNER_INVALID", "El usuario o local de la fotografía no es válido.");
    }

    const isDefaultGlobal = Boolean(input?.isDefaultGlobal);
    const isDefaultChannel = Boolean(input?.isDefaultChannel);

    if (isDefaultGlobal) {
      const existing = this.database
        .prepare("SELECT id FROM product_photos WHERE product_id = ? AND is_default_global = 1 AND status = 'active'")
        .get(productId);
      if (existing) {
        throw catalogError(
          "PHOTO_GLOBAL_DEFAULT_EXISTS",
          "Ya existe una fotografía general. Jefferson debe cambiarla explícitamente."
        );
      }
    }

    if (isDefaultChannel) {
      const existing = this.database
        .prepare(
          "SELECT id FROM product_photos WHERE product_id = ? AND channel_id = ? AND is_default_channel = 1 AND status = 'active'"
        )
        .get(productId, channelId);
      if (existing) {
        throw catalogError(
          "PHOTO_CHANNEL_DEFAULT_EXISTS",
          "Este local ya tiene una fotografía principal. Jefferson debe cambiarla explícitamente."
        );
      }
    }

    const timestamp = nowIso();
    const photo = {
      id: crypto.randomUUID(),
      productId,
      variantId,
      ownerUserId,
      channelId,
      deviceId: context.deviceId,
      localPath: cleanText(input?.localPath, {
        required: true,
        max: 1000,
        label: "La ubicación local de la fotografía"
      }),
      fileName: cleanText(input?.fileName, {
        required: true,
        max: 240,
        label: "El nombre del archivo"
      }),
      mimeType,
      fileSizeBytes: nonNegativeInteger(input?.fileSizeBytes, "El tamaño del archivo"),
      widthPixels: input?.widthPixels ? nonNegativeInteger(input.widthPixels, "El ancho") : null,
      heightPixels: input?.heightPixels ? nonNegativeInteger(input.heightPixels, "El alto") : null,
      checksumSha256: checksum ? checksum.toLowerCase() : null,
      isDefaultGlobal,
      isDefaultChannel,
      status: "active",
      syncStatus: PHOTO_SYNC_STATUSES.includes(input?.syncStatus)
        ? input.syncStatus
        : "metadata_pending",
      replacesPhotoId: input?.replacesPhotoId || null,
      createdAt: timestamp,
      updatedAt: timestamp
    };

    if (photo.replacesPhotoId) {
      const replaced = this.photoRow(photo.replacesPhotoId);
      if (replaced.product_id !== productId) {
        throw catalogError("PHOTO_REPLACEMENT_MISMATCH", "La fotografía anterior pertenece a otro producto.");
      }
    }

    return this.transaction((database) => {
      database
        .prepare(
          `INSERT INTO product_photos (
            id, product_id, variant_id, owner_user_id, channel_id, device_id,
            local_path, file_name, mime_type, file_size_bytes, width_pixels, height_pixels,
            checksum_sha256, is_default_global, is_default_channel, status, sync_status,
            sync_error, replaces_photo_id, created_at, updated_at, hidden_at, retired_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, NULL, ?, ?, ?, NULL, NULL)`
        )
        .run(
          photo.id,
          productId,
          variantId,
          ownerUserId,
          channelId,
          context.deviceId,
          photo.localPath,
          photo.fileName,
          photo.mimeType,
          photo.fileSizeBytes,
          photo.widthPixels,
          photo.heightPixels,
          photo.checksumSha256,
          photo.isDefaultGlobal ? 1 : 0,
          photo.isDefaultChannel ? 1 : 0,
          photo.syncStatus,
          photo.replacesPhotoId,
          timestamp,
          timestamp
        );

      this.insertCatalogEvent(database, {
        entityType: "photo",
        entityId: photo.id,
        productId,
        eventType: "photo_added",
        context,
        current: photo,
        timestamp
      });
      this.insertAudit(database, {
        eventType: "photo_added",
        entityType: "photo",
        entityId: photo.id,
        context,
        details: { productId, ownerUserId, channelId, fileName: photo.fileName },
        timestamp
      });
      this.insertSync(database, {
        table: "product_photos",
        recordId: photo.id,
        operation: "insert",
        payload: { ...photo, localPath: null },
        priority: 80,
        timestamp
      });

      return photo;
    });
  }

  setProductStatus(productId, status, reason, rawContext) {
    if (!PRODUCT_STATUSES.includes(status)) {
      throw catalogError("PRODUCT_STATUS_INVALID", "El estado solicitado no es válido.");
    }

    const context = requireContext(rawContext);
    this.ensureReferences(context);
    const previousRow = this.productRow(productId);

    if (previousRow.status === status) {
      return mapProduct(previousRow);
    }

    const restoring = previousRow.status === "retired" && status !== "retired";
    if (restoring && context.role !== "administrator") {
      throw catalogError(
        "PRODUCT_RESTORE_REQUIRES_ADMIN",
        "Solo Jefferson puede restaurar un producto retirado."
      );
    }

    const timestamp = nowIso();
    const retirementReason = status === "retired"
      ? cleanText(reason, { max: 600 })
      : previousRow.retirement_reason;

    return this.transaction((database) => {
      database
        .prepare(
          `UPDATE products SET
            status = ?, version = version + 1,
            updated_by_user_id = ?, updated_device_id = ?, updated_at = ?,
            retired_by_user_id = CASE WHEN ? = 'retired' THEN ? ELSE retired_by_user_id END,
            retired_device_id = CASE WHEN ? = 'retired' THEN ? ELSE retired_device_id END,
            retired_at = CASE WHEN ? = 'retired' THEN ? ELSE retired_at END,
            retirement_reason = CASE WHEN ? = 'retired' THEN ? ELSE retirement_reason END,
            restored_by_user_id = CASE WHEN ? = 1 THEN ? ELSE restored_by_user_id END,
            restored_device_id = CASE WHEN ? = 1 THEN ? ELSE restored_device_id END,
            restored_at = CASE WHEN ? = 1 THEN ? ELSE restored_at END
          WHERE id = ?`
        )
        .run(
          status,
          context.userId,
          context.deviceId,
          timestamp,
          status,
          context.userId,
          status,
          context.deviceId,
          status,
          timestamp,
          status,
          retirementReason,
          restoring ? 1 : 0,
          context.userId,
          restoring ? 1 : 0,
          context.deviceId,
          restoring ? 1 : 0,
          timestamp,
          productId
        );

      const current = mapProduct(database.prepare("SELECT * FROM products WHERE id = ?").get(productId));
      const eventType = status === "retired"
        ? "product_retired"
        : restoring
          ? "product_restored"
          : "product_status_changed";
      const operation = status === "retired" ? "archive" : restoring ? "restore" : "update";

      this.insertCatalogEvent(database, {
        entityType: "product",
        entityId: productId,
        productId,
        eventType,
        context,
        previous: mapProduct(previousRow),
        current,
        reason: retirementReason,
        timestamp
      });
      this.insertAudit(database, {
        eventType,
        entityType: "product",
        entityId: productId,
        context,
        details: { previousStatus: previousRow.status, currentStatus: status, reason: retirementReason },
        timestamp
      });
      this.insertSync(database, {
        table: "products",
        recordId: productId,
        operation,
        payload: current,
        timestamp
      });

      return current;
    });
  }

  setVariantStatus(variantId, status, reason, rawContext) {
    if (!PRODUCT_STATUSES.includes(status)) {
      throw catalogError("VARIANT_STATUS_INVALID", "El estado solicitado no es válido.");
    }

    const context = requireContext(rawContext);
    this.ensureReferences(context);
    const previousRow = this.variantRow(variantId);

    if (previousRow.status === status) {
      return mapVariant(previousRow);
    }

    const restoring = previousRow.status === "retired" && status !== "retired";
    if (restoring && context.role !== "administrator") {
      throw catalogError(
        "VARIANT_RESTORE_REQUIRES_ADMIN",
        "Solo Jefferson puede restaurar una variación retirada."
      );
    }

    const timestamp = nowIso();
    const retirementReason = status === "retired" ? cleanText(reason, { max: 600 }) : previousRow.retirement_reason;

    return this.transaction((database) => {
      database
        .prepare(
          `UPDATE product_variants SET
            status = ?, version = version + 1,
            updated_by_user_id = ?, updated_device_id = ?, updated_at = ?,
            retired_by_user_id = CASE WHEN ? = 'retired' THEN ? ELSE retired_by_user_id END,
            retired_device_id = CASE WHEN ? = 'retired' THEN ? ELSE retired_device_id END,
            retired_at = CASE WHEN ? = 'retired' THEN ? ELSE retired_at END,
            retirement_reason = CASE WHEN ? = 'retired' THEN ? ELSE retirement_reason END,
            restored_by_user_id = CASE WHEN ? = 1 THEN ? ELSE restored_by_user_id END,
            restored_device_id = CASE WHEN ? = 1 THEN ? ELSE restored_device_id END,
            restored_at = CASE WHEN ? = 1 THEN ? ELSE restored_at END
          WHERE id = ?`
        )
        .run(
          status,
          context.userId,
          context.deviceId,
          timestamp,
          status,
          context.userId,
          status,
          context.deviceId,
          status,
          timestamp,
          status,
          retirementReason,
          restoring ? 1 : 0,
          context.userId,
          restoring ? 1 : 0,
          context.deviceId,
          restoring ? 1 : 0,
          timestamp,
          variantId
        );

      const current = mapVariant(database.prepare("SELECT * FROM product_variants WHERE id = ?").get(variantId));
      const eventType = status === "retired"
        ? "variant_retired"
        : restoring
          ? "variant_restored"
          : "variant_status_changed";
      const operation = status === "retired" ? "archive" : restoring ? "restore" : "update";

      this.insertCatalogEvent(database, {
        entityType: "variant",
        entityId: variantId,
        productId: previousRow.product_id,
        eventType,
        context,
        previous: mapVariant(previousRow),
        current,
        reason: retirementReason,
        timestamp
      });
      this.insertAudit(database, {
        eventType,
        entityType: "variant",
        entityId: variantId,
        context,
        details: { productId: previousRow.product_id, previousStatus: previousRow.status, currentStatus: status },
        timestamp
      });
      this.insertSync(database, {
        table: "product_variants",
        recordId: variantId,
        operation,
        payload: current,
        timestamp
      });

      return current;
    });
  }

  setPhotoStatus(photoId, status, rawContext) {
    if (!PHOTO_STATUSES.includes(status)) {
      throw catalogError("PHOTO_STATUS_INVALID", "El estado solicitado no es válido.");
    }

    const context = requireContext(rawContext);
    this.ensureReferences(context);
    const previousRow = this.photoRow(photoId);
    const restoring = previousRow.status === "retired" && status === "active";

    if (restoring && context.role !== "administrator") {
      throw catalogError(
        "PHOTO_RESTORE_REQUIRES_ADMIN",
        "Solo Jefferson puede restaurar una fotografía retirada."
      );
    }

    const timestamp = nowIso();

    return this.transaction((database) => {
      database
        .prepare(
          `UPDATE product_photos SET
            status = ?,
            is_default_global = CASE WHEN ? = 'active' THEN is_default_global ELSE 0 END,
            is_default_channel = CASE WHEN ? = 'active' THEN is_default_channel ELSE 0 END,
            hidden_at = CASE WHEN ? = 'hidden' THEN ? ELSE hidden_at END,
            retired_at = CASE WHEN ? = 'retired' THEN ? ELSE retired_at END,
            updated_at = ?
          WHERE id = ?`
        )
        .run(status, status, status, status, timestamp, status, timestamp, timestamp, photoId);

      const current = mapPhoto(database.prepare("SELECT * FROM product_photos WHERE id = ?").get(photoId));
      const eventType = status === "retired"
        ? "photo_retired"
        : status === "hidden"
          ? "photo_hidden"
          : restoring
            ? "photo_restored"
            : "photo_activated";
      const operation = status === "retired" ? "archive" : restoring ? "restore" : "update";

      this.insertCatalogEvent(database, {
        entityType: "photo",
        entityId: photoId,
        productId: previousRow.product_id,
        eventType,
        context,
        previous: mapPhoto(previousRow),
        current,
        timestamp
      });
      this.insertAudit(database, {
        eventType,
        entityType: "photo",
        entityId: photoId,
        context,
        details: { productId: previousRow.product_id, previousStatus: previousRow.status, currentStatus: status },
        timestamp
      });
      this.insertSync(database, {
        table: "product_photos",
        recordId: photoId,
        operation,
        payload: { ...current, localPath: null },
        priority: 80,
        timestamp
      });

      return current;
    });
  }

  linkProducts(sourceProductId, targetProductId, linkType, reason, rawContext) {
    const context = requireContext(rawContext);
    this.ensureReferences(context);

    if (context.role !== "administrator") {
      throw catalogError("PRODUCT_LINK_REQUIRES_ADMIN", "Solo Jefferson puede relacionar o fusionar productos.");
    }
    if (!LINK_TYPES.includes(linkType)) {
      throw catalogError("PRODUCT_LINK_TYPE_INVALID", "El tipo de relación no es válido.");
    }
    if (sourceProductId === targetProductId) {
      throw catalogError("PRODUCT_LINK_SELF", "Un producto no puede relacionarse consigo mismo.");
    }

    this.productRow(sourceProductId);
    this.productRow(targetProductId);
    const timestamp = nowIso();
    const link = {
      id: crypto.randomUUID(),
      sourceProductId,
      targetProductId,
      linkType,
      status: "active",
      reason: cleanText(reason, { max: 600 }),
      createdByUserId: context.userId,
      createdDeviceId: context.deviceId,
      createdAt: timestamp
    };

    return this.transaction((database) => {
      database
        .prepare(
          `INSERT INTO product_links (
            id, source_product_id, target_product_id, link_type, status, reason,
            created_by_user_id, created_device_id, created_at,
            revoked_by_user_id, revoked_device_id, revoked_at
          ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, NULL, NULL)`
        )
        .run(
          link.id,
          sourceProductId,
          targetProductId,
          linkType,
          link.reason,
          context.userId,
          context.deviceId,
          timestamp
        );

      this.insertCatalogEvent(database, {
        entityType: "link",
        entityId: link.id,
        productId: sourceProductId,
        eventType: "product_link_created",
        context,
        current: link,
        reason: link.reason,
        timestamp
      });
      this.insertAudit(database, {
        eventType: "product_link_created",
        entityType: "link",
        entityId: link.id,
        context,
        details: { sourceProductId, targetProductId, linkType },
        timestamp
      });
      this.insertSync(database, {
        table: "product_links",
        recordId: link.id,
        operation: "insert",
        payload: link,
        timestamp
      });

      return link;
    });
  }

  listProducts(options = {}) {
    const includeRetired = options.includeRetired === true;
    const search = cleanText(options.search, { max: 180 });
    const normalizedSearch = search ? normalizeName(search) : null;
    const limit = Math.max(1, Math.min(200, Number(options.limit) || 50));
    const statusClause = includeRetired ? "1 = 1" : "p.status <> 'retired'";
    const searchClause = normalizedSearch
      ? `AND (
          p.normalized_name LIKE ?
          OR EXISTS (
            SELECT 1 FROM product_variants pv
            WHERE pv.product_id = p.id
              AND pv.normalized_name LIKE ?
              AND pv.status <> 'retired'
          )
        )`
      : "";
    const parameters = normalizedSearch
      ? [`%${normalizedSearch}%`, `%${normalizedSearch}%`, limit]
      : [limit];

    return this.database
      .prepare(
        `SELECT p.*,
          (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.status <> 'retired') AS variant_count,
          (SELECT COUNT(*) FROM product_photos pp WHERE pp.product_id = p.id AND pp.status = 'active') AS photo_count
         FROM products p
         WHERE ${statusClause}
         ${searchClause}
         ORDER BY p.normalized_name
         LIMIT ?`
      )
      .all(...parameters)
      .map(mapProduct);
  }

  getProduct(productId) {
    const product = mapProduct(this.productRow(productId));
    const variants = this.database
      .prepare("SELECT * FROM product_variants WHERE product_id = ? ORDER BY status, normalized_name")
      .all(productId)
      .map(mapVariant);
    const photos = this.database
      .prepare("SELECT * FROM product_photos WHERE product_id = ? ORDER BY created_at DESC")
      .all(productId)
      .map(mapPhoto);
    const links = this.database
      .prepare(
        `SELECT * FROM product_links
         WHERE source_product_id = ? OR target_product_id = ?
         ORDER BY created_at DESC`
      )
      .all(productId, productId)
      .map((row) => ({
        id: row.id,
        sourceProductId: row.source_product_id,
        targetProductId: row.target_product_id,
        linkType: row.link_type,
        status: row.status,
        reason: row.reason,
        createdAt: row.created_at,
        revokedAt: row.revoked_at
      }));
    const events = this.database
      .prepare(
        `SELECT entity_type, entity_id, event_type, actor_user_id, device_id,
                channel_id, previous_json, current_json, reason, created_at, sync_status
         FROM catalog_events
         WHERE product_id = ?
         ORDER BY created_at DESC
         LIMIT 100`
      )
      .all(productId)
      .map((row) => ({
        entityType: row.entity_type,
        entityId: row.entity_id,
        eventType: row.event_type,
        actorUserId: row.actor_user_id,
        deviceId: row.device_id,
        channelId: row.channel_id,
        previous: parseJson(row.previous_json, null),
        current: parseJson(row.current_json, {}),
        reason: row.reason,
        createdAt: row.created_at,
        syncStatus: row.sync_status
      }));

    return { product, variants, photos, links, events };
  }

  getSummary() {
    const productCounts = this.database
      .prepare("SELECT status, COUNT(*) AS total FROM products GROUP BY status")
      .all();
    const variantCounts = this.database
      .prepare("SELECT status, COUNT(*) AS total FROM product_variants GROUP BY status")
      .all();
    const photoCounts = this.database
      .prepare("SELECT status, COUNT(*) AS total FROM product_photos GROUP BY status")
      .all();
    const pendingPhotos = this.database
      .prepare("SELECT COUNT(*) AS total FROM product_photos WHERE sync_status <> 'synced'")
      .get();
    const pendingCatalogSync = this.database
      .prepare(
        `SELECT COUNT(*) AS total FROM sync_queue
         WHERE completed_at IS NULL
           AND source_table IN ('products', 'product_variants', 'product_photos', 'product_links')`
      )
      .get();

    function grouped(rows) {
      return rows.reduce((result, row) => {
        result[row.status] = Number(row.total);
        return result;
      }, {});
    }

    return {
      products: grouped(productCounts),
      variants: grouped(variantCounts),
      photos: grouped(photoCounts),
      pendingPhotos: Number(pendingPhotos.total),
      pendingCatalogSync: Number(pendingCatalogSync.total)
    };
  }
}

module.exports = {
  CatalogService,
  IMAGE_MIME_TYPES,
  LINK_TYPES,
  PHOTO_STATUSES,
  PHOTO_SYNC_STATUSES,
  PRODUCT_STATUSES,
  cleanText,
  normalizeName,
  requireContext
};
