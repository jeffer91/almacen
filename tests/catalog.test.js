/* =========================================================
Nombre completo: catalog.test.js
Ruta o ubicación: /tests/catalog.test.js
Función o funciones:
- Verificar creación de productos y variaciones.
- Comprobar fotografías independientes por canal.
- Validar retiro sin borrado físico y restauración administrativa.
- Confirmar historial, auditoría y cola de sincronización.
- Probar relaciones entre productos sustitutos o duplicados.
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const { CatalogService, normalizeName } = require("../app/main/catalog/catalog-service");

async function withTempDirectory(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-catalog-"));

  try {
    await callback(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function profile(id = "edgar") {
  const data = {
    edgar: ["Edgar", "local-edgar", "Local de Edgar", "operator"],
    gloria: ["Gloria", "local-gloria", "Local de Gloria", "operator"],
    jefferson: ["Jefferson", "tienda-virtual", "Tienda virtual", "administrator"]
  }[id];

  return {
    id,
    displayName: data[0],
    channelId: data[1],
    channelName: data[2],
    role: data[3],
    deviceId: "device-catalog-001",
    configuredAt: new Date().toISOString()
  };
}

function context(id = "edgar") {
  const current = profile(id);
  return {
    userId: current.id,
    channelId: current.channelId,
    deviceId: current.deviceId,
    role: current.role
  };
}

async function withCatalog(callback) {
  await withTempDirectory(async (directory) => {
    const database = new LocalDatabaseService();
    database.initialize({
      userDataPath: directory,
      appVersion: "0.9.0",
      profile: profile("edgar")
    });

    const catalog = new CatalogService(database);

    try {
      await callback({ database, catalog, directory });
    } finally {
      database.close();
    }
  });
}

test("normaliza nombres para búsqueda y control de duplicados", () => {
  assert.equal(normalizeName("  Café   MOLIDO  "), "cafe molido");
  assert.equal(normalizeName("Leche 1/2 Litro"), "leche 1 2 litro");
});

test("crea un producto con variación, eventos y sincronización pendiente", async () => {
  await withCatalog(({ catalog }) => {
    const created = catalog.createProduct(
      {
        canonicalName: "Café molido",
        brand: "Familia",
        category: "Bebidas",
        description: "Café para preparación doméstica.",
        initialVariant: {
          variantName: "Funda 500 g",
          presentation: "Funda",
          unitName: "gramos",
          quantityValue: 500
        }
      },
      context("edgar")
    );

    assert.equal(created.product.canonicalName, "Café molido");
    assert.equal(created.product.status, "active");
    assert.equal(created.initialVariant.variantName, "Funda 500 g");

    const summary = catalog.getSummary();
    assert.equal(summary.products.active, 1);
    assert.equal(summary.variants.active, 1);
    assert.equal(summary.pendingCatalogSync, 2);

    const detail = catalog.getProduct(created.product.id);
    assert.equal(detail.variants.length, 1);
    assert.equal(detail.events.length, 2);
    assert.equal(detail.events.some((event) => event.eventType === "product_created"), true);
    assert.equal(detail.events.some((event) => event.eventType === "variant_created"), true);
  });
});

test("impide duplicados activos pero permite un reemplazo después del retiro", async () => {
  await withCatalog(({ catalog }) => {
    const first = catalog.createProduct(
      { canonicalName: "Arroz premium" },
      context("edgar")
    ).product;

    assert.throws(
      () => catalog.createProduct({ canonicalName: "  ARROZ   PRÉMIUM " }, context("edgar")),
      (error) => error.code === "PRODUCT_DUPLICATE"
    );

    const retired = catalog.setProductStatus(
      first.id,
      "retired",
      "Producto anterior descontinuado",
      context("edgar")
    );
    assert.equal(retired.status, "retired");
    assert.equal(catalog.listProducts().length, 0);
    assert.equal(catalog.listProducts({ includeRetired: true }).length, 1);

    const replacement = catalog.createProduct(
      { canonicalName: "Arroz premium" },
      context("edgar")
    ).product;
    assert.notEqual(replacement.id, first.id);

    assert.throws(
      () => catalog.linkProducts(first.id, replacement.id, "replacement", "Nueva presentación", context("edgar")),
      (error) => error.code === "PRODUCT_LINK_REQUIRES_ADMIN"
    );

    const link = catalog.linkProducts(
      first.id,
      replacement.id,
      "replacement",
      "Nueva presentación",
      context("jefferson")
    );
    assert.equal(link.linkType, "replacement");
    assert.equal(catalog.getProduct(first.id).links.length, 1);
  });
});

test("solo Jefferson restaura productos y variaciones retiradas", async () => {
  await withCatalog(({ catalog }) => {
    const created = catalog.createProduct(
      {
        canonicalName: "Azúcar blanca",
        initialVariant: { variantName: "Paquete 1 kg" }
      },
      context("edgar")
    );

    catalog.setVariantStatus(
      created.initialVariant.id,
      "retired",
      "Presentación suspendida",
      context("edgar")
    );
    catalog.setProductStatus(
      created.product.id,
      "retired",
      "Producto retirado temporalmente",
      context("edgar")
    );

    assert.throws(
      () => catalog.setProductStatus(created.product.id, "active", null, context("edgar")),
      (error) => error.code === "PRODUCT_RESTORE_REQUIRES_ADMIN"
    );
    assert.throws(
      () => catalog.setVariantStatus(created.initialVariant.id, "active", null, context("edgar")),
      (error) => error.code === "VARIANT_RESTORE_REQUIRES_ADMIN"
    );

    const restoredProduct = catalog.setProductStatus(
      created.product.id,
      "active",
      null,
      context("jefferson")
    );
    const restoredVariant = catalog.setVariantStatus(
      created.initialVariant.id,
      "active",
      null,
      context("jefferson")
    );

    assert.equal(restoredProduct.status, "active");
    assert.equal(restoredVariant.status, "active");
    assert.ok(restoredProduct.restoredAt);
    assert.ok(restoredVariant.restoredAt);
  });
});

test("conserva fotografías por local y nunca reemplaza silenciosamente la principal", async () => {
  await withCatalog(({ catalog }) => {
    const product = catalog.createProduct(
      { canonicalName: "Galletas de avena" },
      context("edgar")
    ).product;

    const photo = catalog.addPhoto(
      product.id,
      {
        localPath: "C:\\Almacen\\Fotos\\galletas-edgar.jpg",
        fileName: "galletas-edgar.jpg",
        mimeType: "image/jpeg",
        fileSizeBytes: 240000,
        widthPixels: 1200,
        heightPixels: 900,
        checksumSha256: "a".repeat(64),
        isDefaultChannel: true
      },
      context("edgar")
    );

    assert.equal(photo.ownerUserId, "edgar");
    assert.equal(photo.channelId, "local-edgar");
    assert.equal(photo.syncStatus, "metadata_pending");

    assert.throws(
      () => catalog.addPhoto(
        product.id,
        {
          localPath: "C:\\Almacen\\Fotos\\otra.jpg",
          fileName: "otra.jpg",
          mimeType: "image/jpeg",
          isDefaultChannel: true
        },
        context("edgar")
      ),
      (error) => error.code === "PHOTO_CHANNEL_DEFAULT_EXISTS"
    );

    const gloriaPhoto = catalog.addPhoto(
      product.id,
      {
        localPath: "C:\\Almacen\\Fotos\\galletas-gloria.webp",
        fileName: "galletas-gloria.webp",
        mimeType: "image/webp",
        ownerUserId: "gloria",
        channelId: "local-gloria",
        isDefaultChannel: true
      },
      context("jefferson")
    );

    assert.equal(gloriaPhoto.ownerUserId, "gloria");
    assert.equal(catalog.getProduct(product.id).photos.length, 2);

    catalog.setPhotoStatus(photo.id, "retired", context("edgar"));
    assert.throws(
      () => catalog.setPhotoStatus(photo.id, "active", context("edgar")),
      (error) => error.code === "PHOTO_RESTORE_REQUIRES_ADMIN"
    );

    const restored = catalog.setPhotoStatus(photo.id, "active", context("jefferson"));
    assert.equal(restored.status, "active");
    assert.equal(restored.isDefaultChannel, false);
  });
});
