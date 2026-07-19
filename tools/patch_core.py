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
package_lock = read("package-lock.json")
if package_lock.count('"version": "1.0.0"') >= 2:
    write("package-lock.json", package_lock.replace('"version": "1.0.0"', '"version": "1.1.0"', 2))

migrations = read("app/main/database/migrations.js")
if "version: 6" not in migrations:
    old = """      CREATE INDEX idx_recent_product_activity_date ON recent_product_activity(device_id, last_accessed_at DESC);
    `
  })
]);"""
    new = """      CREATE INDEX idx_recent_product_activity_date ON recent_product_activity(device_id, last_accessed_at DESC);
    `
  }),
  Object.freeze({
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
  })
]);"""
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

old_tx = """  transaction(callback) {
    const database = this.database;
    database.exec("BEGIN IMMEDIATE");

    try {
      const result = callback(database);
      database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        database.exec("ROLLBACK");
      } catch {
        // La transacción podría haberse cerrado por el propio motor.
      }
      throw error;
    }
  }"""
new_tx = """  transaction(callback) {
    const database = this.database;
    if (database.inTransaction) {
      const savepoint = `catalog_${crypto.randomUUID().replace(/-/g, "")}`;
      database.exec(`SAVEPOINT ${savepoint}`);
      try {
        const result = callback(database);
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
      const result = callback(database);
      database.exec("COMMIT");
      return result;
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch {}
      throw error;
    }
  }"""
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
