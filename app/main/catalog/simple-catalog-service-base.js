/* =========================================================
Nombre completo: simple-catalog-service.js
Ruta o ubicación: /app/main/catalog/simple-catalog-service.js
Función o funciones:
- Dar a Edgar y Gloria una tabla simple de productos, códigos, costos y precios.
- Buscar por nombre, código, presentación o proveedor.
- Crear y editar productos sin mostrar campos técnicos.
- Conservar el historial al cambiar costo o precio.
========================================================= */

"use strict";

const crypto = require("node:crypto");
const { normalizeName, requireContext } = require("./catalog-service");
const { runAtomic } = require("./product-entry-service");

function simpleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function cleanText(value, max = 300) {
  if (value === null || typeof value === "undefined") return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

function positiveMoney(value, label, { optional = true } = {}) {
  if (value === null || typeof value === "undefined" || value === "") {
    if (optional) return null;
    throw simpleError("SIMPLE_AMOUNT_REQUIRED", `${label} es obligatorio.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw simpleError("SIMPLE_AMOUNT_INVALID", `${label} debe ser mayor que cero.`);
  }
  return Math.round(number * 100) / 100;
}

function normalizeSearch(value) {
  const text = cleanText(value, 180);
  return text ? normalizeName(text) : null;
}

function presentationLabel(row) {
  if (!row) return null;
  const bits = [];
  if (row.quantity_value !== null && typeof row.quantity_value !== "undefined") bits.push(String(row.quantity_value));
  if (row.unit_name) bits.push(row.unit_name);
  if (row.presentation) bits.push(row.presentation);
  return bits.length ? bits.join(" ") : null;
}

class SimpleCatalogService {
  constructor(databaseService, catalogService, commerceService) {
    this.databaseService = databaseService;
    this.catalogService = catalogService;
    this.commerceService = commerceService;
  }

  get database() {
    this.databaseService.assertReady();
    return this.databaseService.database;
  }

  ensureContext(rawContext) {
    const context = requireContext(rawContext);
    const user = this.database.prepare("SELECT id FROM users WHERE id = ? AND is_active = 1").get(context.userId);
    const device = this.database.prepare("SELECT id FROM devices WHERE id = ?").get(context.deviceId);
    const channel = this.database.prepare("SELECT id FROM channels WHERE id = ? AND is_active = 1").get(context.channelId);
    if (!user || !device || !channel) {
      throw simpleError("SIMPLE_CONTEXT_INVALID", "No se pudo identificar correctamente el usuario, equipo o local.");
    }
    return context;
  }

  mapRow(row) {
    return {
      rowId: `${row.product_id}:${row.variant_id || "product"}`,
      productId: row.product_id,
      variantId: row.variant_id || null,
      name: row.canonical_name,
      category: row.category || null,
      code: row.internal_code || null,
      presentation: presentationLabel(row),
      presentationRaw: row.presentation || null,
      unitName: row.unit_name || null,
      quantityValue: row.quantity_value === null || typeof row.quantity_value === "undefined" ? null : Number(row.quantity_value),
      cost: row.current_cost === null || typeof row.current_cost === "undefined" ? null : Number(row.current_cost),
      price: row.current_price === null || typeof row.current_price === "undefined" ? null : Number(row.current_price),
      supplierId: row.supplier_id || null,
      supplierName: row.supplier_name || null,
      updatedAt: row.updated_at || null,
      variantCount: Number(row.variant_count || 0)
    };
  }

  listRows(options = {}, rawContext) {
    const context = this.ensureContext(rawContext);
    const search = cleanText(options.search, 180);
    const normalized = normalizeSearch(search);
    const rawLower = search ? search.toLowerCase() : null;
    const limit = Math.max(1, Math.min(250, Number(options.limit) || 100));
    const params = [context.channelId];
    let searchSql = "";

    if (normalized) {
      searchSql = `AND (
        p.normalized_name LIKE ?
        OR COALESCE(pv.normalized_name, '') LIKE ?
        OR lower(COALESCE(pv.internal_code, '')) LIKE ?
        OR lower(COALESCE(pv.presentation, '')) LIKE ?
        OR EXISTS (
          SELECT 1
          FROM product_costs pcs
          LEFT JOIN suppliers ss ON ss.id = pcs.supplier_id
          WHERE pcs.product_id = p.id
            AND (pcs.variant_id = pv.id OR pcs.variant_id IS NULL)
            AND lower(COALESCE(ss.name, '')) LIKE ?
        )
      )`;
      params.push(`%${normalized}%`, `%${normalized}%`, `%${rawLower}%`, `%${rawLower}%`, `%${rawLower}%`);
    }
    params.push(limit);

    const rows = this.database.prepare(
      `SELECT
         p.id AS product_id,
         p.canonical_name,
         p.category,
         p.updated_at,
         pv.id AS variant_id,
         pv.variant_name,
         pv.internal_code,
         pv.presentation,
         pv.unit_name,
         pv.quantity_value,
         (SELECT COUNT(*) FROM product_variants pvc WHERE pvc.product_id = p.id AND pvc.status <> 'retired') AS variant_count,
         (
           SELECT pc.amount
           FROM product_costs pc
           WHERE pc.product_id = p.id
             AND (pc.variant_id = pv.id OR pc.variant_id IS NULL)
           ORDER BY CASE WHEN pc.variant_id = pv.id THEN 0 ELSE 1 END, pc.created_at DESC
           LIMIT 1
         ) AS current_cost,
         (
           SELECT pc.supplier_id
           FROM product_costs pc
           WHERE pc.product_id = p.id
             AND (pc.variant_id = pv.id OR pc.variant_id IS NULL)
           ORDER BY CASE WHEN pc.variant_id = pv.id THEN 0 ELSE 1 END, pc.created_at DESC
           LIMIT 1
         ) AS supplier_id,
         (
           SELECT s.name
           FROM product_costs pc
           LEFT JOIN suppliers s ON s.id = pc.supplier_id
           WHERE pc.product_id = p.id
             AND (pc.variant_id = pv.id OR pc.variant_id IS NULL)
           ORDER BY CASE WHEN pc.variant_id = pv.id THEN 0 ELSE 1 END, pc.created_at DESC
           LIMIT 1
         ) AS supplier_name,
         (
           SELECT pp.pvp_with_tax
           FROM product_prices pp
           WHERE pp.product_id = p.id
             AND pp.channel_id = ?
             AND (pp.variant_id = pv.id OR pp.variant_id IS NULL)
           ORDER BY CASE WHEN pp.variant_id = pv.id THEN 0 ELSE 1 END, pp.created_at DESC
           LIMIT 1
         ) AS current_price
       FROM products p
       LEFT JOIN product_variants pv
         ON pv.product_id = p.id AND pv.status <> 'retired'
       WHERE p.status <> 'retired'
       ${searchSql}
       ORDER BY p.normalized_name, COALESCE(pv.normalized_name, '')
       LIMIT ?`
    ).all(...params);

    return rows.map((row) => this.mapRow(row));
  }

  getRow(productId, variantId, rawContext) {
    const product = this.database.prepare("SELECT canonical_name FROM products WHERE id = ?").get(productId);
    if (!product) return null;
    const rows = this.listRows({ search: product.canonical_name, limit: 250 }, rawContext);
    return rows.find((row) => row.productId === productId && (row.variantId || null) === (variantId || null)) || null;
  }

  findSupplierByName(name) {
    const normalized = normalizeSearch(name);
    if (!normalized) return null;
    return this.database.prepare("SELECT id, name FROM suppliers WHERE normalized_name = ? AND status = 'active'").get(normalized) || null;
  }

  ensureSupplier(input, context) {
    const supplierId = cleanText(input?.supplierId, 80);
    const supplierName = cleanText(input?.supplierName, 180);
    if (supplierId) {
      const supplier = this.database.prepare("SELECT id, name FROM suppliers WHERE id = ? AND status = 'active'").get(supplierId);
      if (!supplier) throw simpleError("SIMPLE_SUPPLIER_NOT_FOUND", "No se encontró el proveedor seleccionado.");
      if (!supplierName || normalizeSearch(supplierName) === normalizeSearch(supplier.name)) return supplier;
    }
    if (!supplierName) return null;
    const existing = this.findSupplierByName(supplierName);
    if (existing) return existing;
    return this.commerceService.saveSupplier({ name: supplierName }, context);
  }

  buildVariantInput(input) {
    const code = cleanText(input?.code, 80);
    const presentation = cleanText(input?.presentation, 160);
    const unitName = cleanText(input?.unitName, 80);
    const quantityValue = input?.quantityValue === null || typeof input?.quantityValue === "undefined" || input?.quantityValue === ""
      ? null
      : Number(input.quantityValue);

    if (!code && !presentation && !unitName && !quantityValue) return null;
    return {
      variantName: cleanText(input?.variantName, 180) || presentation || code || "Presentación general",
      internalCode: code,
      presentation,
      unitName,
      quantityValue: Number.isFinite(quantityValue) && quantityValue > 0 ? quantityValue : null
    };
  }

  createRow(input, rawContext) {
    const context = this.ensureContext(rawContext);
    const name = cleanText(input?.name, 180);
    if (!name) throw simpleError("SIMPLE_NAME_REQUIRED", "Escribe el nombre del producto.");
    const cost = positiveMoney(input?.cost, "El costo");
    const price = positiveMoney(input?.price, "El precio");
    const variant = this.buildVariantInput(input);

    return runAtomic(this.database, () => {
      const supplier = this.ensureSupplier(input, context);
      const created = this.catalogService.createProduct({
        canonicalName: name,
        category: cleanText(input?.category, 120),
        initialVariant: variant
      }, context);
      const productId = created.product.id;
      const variantId = created.initialVariant?.id || null;

      if (cost !== null) {
        this.commerceService.recordCost({ productId, variantId, supplierId: supplier?.id || null, amount: cost }, context);
      }
      if (price !== null) {
        this.commerceService.recordPrice({
          productId,
          variantId,
          channelId: context.channelId,
          pvpWithTax: price,
          taxRate: 15
        }, context);
      }
      this.commerceService.recordRecent(productId, "created_simple", context);
      return this.getRow(productId, variantId, context) || {
        productId,
        variantId,
        name,
        code: variant?.internalCode || null,
        presentation: variant?.presentation || null,
        cost,
        price,
        supplierId: supplier?.id || null,
        supplierName: supplier?.name || null
      };
    });
  }

  insertAudit(database, { eventType, entityType, entityId, context, details, timestamp }) {
    database.prepare(
      `INSERT INTO audit_events (
        id, event_type, entity_type, entity_id, actor_user_id, device_id,
        details_json, created_at, synchronized_at, sync_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pending')`
    ).run(
      crypto.randomUUID(), eventType, entityType, entityId,
      context.userId, context.deviceId, JSON.stringify(details || {}), timestamp
    );
  }

  insertSync(database, { table, recordId, payload, timestamp }) {
    database.prepare(
      `INSERT INTO sync_queue (
        id, source_table, record_id, operation, target, payload_json,
        priority, attempts, next_attempt_at, last_error, created_at, updated_at, completed_at
      ) VALUES (?, ?, ?, 'update', 'primary', ?, 85, 0, NULL, NULL, ?, ?, NULL)`
    ).run(crypto.randomUUID(), table, recordId, JSON.stringify(payload), timestamp, timestamp);
  }

  updateMetadata(input, context) {
    const productId = cleanText(input?.productId, 80);
    const variantId = cleanText(input?.variantId, 80);
    if (!productId) throw simpleError("SIMPLE_PRODUCT_REQUIRED", "No se identificó el producto.");
    const currentProduct = this.database.prepare("SELECT * FROM products WHERE id = ? AND status <> 'retired'").get(productId);
    if (!currentProduct) throw simpleError("SIMPLE_PRODUCT_NOT_FOUND", "No se encontró el producto.");

    const timestamp = new Date().toISOString();
    const name = cleanText(input?.name, 180) || currentProduct.canonical_name;
    const normalized = normalizeName(name);
    const duplicate = this.database.prepare(
      "SELECT id, canonical_name FROM products WHERE normalized_name = ? AND status <> 'retired' AND id <> ?"
    ).get(normalized, productId);
    if (duplicate) throw simpleError("SIMPLE_PRODUCT_DUPLICATE", `Ya existe un producto llamado ${duplicate.canonical_name}.`);

    this.database.prepare(
      `UPDATE products SET canonical_name = ?, normalized_name = ?, category = ?,
         version = version + 1, updated_by_user_id = ?, updated_device_id = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      name,
      normalized,
      cleanText(input?.category, 120),
      context.userId,
      context.deviceId,
      timestamp,
      productId
    );
    const productPayload = this.database.prepare("SELECT * FROM products WHERE id = ?").get(productId);
    this.insertAudit(this.database, {
      eventType: "product_simple_updated",
      entityType: "product",
      entityId: productId,
      context,
      details: { name, category: input?.category || null },
      timestamp
    });
    this.insertSync(this.database, { table: "products", recordId: productId, payload: productPayload, timestamp });

    const variantInput = this.buildVariantInput(input);
    if (variantId) {
      const currentVariant = this.database.prepare("SELECT * FROM product_variants WHERE id = ? AND product_id = ? AND status <> 'retired'").get(variantId, productId);
      if (!currentVariant) throw simpleError("SIMPLE_VARIANT_NOT_FOUND", "No se encontró la presentación del producto.");
      const variantName = variantInput?.variantName || currentVariant.variant_name;
      const normalizedVariant = normalizeName(variantName);
      const variantDuplicate = this.database.prepare(
        "SELECT id FROM product_variants WHERE product_id = ? AND normalized_name = ? AND status <> 'retired' AND id <> ?"
      ).get(productId, normalizedVariant, variantId);
      if (variantDuplicate) throw simpleError("SIMPLE_VARIANT_DUPLICATE", "Ya existe una presentación igual para este producto.");

      this.database.prepare(
        `UPDATE product_variants SET variant_name = ?, normalized_name = ?, internal_code = ?, presentation = ?,
           unit_name = ?, quantity_value = ?, version = version + 1,
           updated_by_user_id = ?, updated_device_id = ?, updated_at = ?
         WHERE id = ?`
      ).run(
        variantName,
        normalizedVariant,
        variantInput?.internalCode ?? currentVariant.internal_code,
        variantInput?.presentation ?? currentVariant.presentation,
        variantInput?.unitName ?? currentVariant.unit_name,
        variantInput?.quantityValue ?? currentVariant.quantity_value,
        context.userId,
        context.deviceId,
        timestamp,
        variantId
      );
      const variantPayload = this.database.prepare("SELECT * FROM product_variants WHERE id = ?").get(variantId);
      this.insertAudit(this.database, {
        eventType: "variant_simple_updated",
        entityType: "variant",
        entityId: variantId,
        context,
        details: { productId, code: variantPayload.internal_code, presentation: variantPayload.presentation },
        timestamp
      });
      this.insertSync(this.database, { table: "product_variants", recordId: variantId, payload: variantPayload, timestamp });
      return variantId;
    }

    if (variantInput) {
      return this.catalogService.addVariant(productId, variantInput, context).id;
    }
    return null;
  }

  updateRow(input, rawContext) {
    const context = this.ensureContext(rawContext);
    const productId = cleanText(input?.productId, 80);
    const requestedVariantId = cleanText(input?.variantId, 80);
    const current = this.getRow(productId, requestedVariantId, context);
    if (!current) throw simpleError("SIMPLE_ROW_NOT_FOUND", "No se encontró el producto que deseas modificar.");
    const cost = positiveMoney(input?.cost, "El costo");
    const price = positiveMoney(input?.price, "El precio");

    return runAtomic(this.database, () => {
      const variantId = this.updateMetadata(input, context) || requestedVariantId || null;
      const supplier = this.ensureSupplier(input, context);
      const supplierChanged = (supplier?.id || null) !== (current.supplierId || null);
      const costChanged = cost !== null && cost !== current.cost;
      const priceChanged = price !== null && price !== current.price;

      if (costChanged || supplierChanged) {
        const amount = cost ?? current.cost;
        if (amount !== null) {
          this.commerceService.recordCost({
            productId,
            variantId,
            supplierId: supplier?.id || null,
            amount
          }, context);
        }
      }
      if (priceChanged) {
        this.commerceService.recordPrice({
          productId,
          variantId,
          channelId: context.channelId,
          pvpWithTax: price,
          taxRate: 15
        }, context);
      }
      this.commerceService.recordRecent(productId, "updated_simple", context);
      return this.getRow(productId, variantId, context);
    });
  }

  changePrice(input, rawContext) {
    const context = this.ensureContext(rawContext);
    const productId = cleanText(input?.productId, 80);
    const variantId = cleanText(input?.variantId, 80);
    const amount = positiveMoney(input?.price, "El precio", { optional: false });
    if (!this.getRow(productId, variantId, context)) {
      throw simpleError("SIMPLE_ROW_NOT_FOUND", "No se encontró el producto seleccionado.");
    }
    const price = this.commerceService.recordPrice({
      productId,
      variantId,
      channelId: context.channelId,
      pvpWithTax: amount,
      taxRate: 15
    }, context);
    this.commerceService.recordRecent(productId, "price_updated_simple", context);
    return { price, row: this.getRow(productId, variantId, context) };
  }
}

module.exports = {
  SimpleCatalogService,
  cleanText,
  normalizeSearch,
  positiveMoney
};