/* Correcciones del flujo sencillo. La implementación original se conserva en simple-catalog-service-base.js. */
"use strict";

const crypto = require("node:crypto");
const base = require("./simple-catalog-service-base");
const { normalizeName } = require("./catalog-service");

const { cleanText, normalizeSearch } = base;
const hasOwn = (object, key) => Object.prototype.hasOwnProperty.call(object || {}, key);
const nullable = (value) => value === null || typeof value === "undefined" ? null : value;

function sameNumber(left, right) {
  const a = left === null || typeof left === "undefined" ? null : Number(left);
  const b = right === null || typeof right === "undefined" ? null : Number(right);
  if (a === null || b === null) return a === b;
  return Number.isFinite(a) && Number.isFinite(b) && a === b;
}

class SimpleCatalogService extends base.SimpleCatalogService {
  mapRow(row) {
    const mapped = super.mapRow(row);
    return {
      ...mapped,
      variantName: row.variant_name || null,
      presentation: row.presentation || [row.quantity_value, row.unit_name].filter((value) => value !== null && typeof value !== "undefined" && value !== "").join(" ") || null,
      priceChannelId: row.current_price_channel_id || null,
      priceIsBaseFallback: Boolean(row.current_price_channel_id && row.current_price_channel_id !== row.requested_channel_id)
    };
  }

  listRows(options = {}, rawContext) {
    const context = this.ensureContext(rawContext);
    const search = cleanText(options.search, 180);
    const normalized = normalizeSearch(search);
    const rawLower = search ? search.toLowerCase() : null;
    const limit = Math.max(1, Math.min(250, Number(options.limit) || 100));
    const params = [context.channelId, context.channelId, context.channelId, context.channelId, context.channelId];
    let searchSql = "";

    if (normalized) {
      searchSql = `AND (
        p.normalized_name LIKE ?
        OR COALESCE(pv.normalized_name, '') LIKE ?
        OR lower(COALESCE(pv.internal_code, '')) LIKE ?
        OR lower(COALESCE(pv.presentation, '')) LIKE ?
        OR EXISTS (
          SELECT 1 FROM product_costs pcs
          LEFT JOIN suppliers ss ON ss.id = pcs.supplier_id
          WHERE pcs.product_id = p.id
            AND (pcs.variant_id = pv.id OR pcs.variant_id IS NULL)
            AND COALESCE(ss.normalized_name, '') LIKE ?
        )
      )`;
      params.push(`%${normalized}%`, `%${normalized}%`, `%${rawLower}%`, `%${rawLower}%`, `%${normalized}%`);
    }
    params.push(limit);

    const rows = this.database.prepare(
      `SELECT p.id AS product_id, p.canonical_name, p.category, p.updated_at,
              pv.id AS variant_id, pv.variant_name, pv.internal_code, pv.presentation,
              pv.unit_name, pv.quantity_value, ? AS requested_channel_id,
              (SELECT COUNT(*) FROM product_variants pvc WHERE pvc.product_id = p.id AND pvc.status <> 'retired') AS variant_count,
              (SELECT pc.amount FROM product_costs pc               WHERE pc.product_id = p.id AND (pc.variant_id = pv.id OR pc.variant_id IS NULL)
               ORDER BY CASE WHEN pc.variant_id IS NULL THEN 1 ELSE 0 END, pc.created_at DESC LIMIT 1) AS current_cost,
              (SELECT pc.supplier_id FROM product_costs pc
               WHERE pc.product_id = p.id AND (pc.variant_id = pv.id OR pc.variant_id IS NULL)
               ORDER BY CASE WHEN pc.variant_id IS NULL THEN 1 ELSE 0 END, pc.created_at DESC LIMIT 1) AS supplier_id,
              (SELECT su.name FROM product_costs pc LEFT JOIN suppliers su ON su.id = pc.supplier_id
               WHERE pc.product_id = p.id AND (pc.variant_id = pv.id OR pc.variant_id IS NULL)
               ORDER BY CASE WHEN pc.variant_id IS NULL THEN 1 ELSE 0 END, pc.created_at DESC LIMIT 1) AS supplier_name,
              (SELECT p.pvp_with_tax FROM product_prices p
               WHERE p.product_id = products.id AND p.channel_id IN (?, 'tienda-virtual')
                 AND (p.variant_id = product_variants.id OR p.variant_id IS NULL)
               ORDER BY CASE WHEN p.channel_id = ? THEN 0 ELSE 1 END,
                        CASE WHEN p.variant_id IS NULL THEN 1 ELSE 0 END, p.created_at DESC LIMIT 1) AS current_price,
              (SELECT p.channel_id FROM product_prices p
               WHERE p.product_id = products.id AND p.channel_id IN (?, 'tienda-virtual')
                 AND (p.variant_id = product_variants.id OR p.variant_id IS NULL)
               ORDER BY CASE WHEN p.channel_id = ? THEN 0 ELSE 1 END,
                        CASE WHEN p.variant_id IS NULL THEN 1 ELSE 0 END, p.created_at DESC LIMIT 1) AS current_price_channel_id
      FROM products products
      LEFT JOIN product_variants product_variants ON product_variants.product_id = products.id AND product_variants.status <> 'retired'
      WHERE products.status <> 'retired' ${searchSql}
      ORDER BY products.normalized_name, COALESCE(product_variants.normalized_name, '') LIMIT ?`
    ).all(...params);
    return rows.map((row) => this.mapRow(row));
  }

  ensureSupplier(input, context) {
    const supplierId = cleanText(input?.supplierId, 80);
    const supplierName = cleanText(input?.supplierName, 180);
    if (hasOwn(input, "supplierName") && !supplierName) return null;
    if (supplierId) {
      const supplier = this.database.prepare("SELECT id, name FROM suppliers WHERE id = ? AND status = 'active'").get(supplierId);
      if (!supplier) {
        const error = new Error("No se encontró el proveedor seleccionado.");
        error.code = "SIMPLE_SUPPLIER_NOT_FOUND";
        throw error;
      }
      if (!supplierName || normalizeSearch(supplierName) === normalizeSearch(supplier.name)) return supplier;
    }
    if (!supplierName) return null;
    return this.findSupplierByName(supplierName) || this.commerceService.saveSupplier({ name: supplierName }, context);
  }

  updateMetadata(input, context) {
    const productId = cleanText(input?.productId, 80);
    const variantId = cleanText(input?.variantId, 80);
    if (!productId) {
      const error = new Error("No se identificó el producto.");
      error.code = "SIMPLE_PRODUCT_REQUIRED";
      throw error;
    }
    const product = this.database.prepare("SELECT * FROM products WHERE id = ? AND status <> 'retired'").get(productId);
    if (!product) {
      const error = new Error("No se encontró el producto.");
      error.code = "SIMPLE_PRODUCT_NOT_FOUND";
      throw error;
    }

    const timestamp = new Date().toISOString();
    const name = cleanText(input?.name, 180) || product.canonical_name;
    const category = hasOwn(input, "category") ? cleanText(input?.category, 120) : product.category;
    if (name !== product.canonical_name || nullable(category) !== nullable(product.category)) {
      const normalized = normalizeName(name);
      const duplicate = this.database.prepare("SELECT id, canonical_name FROM products WHERE normalized_name = ? AND status <> 'retired' AND id <> ?").get(normalized, productId);
      if (duplicate) {
        const error = new Error(`Ya existe un producto llamado ${duplicate.canonical_name}.`);
        error.code = "SIMPLE_PRODUCT_DUPLICATE";
        throw error;
      }
      this.database.prepare(
        `UPDATE products SET canonical_name = ?, normalized_name = ?, category = ?, version = version + 1,
         updated_by_user_id = ?, updated_device_id = ?, updated_at = ? WHERE id = ?`
      ).run(name, normalized, category, context.userId, context.deviceId, timestamp, productId);
      const payload = this.database.prepare("SELECT * FROM products WHERE id = ?").get(productId);
      this.insertAudit(this.database, { eventType: "product_simple_updated", entityType: "product", entityId: productId, context, details: { name, category }, timestamp });
      this.insertSync(this.database, { table: "products", recordId: productId, payload, timestamp });
    }

    if (!variantId) {
      const variantInput = this.buildVariantInput(input);
      return variantInput ? this.catalogService.addVariant(productId, variantInput, context).id : null;
    }

    const variant = this.database.prepare("SELECT * FROM product_variants WHERE id = ? AND product_id = ? AND status <> 'retired'").get(variantId, productId);
    if (!variant) {
      const error = new Error("No se encontró la presentación del producto.");
      error.code = "SIMPLE_VARIANT_NOT_FOUND";
      throw error;
    }
    const variantName = cleanText(input?.variantName, 180) || variant.variant_name;
    const code = hasOwn(input, "code") ? cleanText(input?.code, 80) : variant.internal_code;
    const presentation = hasOwn(input, "presentation") ? cleanText(input?.presentation, 160) : variant.presentation;
    const unitName = hasOwn(input, "unitName") ? cleanText(input?.unitName, 80) : variant.unit_name;
    let quantityValue = variant.quantity_value;
    if (hasOwn(input, "quantityValue")) {
      const number = input.quantityValue === "" || input.quantityValue === null || typeof input.quantityValue === "undefined" ? null : Number(input.quantityValue);
      quantityValue = Number.isFinite(number) && number > 0 ? number : null;
    }

    const changed = variantName !== variant.variant_name || nullable(code) !== nullable(variant.internal_code) ||
      nullable(presentation) !== nullable(variant.presentation) || nullable(unitName) !== nullable(variant.unit_name) ||
      !sameNumber(quantityValue, variant.quantity_value);
    if (!changed) return variantId;

    const normalizedVariant = normalizeName(variantName);
    const duplicateVariant = this.database.prepare("SELECT id FROM product_variants WHERE product_id = ? AND normalized_name = ? AND status <> 'retired' AND id <> ?").get(productId, normalizedVariant, variantId);
    if (duplicateVariant) {
      const error = new Error("Ya existe una presentación igual para este producto.");
      error.code = "SIMPLE_VARIANT_DUPLICATE";
      throw error;
    }
    this.database.prepare(
      `UPDATE product_variants SET variant_name = ?, normalized_name = ?, internal_code = ?, presentation = ?, unit_name = ?,
       quantity_value = ?, version = version + 1, updated_by_user_id = ?, updated_device_id = ?, updated_at = ? WHERE id = ?`
    ).run(variantName, normalizedVariant, code, presentation, unitName, quantityValue, context.userId, context.deviceId, timestamp, variantId);
    const payload = this.database.prepare("SELECT * FROM product_variants WHERE id = ?").get(variantId);
    this.insertAudit(this.database, { eventType: "variant_simple_updated", entityType: "variant", entityId: variantId, context, details: { productId, code, presentation }, timestamp });
    this.insertSync(this.database, { table: "product_variants", recordId: variantId, payload, timestamp });
    return variantId;
  }
}

module.exports = { ...base, SimpleCatalogService };
