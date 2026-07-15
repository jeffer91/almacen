from pathlib import Path

root = Path(__file__).resolve().parents[1]
path = root / "app/renderer/admin-navigation.js"
text = path.read_text(encoding="utf-8")

old = '''  screen.dataset.navigationReady = "true";
  screen.classList.add("admin-navigation-ready");'''
new = '''  screen.dataset.navigationReady = "true";
  screen.classList.add("admin-navigation-ready");
  screen.setAttribute("aria-labelledby", "admin-navigation-title");'''
if old not in text:
    raise SystemExit("No se encontró el inicio de la navegación administrativa.")
text = text.replace(old, new, 1)

old = '''  const headingTitle = create("h1", "", "Resumen general");
  headingTitle.id = "admin-navigation-title";'''
new = '''  const headingTitle = create("h1", "", "Resumen general");
  headingTitle.id = "admin-navigation-title";
  headingTitle.tabIndex = -1;'''
if old not in text:
    raise SystemExit("No se encontró el título principal de Administración.")
text = text.replace(old, new, 1)

path.write_text(text, encoding="utf-8")
print("Accesibilidad del menú lateral finalizada.")
