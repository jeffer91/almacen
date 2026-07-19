"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const { CatalogService } = require("../app/main/catalog/catalog-service");
const { CommerceService, DEFAULT_TAX_RATE, calculatePriceWithoutTax, normalizeTaxRate, roundMoney } = require("../app/main/catalog/commerce-service");
const { ProductEntryService } = require("../app/main/catalog/product-entry-service");

function profile() { return { id: "jefferson", displayName: "Jefferson", channelId: "tienda-virtual", channelName: "Tienda virtual", role: "administrator", deviceId: "device-pricing-001", configuredAt: new Date().toISOString() }; }
function context() { const p = profile(); return { userId: p.id, channelId: p.channelId, deviceId: p.deviceId, role: p.role }; }
async function withDatabase(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-pricing-"));
  const database = new LocalDatabaseService();
  try { database.initialize({ userDataPath: directory, appVersion: "1.1.0", profile: profile() }); await callback(database); }
  finally { database.close(); await fs.rm(directory, { recursive: true, force: true }); }
}

test("calcula el precio sin IVA", () => {
  assert.equal(DEFAULT_TAX_RATE, 15);
  assert.equal(calculatePriceWithoutTax(11.5, 15), 10);
  assert.equal(calculatePriceWithoutTax(2.75, 15), 2.39);
  assert.equal(calculatePriceWithoutTax(10, 0), 10);
  assert.equal(normalizeTaxRate(""), 15);
  assert.equal(roundMoney(1.005), 1.01);
});

test("aplica migración 6 y elimina Inactivo", async () => {
  await withDatabase((database) => {
    assert.equal(database.getSummary().schemaVersion, 6);
    const columns = database.database.prepare("PRAGMA table_info(product_prices)").all().map((row) => row.name);
    assert.equal(columns.includes("pvp_with_tax"), true);
    assert.equal(columns.includes("price_without_tax"), true);
    assert.equal(columns.includes("tax_rate"), true);
    const catalog = new CatalogService(database);
    const product = catalog.createProduct({ canonicalName: "Arroz familiar" }, context()).product;
    assert.throws(() => catalog.setProductStatus(product.id, "inactive", null, context()), (error) => error.code === "PRODUCT_STATUS_INVALID");
  });
});

test("revierte todo el alta si falla costo o precio", async () => {
  await withDatabase((database) => {
    const catalog = new CatalogService(database);
    const commerce = new CommerceService(database);
    const entry = new ProductEntryService(database, catalog, commerce);
    assert.throws(() => entry.create({ product: { canonicalName: "Producto incompleto" }, cost: { supplierId: "no-existe", amount: 1.25 }, price: { pvpWithTax: 2.5, taxRate: 15 } }, context()), (error) => error.code === "SUPPLIER_NOT_FOUND");
    assert.equal(database.database.prepare("SELECT COUNT(*) AS total FROM products").get().total, 0);
    assert.equal(database.database.prepare("SELECT COUNT(*) AS total FROM product_costs").get().total, 0);
    assert.equal(database.database.prepare("SELECT COUNT(*) AS total FROM product_prices").get().total, 0);
    const supplier = commerce.saveSupplier({ name: "Proveedor principal" }, context());
    const result = entry.create({ product: { canonicalName: "Producto completo", initialVariant: { variantName: "Unidad" } }, cost: { supplierId: supplier.id, amount: 1.35 }, price: { channelId: "tienda-virtual", pvpWithTax: 2.75, taxRate: 15 } }, context());
    assert.equal(result.cost.amount, 1.35);
    assert.equal(result.price.pvpWithTax, 2.75);
    assert.equal(result.price.priceWithoutTax, 2.39);
    assert.equal(database.database.prepare("SELECT COUNT(*) AS total FROM products").get().total, 1);
  });
});
