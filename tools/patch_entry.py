from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def write(path, text):
    p = ROOT / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding="utf-8")

def replace_once(path, old, new, label):
    text = read(path)
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"No se encontró {label} en {path}")
    write(path, text.replace(old, new, 1))

write("app/main/catalog/product-entry-service.js", '''/* =========================================================\nNombre completo: product-entry-service.js\nRuta o ubicación: /app/main/catalog/product-entry-service.js\nFunción:\n- Guardar producto, variación, proveedor seleccionado, costo y PVP en una sola transacción.\n- Evitar productos incompletos cuando falla cualquier parte del registro.\n========================================================= */\n\n"use strict";\n\nconst crypto = require("node:crypto");\n\nfunction entryError(code, message) {\n  const error = new Error(message);\n  error.code = code;\n  return error;\n}\n\nfunction runAtomic(database, callback) {\n  if (database.inTransaction) {\n    const savepoint = `entry_${crypto.randomUUID().replace(/-/g, "")}`;\n    database.exec(`SAVEPOINT ${savepoint}`);\n    try {\n      const result = callback();\n      database.exec(`RELEASE SAVEPOINT ${savepoint}`);\n      return result;\n    } catch (error) {\n      try {\n        database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);\n        database.exec(`RELEASE SAVEPOINT ${savepoint}`);\n      } catch {}\n      throw error;\n    }\n  }\n\n  database.exec("BEGIN IMMEDIATE");\n  try {\n    const result = callback();\n    database.exec("COMMIT");\n    return result;\n  } catch (error) {\n    try { database.exec("ROLLBACK"); } catch {}\n    throw error;\n  }\n}\n\nclass ProductEntryService {\n  constructor(databaseService, catalogService, commerceService) {\n    this.databaseService = databaseService;\n    this.catalogService = catalogService;\n    this.commerceService = commerceService;\n  }\n\n  create(input, context) {\n    this.databaseService.assertReady();\n    const supplierId = String(input?.cost?.supplierId || "").trim();\n    if (!supplierId) throw entryError("SUPPLIER_REQUIRED", "Selecciona o agrega un proveedor.");\n\n    return runAtomic(this.databaseService.database, () => {\n      const created = this.catalogService.createProduct(input?.product || {}, context);\n      const productId = created.product.id;\n      const variantId = created.initialVariant?.id || null;\n      const cost = this.commerceService.recordCost({ ...(input?.cost || {}), productId, variantId }, context);\n      const price = this.commerceService.recordPrice({ ...(input?.price || {}), productId, variantId }, context);\n      return { created, cost, price };\n    });\n  }\n}\n\nmodule.exports = { ProductEntryService, runAtomic };\n''')

replace_once("app/main/main.js",
    'const { CommerceService } = require("./catalog/commerce-service");\nconst { PhotoStorageService } = require("./catalog/photo-storage-service");',
    'const { CommerceService } = require("./catalog/commerce-service");\nconst { ProductEntryService } = require("./catalog/product-entry-service");\nconst { PhotoStorageService } = require("./catalog/photo-storage-service");',
    "importación ProductEntryService")
replace_once("app/main/main.js",
    'const catalog = new CatalogService(localDatabase);\nconst commerce = new CommerceService(localDatabase);',
    'const catalog = new CatalogService(localDatabase);\nconst commerce = new CommerceService(localDatabase);\nconst productEntry = new ProductEntryService(localDatabase, catalog, commerce);',
    "instancia ProductEntryService")

old_handler = '''  ipcMain.handle("catalog:create", async (_event, input) => {\n    try {\n      const profile = await requireProfile();\n      const created = catalog.createProduct(input, contextFromProfile(profile));\n      commerce.recordRecent(created.product.id, "created", contextFromProfile(profile));\n      return success({ created, detail: { ...catalog.getProduct(created.product.id), commerce: commerce.getProductCommerce(created.product.id) } });\n    } catch (error) {\n      return errorResponse(error, "CATALOG_CREATE_FAILED", "No se pudo crear el producto.");\n    }\n  });'''
new_handler = old_handler + '''\n\n  ipcMain.handle("catalog:create-complete", async (_event, input) => {\n    try {\n      const profile = await requireProfile();\n      const result = productEntry.create(input, contextFromProfile(profile));\n      const productId = result.created.product.id;\n      return success({ ...result, detail: { ...catalog.getProduct(productId), commerce: commerce.getProductCommerce(productId) } });\n    } catch (error) {\n      return errorResponse(error, "PRODUCT_ENTRY_FAILED", "No se pudo completar el registro del producto.");\n    }\n  });'''
replace_once("app/main/main.js", old_handler, new_handler, "handler alta completa")
replace_once("app/preload/preload.js",
    '  createProduct: (input) => ipcRenderer.invoke("catalog:create", input),',
    '  createProduct: (input) => ipcRenderer.invoke("catalog:create", input),\n  createCompleteProduct: (input) => ipcRenderer.invoke("catalog:create-complete", input),',
    "API alta completa")

replace_once("app/main/sync/firebase-sync-service.js",
    '''      count += this.mergeProducts(data.products);\n      count += this.mergeVariants(data.product_variants);''',
    '''      count += this.mergeProducts((data.products || []).map((row) => row?.status === "inactive" ? { ...row, status: "active" } : row));\n      count += this.mergeVariants((data.product_variants || []).map((row) => row?.status === "inactive" ? { ...row, status: "active" } : row));''',
    "normalización remota")
replace_once("app/main/sync/firebase-sync-service.js",
    '''      count += this.mergeSimple("product_prices", data.product_prices, [\n        "id", "product_id", "variant_id", "channel_id", "amount", "currency", "notes",\n        "created_by_user_id", "device_id", "created_at", "sync_status", "synchronized_at"\n      ]);''',
    '''      count += this.mergeSimple("product_prices", data.product_prices, [\n        "id", "product_id", "variant_id", "channel_id", "amount",\n        "pvp_with_tax", "price_without_tax", "tax_rate", "currency", "notes",\n        "created_by_user_id", "device_id", "created_at", "sync_status", "synchronized_at"\n      ]);''',
    "columnas de precios")

print("Alta atómica y sincronización actualizadas")
