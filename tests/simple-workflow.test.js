"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const { CatalogService } = require("../app/main/catalog/catalog-service");
const { CommerceService } = require("../app/main/catalog/commerce-service");
const { SimpleCatalogService } = require("../app/main/catalog/simple-catalog-service");
const { parseWorkbook } = require("../app/main/imports/excel-import-service");

function profile() {
  return {
    id: "jefferson",
    displayName: "Jefferson",
    channelId: "tienda-virtual",
    channelName: "Tienda virtual",
    role: "administrator",
    deviceId: "device-simple-001",
    configuredAt: new Date().toISOString()
  };
}

function context() {
  const item = profile();
  return { userId: item.id, channelId: item.channelId, deviceId: item.deviceId, role: item.role };
}

async function withDatabase(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-simple-"));
  const database = new LocalDatabaseService();
  try {
    database.initialize({ userDataPath: directory, appVersion: "1.1.0", profile: profile() });
    await callback(database);
  } finally {
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("la tabla simple busca por código y conserva historial de costos y precios", async () => {
  await withDatabase((database) => {
    const catalog = new CatalogService(database);
    const commerce = new CommerceService(database);
    const simple = new SimpleCatalogService(database, catalog, commerce);

    const created = simple.createRow({
      name: "Cinta Organza",
      code: "6618-07",
      presentation: "50 m",
      category: "Cintas",
      supplierName: "Ideal",
      cost: 8.5,
      price: 11.5
    }, context());

    assert.equal(created.name, "Cinta Organza");
    assert.equal(created.code, "6618-07");
    assert.equal(created.cost, 8.5);
    assert.equal(created.price, 11.5);

    const byCode = simple.listRows({ search: "6618-07" }, context());
    assert.equal(byCode.length, 1);
    assert.equal(byCode[0].supplierName, "Ideal");

    const updated = simple.updateRow({
      productId: created.productId,
      variantId: created.variantId,
      name: "Cinta Organza",
      code: "6618-07",
      presentation: "50 m",
      category: "Cintas",
      supplierName: "Proveedor nuevo",
      cost: 9,
      price: 12
    }, context());

    assert.equal(updated.cost, 9);
    assert.equal(updated.price, 12);
    assert.equal(updated.supplierName, "Proveedor nuevo");
    assert.equal(database.database.prepare("SELECT COUNT(*) AS total FROM product_costs").get().total, 2);
    assert.equal(database.database.prepare("SELECT COUNT(*) AS total FROM product_prices").get().total, 2);
  });
});

test("el importador entiende encabezados variables y separa código del nombre", () => {
  const parsed = parseWorkbook([{
    name: "ALMACEN",
    rows: [
      ["CINTAS"],
      ["Nombre y Referencia", "Presentación", "Costo", "P/Fin"],
      ["3204000 Cordon tricolor red.", "50 m.", "0,40", "0,65"],
      ["NUEVOS PRECIOS ENERO 2024"],
      ["6618-07 Cinta organza", "rollo", "8.50", "11.50"]
    ]
  }]);

  assert.equal(parsed.rows.length, 2);
  assert.equal(parsed.rows[0].code, "3204000");
  assert.equal(parsed.rows[0].name, "Cordon tricolor red.");
  assert.equal(parsed.rows[0].category, "CINTAS");
  assert.equal(parsed.rows[0].cost, 0.4);
  assert.equal(parsed.rows[0].price, 0.65);
  assert.equal(parsed.rows[1].code, "6618-07");
});