/* =========================================================
Nombre completo: commerce.test.js
Ruta o ubicación: /tests/commerce.test.js
Función o funciones:
- Probar proveedores, costos, precios y productos recientes.
- Confirmar que el esquema comercial se crea correctamente.
Con qué se conecta:
- app/main/database/local-database-service.js
- app/main/catalog/commerce-service.js
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const { CommerceService } = require("../app/main/catalog/commerce-service");

function profile() {
  return {
    id: "jefferson",
    displayName: "Jefferson",
    channelId: "tienda-virtual",
    channelName: "Tienda virtual",
    role: "administrator",
    deviceId: "device-commerce-001",
    configuredAt: new Date().toISOString()
  };
}

function context() {
  const current = profile();
  return {
    userId: current.id,
    channelId: current.channelId,
    deviceId: current.deviceId,
    role: current.role
  };
}

async function withDatabase(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-commerce-"));
  const database = new LocalDatabaseService();
  try {
    database.initialize({ userDataPath: directory, appVersion: "1.0.0", profile: profile() });
    await callback(database);
  } finally {
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function insertProduct(database) {
  const timestamp = new Date().toISOString();
  database.database
    .prepare(
      `INSERT INTO products (
        id, canonical_name, normalized_name, brand, category, description, notes,
        status, version, created_by_user_id, created_device_id, created_at,
        updated_by_user_id, updated_device_id, updated_at,
        retired_by_user_id, retired_device_id, retired_at, retirement_reason,
        restored_by_user_id, restored_device_id, restored_at
      ) VALUES (
        'product-commerce', 'Arroz familiar', 'arroz familiar', 'Familia', 'Alimentos', NULL, NULL,
        'active', 1, 'jefferson', 'device-commerce-001', ?,
        'jefferson', 'device-commerce-001', ?,
        NULL, NULL, NULL, NULL, NULL, NULL, NULL
      )`
    )
    .run(timestamp, timestamp);
}

test("crea las tablas comerciales en la migración 6", async () => {
  await withDatabase((database) => {
    assert.equal(database.getSummary().schemaVersion, 6);
    const tables = database.runDiagnostic().tables;
    assert.equal(tables.includes("suppliers"), true);
    assert.equal(tables.includes("product_costs"), true);
    assert.equal(tables.includes("product_prices"), true);
    assert.equal(tables.includes("recent_product_activity"), true);
    assert.equal(tables.includes("sync_state"), true);
  });
});

test("registra proveedor, costo, precio y actividad reciente", async () => {
  await withDatabase((database) => {
    insertProduct(database);
    const commerce = new CommerceService(database);
    const supplier = commerce.saveSupplier({ name: "Proveedor principal", phone: "0999999999" }, context());
    const cost = commerce.recordCost({ productId: "product-commerce", supplierId: supplier.id, amount: 1.35 }, context());
    const price = commerce.recordPrice({ productId: "product-commerce", channelId: "tienda-virtual", amount: 2.75 }, context());
    commerce.recordRecent("product-commerce", "viewed", context());

    const summary = commerce.getProductCommerce("product-commerce");
    assert.equal(cost.amount, 1.35);
    assert.equal(price.amount, 2.75);
    assert.equal(summary.latestCosts[0].supplierName, "Proveedor principal");
    assert.equal(summary.latestPrices[0].channelName, "Tienda virtual");
    assert.equal(commerce.listRecent(context())[0].canonicalName, "Arroz familiar");
  });
});
