from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def update(path, replacements):
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    for old, new in replacements:
        if old not in text and new not in text:
            raise RuntimeError(f"No se encontró el bloque esperado en {path}: {old}")
        text = text.replace(old, new)
    file_path.write_text(text, encoding="utf-8")


update("app/main/catalog/catalog-service.js", [("database.inTransaction", "database.isTransaction")])
update("app/main/catalog/product-entry-service.js", [("database.inTransaction", "database.isTransaction")])
update("tests/backups.test.js", [("schemaVersion, 5", "schemaVersion, 6")])
update("tests/migration-repair.test.js", [
    ("aplica la migración 5", "aplica la migración 6"),
    ("schemaVersion, 5", "schemaVersion, 6")
])
update("tests/startup-profile.test.js", [("schemaVersion, 5", "schemaVersion, 6")])

print("Corrección final aplicada")
