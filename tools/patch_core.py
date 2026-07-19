from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")

def replace_once(path, old, new, label):
    text = read(path)
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f"No se encontró {label} en {path}")
    write(path, text.replace(old, new, 1))

replace_once("package.json", '"version": "1.0.0"', '"version": "1.1.0"', "versión")
replace_once("package.json", '"main": "app/main/main-entry.js"', '"main": "app/main/main.js"', "punto de entrada")
replace_once("package-lock.json", '"version": "1.0.0"', '"version": "1.1.0"', "versión raíz")
replace_once("package-lock.json", '"version": "1.0.0"', '"version": "1.1.0"', "versión paquete")

migrations = read("app/main/database/migrations.js")
if "version: 6" not in migrations:
    old = """      CREATE INDEX idx_recent_product_activity_date ON recent_product_activity(device_id, last_accessed_at DESC);\n    `\n  })\n]);"""
    new = """      CREATE INDEX idx_recent_product_activity_date ON recent_product_activity(device_id, last_accessed_at DESC);\n    `\n  }),\n  Object.freeze({\n    version: 6,\n    name: \"precios_con_iva_y_estados_simplificados\",\n    sql: `\n      UPDATE products SET status = 'active', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')\n      WHERE status = 'inactive';\n\n      UPDATE product_variants SET status = 'active', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')\n      WHERE status = 'inactive';\n\n      ALTER TABLE product_prices ADD COLUMN pvp_with_tax REAL;\n      ALTER TABLE product_prices ADD COLUMN price_without_tax REAL;\n      ALTER TABLE product_prices ADD COLUMN tax_rate REAL;\n\n      UPDATE product_prices\n      SET pvp_with_tax = amount,\n          price_without_tax = amount,\n          tax_rate = 0\n      WHERE pvp_with_tax IS NULL;\n    `\n  })\n]);"""
    if old not in migrations:
        raise RuntimeError("No se encontró el cierre de la migración 5")
    write("app/main/database/migrations.js", migrations.replace(old, new, 1))

replace_once("app/main/catalog/catalog-service.js",
             "- Aplicar estados activo, inactivo y retirado sin borrado físico.",
             "- Aplicar estados activo y retirado sin borrado físico.", "descripción estados")
replace_once("app/main/catalog/catalog-service.js",
             'const PRODUCT_STATUSES = Object.freeze(["active", "inactive", "retired"]);',
             'const PRODUCT_STATUSES = Object.freeze(["active", "retired"]);', "estados permitidos")
replace_once("app/main/catalog/catalog-service.js",
             "Ya existe un producto activo o inactivo llamado ${duplicate.canonical_name}.",
             "Ya existe un producto activo llamado ${duplicate.canonical_name}.", "mensaje duplicado")

old_tx = """  transaction(callback) {\n    const database = this.database;\n    database.exec(\"BEGIN IMMEDIATE\");\n\n    try {\n      const result = callback(database);\n      database.exec(\"COMMIT\");\n      return result;\n    } catch (error) {\n      try {\n        database.exec(\"ROLLBACK\");\n      } catch {\n        // La transacción podría haberse cerrado por el propio motor.\n      }\n      throw error;\n    }\n  }"""
new_tx = """  transaction(callback) {\n    const database = this.database;\n    if (database.inTransaction) {\n      const savepoint = `catalog_${crypto.randomUUID().replace(/-/g, \"\")}`;\n      database.exec(`SAVEPOINT ${savepoint}`);\n      try {\n        const result = callback(database);\n        database.exec(`RELEASE SAVEPOINT ${savepoint}`);\n        return result;\n      } catch (error) {\n        try {\n          database.exec(`ROLLBACK TO SAVEPOINT ${savepoint}`);\n          database.exec(`RELEASE SAVEPOINT ${savepoint}`);\n        } catch {}\n        throw error;\n      }\n    }\n    database.exec(\"BEGIN IMMEDIATE\");\n    try {\n      const result = callback(database);\n      database.exec(\"COMMIT\");\n      return result;\n    } catch (error) {\n      try { database.exec(\"ROLLBACK\"); } catch {}\n      throw error;\n    }\n  }"""
replace_once("app/main/catalog/catalog-service.js", old_tx, new_tx, "transacción")

for relative in ["app/main/main-entry.js", "app/main/enhancements/register.js"]:
    path = ROOT / relative
    if path.exists():
        path.unlink()
try:
    (ROOT / "app/main/enhancements").rmdir()
except OSError:
    pass

print("Núcleo actualizado")
