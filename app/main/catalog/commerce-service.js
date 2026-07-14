/* =========================================================
Nombre completo: commerce-service.js
Ruta o ubicación: /app/main/catalog/commerce-service.js
Función o funciones:
- Registrar proveedores, costos y precios por canal.
- Mantener historial sin sobrescribir valores anteriores.
- Registrar productos recientes por equipo.
- Generar auditoría y cola de sincronización.
Con qué se conecta:
- app/main/database/local-database-service.js
- app/main/catalog/catalog-service.js
- app/main/main.js
========================================================= */

"use strict";

const crypto = require("node:crypto");

function nowIso() {
  return new Date().toISOString();
}

function commerceError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanText(value, { required = false, max = 600, label = "El valor" } = {}) {
  if (value === null || typeof value === "undefined") {
    if (required) throw commerceError("COMMERCE_FIELD_REQUIRED", `${label} es obligatorio.`);
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();
  if (!cleaned) {
    if (required) throw commerceError("COMMERCE_FIELD_REQUIRED", `${label} es obligatorio.`);
    return null;
  }

  return cleaned.slice(0, max);
}

function normalizeName(value) {
  return cleanText(value, { required: true, max: 180, label: "El nombre" })
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function positiveMoney(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw commerceError("COMMERCE_AMOUNT_INVALID", `${label} debe ser mayor que cero.`);
  }
  return Math.round(number * 100) / 100;
}

function requireContext(context) {
  if (!context?.userId || !context?.deviceId || !context?.channelId) {
    throw commerceError(
      "COMMERCE_CONTEXT_REQUIRED",
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

class CommerceService {
  constructor(databaseService) {
    this.databaseService = databaseService;
  }

  get database() {
    this.databaseService.assertReady();
    return this.databaseService.database;
  }

  ensureContext(context) {
    const database = this.database;
    const user = database.prepare("SELECT id FROM users WHERE id = ? AND is_active = 1").get(context.userId);
    const device = database.prepare("SELECT id FROM devices WHERE id = ?").get(context.deviceId);
    const channel = database.prepare("SELECT id FROM channels WHERE id = ? AND is_active = 1").get(context.channelId);

    if (!user || !device || !channel) {
      throw commerceError("COMMERCE_CONTEXT_INVALID", "El usuario, equipo o local no está registrado correctamente.");
    }
  }

  ensureProduct(productId, variantId = null) {
    const product = this.database.prepare("SELECT id, status FROM products WHERE id = ?").get(productId);
    if (!product) throw commerceError("PRODUCT_NOT_FOUND", "No se encontró el producto solicitado.");
    if (product.status === "retired") {
      throw commerceError("PRODUCT_RETIRED", "No se pueden registrar valores en un producto retirado.");
    }

    if (variantId) {
      const variant = this.database
        .prepare("SELECT id, product_id, status FROM product_variants WHERE id = ?")
        .get(variantId);
      if (!variant || variant.product_id !== productId) {
        throw commerceError("VARIANT_NOT_FOUND", "La variación no pertenece al producto seleccionado.");
      }
      if (variant.status === "retired") {
        throw commerceError("VARIANT_RETIRED", "No se pueden registrar valores en una variación retirada.");
      }
    }
  }

  insertAudit({ eventType, entityType, entityId, context, details, timestamp }) {
    this.database
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

  insertSync({ table, recordId, operation, payload, timestamp }) {
    this.database
      .prepare(
        `INSERT INTO sync_queue (
          id, source_table, record_id, operation, target, payload_json,
          priority, attempts, next_attempt_at, last_error, created_at, updated_at, completed_at
        ) VALUES (?, ?, ?, ?, 'primary', ?, 70, 0, NULL, NULL, ?, ?, NULL)`
      )
      .run(
        crypto.randomUUID(),
        table,
        recordId,
        operation,
        JSON.stringify(payload),
        timestamp,
        timestamp
      );
  }

  listSuppliers({ includeInactive = false, search = "", limit = 100 } = {}) {
    const normalized = search ? normalizeName(search) : null;
    const safeLimit = Math.max(1, Math.min(200, Number(limit) || 100));
    const rows = normalized
      ? this.database
          .prepare(
            `SELECT * FROM suppliers
             WHERE (? = 1 OR status = 'active')
               AND normalized_name LIKE ?
             ORDER BY normalized_name
             LIMIT ?`
          )
          .all(includeInactive ? 1 : 0, `%${normalized}%`, safeLimit)
      : this.database
          .prepare(
            `SELECT * FROM suppliers
             WHERE (? = 1 OR status = 'active')
             ORDER BY normalized_name
             LIMIT ?`
          )
          .all(includeInactive ? 1 : 0, safeLimit);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      contactName: row.contact_name,
      phone: row.phone,
      email: row.email,
      notes: row.notes,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  saveSupplier(input, rawContext) {
    const context = requireContext(rawContext);
    this.ensureContext(context);

    const name = cleanText(input?.name, { required: true, max: 180, label: "El nombre del proveedor" });
    const normalizedName = normalizeName(name);
    const timestamp = nowIso();
    const existing = this.database
      .prepare("SELECT id FROM suppliers WHERE normalized_name = ?")
      .get(normalizedName);

    if (existing) {
      this.database
        .prepare(
          `UPDATE suppliers SET
             name = ?, contact_name = ?, phone = ?, email = ?, notes = ?,
             status = 'active', updated_by_user_id = ?, updated_device_id = ?, updated_at = ?
           WHERE id = ?`
        )
        .run(
          name,
          cleanText(input?.contactName, { max: 180 }),
          cleanText(input?.phone, { max: 80 }),
          cleanText(input?.email, { max: 180 }),
          cleanText(input?.notes, { max: 1000 }),
          context.userId,
          context.deviceId,
          timestamp,
          existing.id
        );

      const supplier = this.listSuppliers({ includeInactive: true }).find((item) => item.id === existing.id);
      this.insertAudit({
        eventType: "supplier_updated",
        entityType: "supplier",
        entityId: existing.id,
        context,
        details: supplier,
        timestamp
      });
      this.insertSync({ table: "suppliers", recordId: existing.id, operation: "update", payload: supplier, timestamp });
      return supplier;
    }

    const supplier = {
      id: crypto.randomUUID(),
      name,
      normalizedName,
      contactName: cleanText(input?.contactName, { max: 180 }),
      phone: cleanText(input?.phone, { max: 80 }),
      email: cleanText(input?.email, { max: 180 }),
      notes: cleanText(input?.notes, { max: 1000 }),
      status: "active",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    this.database
      .prepare(
        `INSERT INTO suppliers (
          id, name, normalized_name, contact_name, phone, email, notes, status,
          created_by_user_id, created_device_id, created_at,
          updated_by_user_id, updated_device_id, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        supplier.id,
        supplier.name,
        supplier.normalizedName,
        supplier.contactName,
        supplier.phone,
        supplier.email,
        supplier.notes,
        context.userId,
        context.deviceId,
        timestamp,
        context.userId,
        context.deviceId,
        timestamp
      );

    this.insertAudit({
      eventType: "supplier_created",
      entityType: "supplier",
      entityId: supplier.id,
      context,
      details: supplier,
      timestamp
    });
    this.insertSync({ table: "suppliers", recordId: supplier.id, operation: "insert", payload: supplier, timestamp });
    return supplier;
  }

  recordCost(input, rawContext) {
    const context = requireContext(rawContext);
    this.ensureContext(context);
    const productId = cleanText(input?.productId, { required: true, max: 80, label: "El producto" });
    const variantId = cleanText(input?.variantId, { max: 80 });
    this.ensureProduct(productId, variantId);

    const supplierId = cleanText(input?.supplierId, { max: 80 });
    if (supplierId) {
      const supplier = this.database.prepare("SELECT id FROM suppliers WHERE id = ? AND status = 'active'").get(supplierId);
      if (!supplier) throw commerceError("SUPPLIER_NOT_FOUND", "No se encontró el proveedor seleccionado.");
    }

    const timestamp = nowIso();
    const cost = {
      id: crypto.randomUUID(),
      productId,
      variantId,
      supplierId,
      amount: positiveMoney(input?.amount, "El costo"),
      currency: "USD",
      notes: cleanText(input?.notes, { max: 1000 }),
      createdByUserId: context.userId,
      deviceId: context.deviceId,
      createdAt: timestamp
    };

    this.database
      .prepare(
        `INSERT INTO product_costs (
          id, product_id, variant_id, supplier_id, amount, currency, notes,
          created_by_user_id, device_id, created_at, sync_status, synchronized_at
        ) VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, 'pending', NULL)`
      )
      .run(
        cost.id,
        cost.productId,
        cost.variantId,
        cost.supplierId,
        cost.amount,
        cost.notes,
        context.userId,
        context.deviceId,
        timestamp
      );

    this.insertAudit({
      eventType: "product_cost_recorded",
      entityType: "product_cost",
      entityId: cost.id,
      context,
      details: cost,
      timestamp
    });
    this.insertSync({ table: "product_costs", recordId: cost.id, operation: "insert", payload: cost, timestamp });
    this.recordRecent(productId, "cost_updated", context);
    return cost;
  }

  recordPrice(input, rawContext) {
    const context = requireContext(rawContext);
    this.ensureContext(context);
    const productId = cleanText(input?.productId, { required: true, max: 80, label: "El producto" });
    const variantId = cleanText(input?.variantId, { max: 80 });
    this.ensureProduct(productId, variantId);

    const channelId = cleanText(input?.channelId, { max: 80 }) || context.channelId;
    const channel = this.database.prepare("SELECT id FROM channels WHERE id = ? AND is_active = 1").get(channelId);
    if (!channel) throw commerceError("CHANNEL_NOT_FOUND", "No se encontró el local seleccionado.");

    const timestamp = nowIso();
    const price = {
      id: crypto.randomUUID(),
      productId,
      variantId,
      channelId,
      amount: positiveMoney(input?.amount, "El precio"),
      currency: "USD",
      notes: cleanText(input?.notes, { max: 1000 }),
      createdByUserId: context.userId,
      deviceId: context.deviceId,
      createdAt: timestamp
    };

    this.database
      .prepare(
        `INSERT INTO product_prices (
          id, product_id, variant_id, channel_id, amount, currency, notes,
          created_by_user_id, device_id, created_at, sync_status, synchronized_at
        ) VALUES (?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, 'pending', NULL)`
      )
      .run(
        price.id,
        price.productId,
        price.variantId,
        price.channelId,
        price.amount,
        price.notes,
        context.userId,
        context.deviceId,
        timestamp
      );

    this.insertAudit({
      eventType: "product_price_recorded",
      entityType: "product_price",
      entityId: price.id,
      context,
      details: price,
      timestamp
    });
    this.insertSync({ table: "product_prices", recordId: price.id, operation: "insert", payload: price, timestamp });
    this.recordRecent(productId, "price_updated", context);
    return price;
  }

  getProductCommerce(productId) {
    const costs = this.database
      .prepare(
        `SELECT pc.*, s.name AS supplier_name, u.display_name AS user_name
         FROM product_costs pc
         LEFT JOIN suppliers s ON s.id = pc.supplier_id
         LEFT JOIN users u ON u.id = pc.created_by_user_id
         WHERE pc.product_id = ?
         ORDER BY pc.created_at DESC
         LIMIT 100`
      )
      .all(productId)
      .map((row) => ({
        id: row.id,
        productId: row.product_id,
        variantId: row.variant_id,
        supplierId: row.supplier_id,
        supplierName: row.supplier_name,
        amount: Number(row.amount),
        currency: row.currency,
        notes: row.notes,
        userName: row.user_name,
        createdAt: row.created_at
      }));

    const prices = this.database
      .prepare(
        `SELECT pp.*, c.name AS channel_name, u.display_name AS user_name
         FROM product_prices pp
         LEFT JOIN channels c ON c.id = pp.channel_id
         LEFT JOIN users u ON u.id = pp.created_by_user_id
         WHERE pp.product_id = ?
         ORDER BY pp.created_at DESC
         LIMIT 150`
      )
      .all(productId)
      .map((row) => ({
        id: row.id,
        productId: row.product_id,
        variantId: row.variant_id,
        channelId: row.channel_id,
        channelName: row.channel_name,
        amount: Number(row.amount),
        currency: row.currency,
        notes: row.notes,
        userName: row.user_name,
        createdAt: row.created_at
      }));

    const latestCosts = new Map();
    for (const item of costs) {
      const key = item.variantId || "product";
      if (!latestCosts.has(key)) latestCosts.set(key, item);
    }

    const latestPrices = new Map();
    for (const item of prices) {
      const key = `${item.variantId || "product"}:${item.channelId}`;
      if (!latestPrices.has(key)) latestPrices.set(key, item);
    }

    return {
      costs,
      prices,
      latestCosts: Array.from(latestCosts.values()),
      latestPrices: Array.from(latestPrices.values())
    };
  }

  recordRecent(productId, action, rawContext) {
    const context = requireContext(rawContext);
    this.ensureContext(context);
    const timestamp = nowIso();
    const normalizedAction = cleanText(action, { max: 80 }) || "viewed";

    this.database
      .prepare(
        `INSERT INTO recent_product_activity (
          device_id, user_id, product_id, last_action, access_count, last_accessed_at
        ) VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(device_id, product_id) DO UPDATE SET
          user_id = excluded.user_id,
          last_action = excluded.last_action,
          access_count = recent_product_activity.access_count + 1,
          last_accessed_at = excluded.last_accessed_at`
      )
      .run(context.deviceId, context.userId, productId, normalizedAction, timestamp);
  }

  listRecent(rawContext, limit = 20) {
    const context = requireContext(rawContext);
    this.ensureContext(context);
    const safeLimit = Math.max(1, Math.min(50, Number(limit) || 20));

    return this.database
      .prepare(
        `SELECT r.last_action, r.access_count, r.last_accessed_at,
                p.id, p.canonical_name, p.brand, p.category, p.status,
                (SELECT COUNT(*) FROM product_variants pv WHERE pv.product_id = p.id AND pv.status <> 'retired') AS variant_count
         FROM recent_product_activity r
         JOIN products p ON p.id = r.product_id
         WHERE r.device_id = ? AND p.status <> 'retired'
         ORDER BY r.last_accessed_at DESC
         LIMIT ?`
      )
      .all(context.deviceId, safeLimit)
      .map((row) => ({
        id: row.id,
        canonicalName: row.canonical_name,
        brand: row.brand,
        category: row.category,
        status: row.status,
        variantCount: Number(row.variant_count),
        lastAction: row.last_action,
        accessCount: Number(row.access_count),
        lastAccessedAt: row.last_accessed_at
      }));
  }

  getSummary() {
    const suppliers = this.database.prepare("SELECT COUNT(*) AS total FROM suppliers WHERE status = 'active'").get();
    const costs = this.database.prepare("SELECT COUNT(*) AS total FROM product_costs").get();
    const prices = this.database.prepare("SELECT COUNT(*) AS total FROM product_prices").get();
    return {
      suppliers: Number(suppliers.total),
      costs: Number(costs.total),
      prices: Number(prices.total)
    };
  }
}

module.exports = {
  CommerceService,
  cleanText,
  normalizeName,
  requireContext
};
