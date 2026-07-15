from pathlib import Path

root = Path(__file__).resolve().parents[1]
index_path = root / "app/renderer/index.html"
text = index_path.read_text(encoding="utf-8")

css_line = '  <link rel="stylesheet" href="./styles/admin-navigation.css">\n'
if css_line not in text:
    anchor = '  <link rel="stylesheet" href="./styles/admin.css">\n'
    if anchor not in text:
        raise SystemExit("No se encontró el enlace de admin.css.")
    text = text.replace(anchor, anchor + css_line, 1)

script_line = '  <script src="./admin-navigation.js"></script>\n'
if script_line not in text:
    anchor = '  <script src="./backups.js"></script>\n'
    if anchor not in text:
        raise SystemExit("No se encontró el script de respaldos.")
    text = text.replace(anchor, anchor + script_line, 1)

index_path.write_text(text, encoding="utf-8")
print("Menú lateral enlazado correctamente.")
