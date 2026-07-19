/* =========================================================
Nombre completo: register.js
Ruta o ubicación: /app/main/enhancements/register.js
Función:
- Incorporar la migración de precios con IVA sin alterar migraciones aplicadas.
- Eliminar el uso funcional del estado inactivo.
- Calcular y conservar PVP con IVA, precio sin IVA y porcentaje aplicado.
- Extender la sincronización y cargar las mejoras visuales del catálogo.
========================================================= */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DEFAULT_TAX_RATE = 15;
const MONEY_FACTOR = 100;
const PATCH_MARK = Symbol.for("almacen.pricingEnhancementsInstalled");

function roundMoney(value) {
  return Math.round((Number(value) + Number.EPSILON) * MONEY_FACTOR) / MONEY_FACTOR;
}

function positiveMoney(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    const error = new Error(`${label} debe ser mayor que cero.`);
    error.code = "COMMERCE_AMOUNT_INVALID";
    throw error;
  }
  return roundMoney(number);
}

function normalizeTaxRate(value) {
  const number = value === null || typeof value === "undefined" || value === ""
    ? DEFAULT_TAX_RATE
    : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 100) {
    const error = new Error("El porcentaje de IVA debe estar entre 0 y 100.");
    error.code = "TAX_RATE_INVALID";
    throw error;
  }
  return Math.round(number * 100) / 100;
}

function calculatePriceWithoutTax(pvpWithTax, taxRate) {
  const gross = positiveMoney(pvpWithTax, "El PVP con IVA");
  const rate = normalizeTaxRate(taxRate);
  return roundMoney(gross / (1 + rate / 100));
}

function installMigration() {
  const migrationsModule = require("../database/migrations");
  if (migrationsModule.MIGRATIONS.some((migration) => migration.version === 6)) return;

  const migration = Object.freeze({
    version: 6,
    name: "precios_con_iva_y_estados_simplificados",
    sql: `
      UPDATE products SET status = 'active', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE status = 'inactive';

      UPDATE product_variants SET status = 'active', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE status = 'inactive';

      ALTER TABLE product_prices ADD COLUMN pvp_with_tax REAL;
      ALTER TABLE product_prices ADD COLUMN price_without_tax REAL;
      ALTER TABLE product_prices ADD COLUMN tax_rate REAL;

      UPDATE product_prices
      SET pvp_with_tax = amount,
          price_without_tax = amount,
          tax_rate = 0
      WHERE pvp_with_tax IS NULL;
    `
  });

  migrationsModule.MIGRATIONS = Object.freeze([...migrationsModule.MIGRATIONS, migration]);
}

function installCatalogStatusRules() {
  const { CatalogService } = require("../catalog/catalog-service");
  if (CatalogService.prototype[PATCH_MARK]) return;

  const originalProductStatus = CatalogService.prototype.setProductStatus;
  const originalVariantStatus = CatalogService.prototype.setVariantStatus;

  CatalogService.prototype.setProductStatus = function setProductStatus(productId, status, reason, context) {
    if (status === "inactive") {
      const error = new Error("El estado Inactivo fue eliminado. Usa Activo o Retirado.");
      error.code = "PRODUCT_STATUS_INVALID";
      throw error;
    }
    return originalProductStatus.call(this, productId, status, reason, context);
  };

  CatalogService.prototype.setVariantStatus = function setVariantStatus(variantId, status, reason, context) {
    if (status === "inactive") {
      const error = new Error("El estado Inactivo fue eliminado. Usa Activo o Retirado.");
      error.code = "VARIANT_STATUS_INVALID";
      throw error;
    }
    return originalVariantStatus.call(this, variantId, status, reason, context);
  };

  Object.defineProperty(CatalogService.prototype, PATCH_MARK, { value: true });
}

function installCommercePricing() {
  const commerceModule = require("../catalog/commerce-service");
  const { CommerceService, cleanText, requireContext } = commerceModule;
  if (CommerceService.prototype[PATCH_MARK]) return;

  const originalGetProductCommerce = CommerceService.prototype.getProductCommerce;

  CommerceService.prototype.recordPrice = function recordPrice(input, rawContext) {
    const context = requireContext(rawContext);
    this.ensureContext(context);
    const productId = cleanText(input?.productId, { required: true, max: 80, label: "El producto" });
    const variantId = cleanText(input?.variantId, { max: 80 });
    this.ensureProduct(productId, variantId);

    const channelId = cleanText(input?.channelId, { max: 80 }) || context.channelId;
    const channel = this.database.prepare("SELECT id FROM channels WHERE id = ? AND is_active = 1").get(channelId);
    if (!channel) {
      const error = new Error("No se encontró el local seleccionado.");
      error.code = "CHANNEL_NOT_FOUND";
      throw error;
    }

    const pvpWithTax = positiveMoney(input?.pvpWithTax ?? input?.amount, "El PVP con IVA");
    const taxRate = normalizeTaxRate(input?.taxRate);
    const priceWithoutTax = calculatePriceWithoutTax(pvpWithTax, taxRate);
    const timestamp = new Date().toISOString();
    const price = {
      id: crypto.randomUUID(),
      productId,
      variantId,
      channelId,
      amount: pvpWithTax,
      pvpWithTax,
      priceWithoutTax,
      taxRate,
      currency: "USD",
      notes: cleanText(input?.notes, { max: 1000 }),
      createdByUserId: context.userId,
      deviceId: context.deviceId,
      createdAt: timestamp
    };

    this.database
      .prepare(
        `INSERT INTO product_prices (
          id, product_id, variant_id, channel_id, amount, pvp_with_tax,
          price_without_tax, tax_rate, currency, notes, created_by_user_id,
          device_id, created_at, sync_status, synchronized_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, 'pending', NULL)`
      )
      .run(
        price.id,
        price.productId,
        price.variantId,
        price.channelId,
        price.amount,
        price.pvpWithTax,
        price.priceWithoutTax,
        price.taxRate,
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
  };

  CommerceService.prototype.getProductCommerce = function getProductCommerce(productId) {
    const result = originalGetProductCommerce.call(this, productId);
    const rows = this.database
      .prepare(
        `SELECT id, amount, pvp_with_tax, price_without_tax, tax_rate
         FROM product_prices WHERE product_id = ?`
      )
      .all(productId);
    const byId = new Map(rows.map((row) => [row.id, row]));

    const enrich = (item) => {
      const row = byId.get(item.id) || {};
      item.pvpWithTax = Number(row.pvp_with_tax ?? row.amount ?? item.amount);
      item.priceWithoutTax = Number(row.price_without_tax ?? row.amount ?? item.amount);
      item.taxRate = Number(row.tax_rate ?? 0);
      item.amount = item.pvpWithTax;
      return item;
    };

    result.prices = (result.prices || []).map(enrich);
    result.latestPrices = (result.latestPrices || []).map(enrich);
    return result;
  };

  Object.defineProperty(CommerceService.prototype, PATCH_MARK, { value: true });
}

function installSyncPricing() {
  const { FirebaseSyncService } = require("../sync/firebase-sync-service");
  if (FirebaseSyncService.prototype[PATCH_MARK]) return;
  const originalMergeSimple = FirebaseSyncService.prototype.mergeSimple;

  FirebaseSyncService.prototype.mergeSimple = function mergeSimple(table, rows, columns) {
    if (table === "product_prices") {
      columns = [...columns];
      for (const column of ["pvp_with_tax", "price_without_tax", "tax_rate"]) {
        if (!columns.includes(column)) columns.push(column);
      }
    }
    return originalMergeSimple.call(this, table, rows, columns);
  };

  Object.defineProperty(FirebaseSyncService.prototype, PATCH_MARK, { value: true });
}

function installRendererEnhancements() {
  let electron;
  try {
    electron = require("electron");
  } catch {
    return;
  }
  const BrowserWindow = electron?.BrowserWindow;
  if (!BrowserWindow?.prototype || BrowserWindow.prototype[PATCH_MARK]) return;

  const originalLoadFile = BrowserWindow.prototype.loadFile;
  const scriptPath = path.join(__dirname, "../../renderer/catalog-enhancements.js");
  const cssPath = path.join(__dirname, "../../renderer/styles/catalog-enhancements.css");

  BrowserWindow.prototype.loadFile = function loadFile(...args) {
    const result = originalLoadFile.apply(this, args);
    const webContents = this.webContents;
    webContents.once("did-finish-load", async () => {
      try {
        if (fs.existsSync(cssPath)) await webContents.insertCSS(fs.readFileSync(cssPath, "utf8"));
        if (fs.existsSync(scriptPath)) await webContents.executeJavaScript(fs.readFileSync(scriptPath, "utf8"));
      } catch (error) {
        console.error("No se pudieron cargar las mejoras comerciales:", error);
      }
    });
    return result;
  };

  Object.defineProperty(BrowserWindow.prototype, PATCH_MARK, { value: true });
}

installMigration();
installCatalogStatusRules();
installCommercePricing();
installSyncPricing();
installRendererEnhancements();

module.exports = {
  DEFAULT_TAX_RATE,
  calculatePriceWithoutTax,
  normalizeTaxRate,
  roundMoney
};
