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
const { ExcelImportService, parseWorkbook } = require("../app/main/imports/excel-import-service");

function profile(id = "jefferson", deviceId = "device-regression-jeff") {
  const map = {
    jefferson: { channelId: "tienda-virtual", channelName: "Tienda virtual", role: "administrator", displayName: "Jefferson" },
    edgar: { channelId: "local-edgar", channelName: "Local de Edgar", role: "operator", displayName: "Edgar" },
    gloria: { channelId: "local-gloria", channelName: "Local de Gloria", role: "operator", displayName: "Gloria" }
  };
  return { id, ...map[id], deviceId, configuredAt: new Date().toISOString() };
}

function context(item) {
  return { userId: item.id, channelId: item.channelId, deviceId: item.deviceId, role: item.role };
}

async function withServices(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-regression-"));
  const database = new LocalDatabaseService();
  try {
    const jeff = profile();
    database.initialize({ userDataPath: directory, appVersion: "1.1.0", profile: jeff });
    const edgar = profile("edgar", "device-regression-edgar");
    database.registerDeviceProfile(edgar, "1.1.0");
    const catalog = new CatalogService(database);
    const commerce = new CommerceService(database);
    const simple = new SimpleCatalogService(database, catalog, commerce);
    await callback({ database, catalog, commerce, simple, jeff, edgar, directory });
  } finally {
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("Edgar ve el precio base de tienda virtual hasta que tenga un precio propio", async () => {
  await withServices(({ simple, jeff, edgar }) => {
    const created = simple.createRow({
      name: "Cinta base",
      code: "BASE-001",
      presentation: "rollo",
      price: 11.5
    }, context(jeff));

    const before = simple.getRow(created.productId, created.variantId, context(edgar));
    assert.equal(before.price, 11.5);
    assert.equal(before.priceIsBaseFallback, true);

    simple.changePrice({ productId: created.productId, variantId: created.variantId, price: 12 }, context(edgar));
    const after = simple.getRow(created.productId, created.variantId, context(edgar));
    assert.equal(after.price, 12);
    assert.equal(after.priceIsBaseFallback, false);
  });
});

test("la presentación no se duplica y editarla no cambia el nombre de la variación", async () => {
  await withServices(({ simple, database, jeff }) => {
    const created = simple.createRow({
      name: "Cinta roja",
      variantName: "Rojo",
      code: "ROJO-50",
      presentation: "50 m",
      unitName: "metro",
      quantityValue: 50,
      cost: 5,
      price: 7
    }, context(jeff));

    assert.equal(created.presentation, "50 m");
    simple.updateRow({
      productId: created.productId,
      variantId: created.variantId,
      name: "Cinta roja",
      code: "ROJO-50",
      presentation: "100 m",
      category: "Cintas",
      cost: 5,
      price: 7
    }, context(jeff));

    const variant = database.database.prepare("SELECT variant_name, presentation FROM product_variants WHERE id = ?").get(created.variantId);
    assert.equal(variant.variant_name, "Rojo");
    assert.equal(variant.presentation, "100 m");
  });
});

test("la búsqueda de proveedor ignora tildes", async () => {
  await withServices(({ simple, jeff }) => {
    simple.createRow({
      name: "Encaje prueba",
      code: "ENC-001",
      presentation: "metro",
      supplierName: "José Textiles",
      cost: 2,
      price: 3
    }, context(jeff));
    const rows = simple.listRows({ search: "jose textiles" }, context(jeff));
    assert.equal(rows.length, 1);
    assert.equal(rows[0].supplierName, "José Textiles");
  });
});

test("Sin IVA se convierte a PVP con IVA del 15 por ciento", () => {
  const parsed = parseWorkbook([{
    name: "Precios",
    rows: [
      ["Producto", "Sin IVA"],
      ["Cinta ejemplo", "10,00"]
    ]
  }]);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].priceWithoutTax, 10);
  assert.equal(parsed.rows[0].price, 11.5);
  assert.equal(parsed.rows[0].priceSource, "without_tax_converted");
});

test("el Excel actualiza coincidencias exactas sin enviarlas a duplicados", async () => {
  await withServices(({ simple, database, jeff }) => {
    const created = simple.createRow({
      name: "Cinta Organza",
      code: "6618-07",
      presentation: "50 m",
      cost: 8.5,
      price: 11.5
    }, context(jeff));
    const importer = new ExcelImportService({ databaseService: database, simpleCatalogService: simple, dialog: {} });
    const result = importer.importRows({
      rows: [{
        name: "Cinta Organza",
        code: "6618-07",
        presentation: "50 m",
        cost: 9,
        price: 12,
        sourceSheet: "Ventas",
        sourceRow: 10
      }],
      ignored: []
    }, context(jeff), "actualizacion.xlsx");

    assert.equal(result.duplicates.length, 0);
    assert.equal(result.summary.updated, 1);
    assert.equal(result.summary.created, 0);
    assert.equal(simple.getRow(created.productId, created.variantId, context(jeff)).price, 12);
    assert.equal(database.database.prepare("SELECT COUNT(*) AS total FROM product_prices WHERE product_id = ?").get(created.productId).total, 2);
  });
});

test("no se permite otro Excel mientras haya duplicados pendientes", async () => {
  await withServices(({ simple, database, jeff }) => {
    simple.createRow({ name: "Cordón tricolor delgado", code: "TRI-001", price: 1 }, context(jeff));
    const importer = new ExcelImportService({ databaseService: database, simpleCatalogService: simple, dialog: {} });
    const first = importer.importRows({
      rows: [{ name: "Cordon tricolor delg", code: null, price: 1.2, sourceSheet: "Ventas", sourceRow: 2 }],
      ignored: []
    }, context(jeff), "uno.xlsx");
    assert.equal(first.duplicates.length, 1);
    assert.throws(
      () => importer.importRows({ rows: [], ignored: [] }, context(jeff), "dos.xlsx"),
      (error) => error.code === "IMPORT_DUPLICATES_PENDING"
    );
  });
});

test("la importación crea y verifica un respaldo antes de modificar datos", async () => {
  await withServices(async ({ simple, database, jeff }) => {
    let backupCalls = 0;
    const backupService = {
      async create(kind) {
        backupCalls += 1;
        assert.equal(kind, "automatic");
        return { healthy: true, fileName: "pre-import.sqlite3" };
      }
    };
    const importer = new ExcelImportService({
      databaseService: database,
      simpleCatalogService: simple,
      backupService,
      dialog: {
        async showOpenDialog() {
          return { canceled: false, filePaths: ["inventario.xlsx"] };
        }
      }
    });
    importer.readWorkbook = () => [{
      name: "Ventas",
      rows: [
        ["Producto", "Código", "P/Fin"],
        ["Producto respaldo", "RESP-001", "5"]
      ]
    }];

    const result = await importer.selectAndImport(null, context(jeff));
    assert.equal(backupCalls, 1);
    assert.equal(result.summary.backupFileName, "pre-import.sqlite3");
    assert.equal(result.summary.created, 1);
  });
});
