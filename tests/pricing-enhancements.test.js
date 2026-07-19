/* =========================================================
Nombre completo: pricing-enhancements.test.js
Ruta: /tests/pricing-enhancements.test.js
Función:
- Validar la migración de precios con IVA.
- Comprobar proveedor, costo, PVP y precio sin IVA.
- Confirmar que el estado inactivo ya no puede utilizarse.
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const {
  DEFAULT_TAX_RATE,
  calculatePriceWithoutTax,
  normalizeTaxRate,
  roundMoney
} = require("../app/main/enhancements/register");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const { CatalogService } = require("../app/main/catalog/catalog-service");
const { CommerceService } = require("../app/main/catalog/commerce-service");

function profile() {
  return {
    id: "jefferson",
    displayName: "Jefferson",
    channelId: "tienda-virtual",
    channelName: "Tienda virtual",
    role: "administrator",
    deviceId: "device-pricing-001",
    configuredAt: new Date().toISOString()
  };
}

function context() {
  const current = profile();
  return { userId: current.id, channelId: current.channelId, deviceId: current.deviceId, role: current.role };
}

async function withDatabase(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-pricing-"));
  const database = new LocalDatabaseService();
  try {
    database.initialize({ userDataPath: directory, appVersion: "1.0.0", profile: profile() });
    await callback(database);
  } finally {
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("calcula el precio sin IVA", () => {
  assert.equal(DEFAULT_TAX_RATE, 15);
  assert.equal(calculatePriceWithoutTax(11.5, 15), 10);
  assert.equal(calculatePriceWithoutTax(2.75, 15), 2.39);
  assert.equal(calculatePriceWithoutTax(10, 0), 10);
  assert.equal(normalizeTaxRate(""), 15);
  assert.equal(roundMoney(1.005), 1.01);
});

test("aplica la migración 6 y guarda precios completos", async () => {
  await withDatabase((database) => {
    assert.equal(database.getSummary().schemaVersion, 6);
    const columns = database.database.prepare("PRAGMA table_info(product_prices)").all().map((row) => row.name);
    assert.equal(columns.includes("pvp_with_tax"), true);
    assert.equal(columns.includes("price_without_tax"), true);
    assert.equal(columns.includes("tax_rate"), true);

    const catalog = new CatalogService(database);
    const commerce = new CommerceService(database);
    const product = catalog.createProduct({ canonicalName: "Arroz familiar" }, context()).product;
    const supplier = commerce.saveSupplier({ name: "Proveedor principal" }, context());
    commerce.recordCost({ productId: product.id, supplierId: supplier.id, amount: 1.35 }, context());
    const price = commerce.recordPrice({
      productId: product.id,
      channelId: "tienda-virtual",
      pvpWithTax: 2.75,
      taxRate: 15
    }, context());

    assert.equal(price.pvpWithTax, 2.75);
    assert.equal(price.priceWithoutTax, 2.39);
    assert.equal(price.taxRate, 15);
    const detail = commerce.getProductCommerce(product.id);
    assert.equal(detail.latestCosts[0].supplierName, "Proveedor principal");
    assert.equal(detail.latestPrices[0].pvpWithTax, 2.75);
    assert.equal(detail.latestPrices[0].priceWithoutTax, 2.39);

    assert.throws(
      () => catalog.setProductStatus(product.id, "inactive", null, context()),
      (error) => error.code === "PRODUCT_STATUS_INVALID"
    );
  });
});
