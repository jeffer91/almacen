/* =========================================================
Nombre completo: product-entry-service.js
Ruta o ubicación: /app/main/catalog/product-entry-service.js
Función:
- Guardar producto, variación, proveedor seleccionado, costo y PVP en una sola transacción.
- Evitar productos incompletos cuando falla cualquier parte del registro.
========================================================= */

"use strict";

const crypto = require("node:crypto");

function entryError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function runAtomic(database, callback) {
  if (database.isTransaction) {
    const savepoint = `entry_${crypto.randomUUID().replace(/-/g, "")}`;
    database.exec(`SAVEPOINT ${savepoint}`);
    try {
      const result = callback();
      database.exec(`RELEASE SAVEPOINT ${savepoint}`);
      return result;
    } catch (error) {
      try {
        database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);
        database.exec(`RELEASE SAVEPOINT ${savepoint}`);
      } catch {}
      throw error;
    }
  }

  database.exec("BEGIN IMMEDIATE");
  try {
    const result = callback();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch {}
    throw error;
  }
}

class ProductEntryService {
  constructor(databaseService, catalogService, commerceService) {
    this.databaseService = databaseService;
    this.catalogService = catalogService;
    this.commerceService = commerceService;
  }

  create(input, context) {
    this.databaseService.assertReady();
    const supplierId = String(input?.cost?.supplierId || "").trim();
    if (!supplierId) throw entryError("SUPPLIER_REQUIRED", "Selecciona o agrega un proveedor.");

    return runAtomic(this.databaseService.database, () => {
      const created = this.catalogService.createProduct(input?.product || {}, context);
      const productId = created.product.id;
      const variantId = created.initialVariant?.id || null;
      const cost = this.commerceService.recordCost({ ...(input?.cost || {}), productId, variantId }, context);
      const price = this.commerceService.recordPrice({ ...(input?.price || {}), productId, variantId }, context);
      return { created, cost, price };
    });
  }
}

module.exports = { ProductEntryService, runAtomic };
