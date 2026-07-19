from pathlib import Path
import re

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

replace_once("app/renderer/index.html",
    '  <link rel="stylesheet" href="./styles/catalog.css">',
    '  <link rel="stylesheet" href="./styles/catalog.css">\n  <link rel="stylesheet" href="./styles/catalog-enhancements.css">',
    "estilo comercial")
replace_once("app/renderer/index.html",
    '  <script src="./catalog.js"></script>',
    '  <script src="./catalog.js"></script>\n  <script src="./catalog-enhancements.js"></script>',
    "script comercial")

path = ROOT / "app/renderer/catalog-enhancements.js"
text = path.read_text(encoding="utf-8")
pattern = r"  async function saveCompleteProduct\(event\) \{.*?\n  \}\n\n  function installPriceFields\(\) \{"
replacement = '''  async function saveCompleteProduct(event) {\n    event.preventDefault();\n    event.stopImmediatePropagation();\n    if (productForm.dataset.commercialBusy === "true") return;\n\n    const supplierId = document.getElementById("product-supplier")?.value || "";\n    const cost = Number(document.getElementById("product-cost")?.value);\n    const pvpWithTax = Number(document.getElementById("product-pvp-tax")?.value);\n    const taxRate = Number(document.getElementById("product-tax-rate")?.value);\n    const withoutTax = calculateWithoutTax(pvpWithTax, taxRate);\n\n    if (!supplierId) return setError(productError, "Selecciona o agrega un proveedor.");\n    if (!Number.isFinite(cost) || cost <= 0) return setError(productError, "El costo debe ser mayor que cero.");\n    if (!Number.isFinite(pvpWithTax) || pvpWithTax <= 0) return setError(productError, "El PVP con IVA debe ser mayor que cero.");\n    if (!Number.isFinite(taxRate) || taxRate < 0 || taxRate > 100) return setError(productError, "El IVA debe estar entre 0 y 100.");\n    if (withoutTax === "") return setError(productError, "No se pudo calcular el precio sin IVA.");\n    if (typeof window.almacen.createCompleteProduct !== "function") {\n      return setError(productError, "La aplicación necesita actualizarse antes de registrar productos.");\n    }\n\n    setError(productError, "");\n    productForm.dataset.commercialBusy = "true";\n    if (productSave) { productSave.disabled = true; productSave.textContent = "Guardando…"; }\n\n    try {\n      const initialVariantName = document.getElementById("product-variant-name")?.value.trim() || "";\n      const profile = window.AlmacenShell?.getProfile?.();\n      const response = await window.almacen.createCompleteProduct({\n        product: {\n          canonicalName: document.getElementById("product-name")?.value,\n          brand: document.getElementById("product-brand")?.value,\n          category: document.getElementById("product-category")?.value,\n          description: document.getElementById("product-description")?.value,\n          initialVariant: initialVariantName ? {\n            variantName: initialVariantName,\n            presentation: document.getElementById("product-presentation")?.value,\n            unitName: document.getElementById("product-unit")?.value,\n            quantityValue: document.getElementById("product-quantity")?.value || null\n          } : null\n        },\n        cost: { supplierId, amount: cost },\n        price: {\n          channelId: profile?.channelId, pvpWithTax, taxRate,\n          notes: `Precio sin IVA calculado: ${withoutTax.toFixed(2)}`\n        }\n      });\n      if (!response?.ok) throw new Error(response?.message || "No se pudo completar el registro.");\n\n      productDialog?.close();\n      const searchInput = document.getElementById("catalog-search-input");\n      if (searchInput) searchInput.value = response.created.product.canonicalName;\n      document.getElementById("catalog-search-button")?.click();\n      window.AlmacenShell?.showToast?.("Producto, proveedor, costo y precios guardados.");\n    } catch (error) {\n      setError(productError, error.message || "No se pudo completar el registro.");\n    } finally {\n      productForm.dataset.commercialBusy = "false";\n      if (productSave) { productSave.disabled = false; productSave.textContent = "Guardar producto"; }\n    }\n  }\n\n  function installPriceFields() {'''
text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
if count != 1:
    raise RuntimeError(f"Alta completa del renderer no reemplazada: {count}")
path.write_text(text, encoding="utf-8")

replace_once("app/renderer/catalog.js",
    'return { active: "Activo", inactive: "Inactivo", retired: "Retirado", hidden: "Oculta" }[status] || status || "—";',
    'return { active: "Activo", retired: "Retirado", hidden: "Oculta" }[status] || status || "—";',
    "etiqueta Inactivo")

catalog_path = ROOT / "app/renderer/catalog.js"
catalog = catalog_path.read_text(encoding="utf-8")
variants_pattern = r"  function renderVariants\(detail\) \{.*?\n  \}\n\n  function renderHistory\(detail\) \{"
variants_replacement = '''  function renderVariants(detail) {\n    const variants = detail.variants || [];\n    const cards = variants.length\n      ? variants.map((variant) => `\n          <article class="catalog-info-card">\n            <strong>${esc(variant.variantName)}</strong>\n            <p>${esc([variant.presentation, variant.quantityValue, variant.unitName].filter((value) => value !== null && value !== "").join(" ") || "Sin presentación adicional")}</p>\n            <p class="catalog-muted">${statusLabel(variant.status)}</p>\n            <div class="catalog-inline-actions">\n              ${variant.status !== "retired"\n                ? `<button class="button button-secondary" type="button" data-variant-status="retired" data-variant-id="${esc(variant.id)}">Retirar</button>`\n                : isAdministrator()\n                  ? `<button class="button button-secondary" type="button" data-variant-status="active" data-variant-id="${esc(variant.id)}">Restaurar</button>`\n                  : '<span class="catalog-muted">Solo Jefferson puede restaurarla.</span>'}\n            </div>\n          </article>\n        `).join("")\n      : '<p class="catalog-muted">Este producto todavía no tiene variaciones.</p>';\n\n    return `\n      <section class="catalog-section">\n        <div class="catalog-section-heading"><h3>Variaciones</h3><button class="button button-secondary" type="button" data-detail-action="variant">Agregar variación</button></div>\n        <div class="catalog-card-grid">${cards}</div>\n      </section>\n    `;\n  }\n\n  function renderHistory(detail) {'''
catalog, count = re.subn(variants_pattern, variants_replacement, catalog, count=1, flags=re.S)
if count != 1:
    raise RuntimeError(f"renderVariants no reemplazado: {count}")
old_status = '''    const statusActions = product.status === "active"\n      ? '<button class="button button-secondary" type="button" data-product-status="inactive">Inactivar</button><button class="button button-secondary" type="button" data-product-status="retired">Retirar</button>'\n      : product.status === "inactive"\n        ? '<button class="button button-secondary" type="button" data-product-status="active">Activar</button><button class="button button-secondary" type="button" data-product-status="retired">Retirar</button>'\n        : isAdministrator()\n          ? '<button class="button button-primary" type="button" data-product-status="active">Restaurar</button>'\n          : '<span class="catalog-muted">Solo Jefferson puede restaurar este producto.</span>';'''
new_status = '''    const statusActions = product.status === "retired"\n      ? isAdministrator()\n        ? '<button class="button button-primary" type="button" data-product-status="active">Restaurar</button>'\n        : '<span class="catalog-muted">Solo Jefferson puede restaurar este producto.</span>'\n      : '<button class="button button-secondary" type="button" data-product-status="retired">Retirar</button>';'''
if old_status not in catalog:
    raise RuntimeError("Acciones de estado de producto no encontradas")
catalog_path.write_text(catalog.replace(old_status, new_status, 1), encoding="utf-8")

replace_once("app/renderer/styles/catalog.css",
    '''.catalog-status[data-status="inactive"] {\n  background: #fff6db;\n  color: #755400;\n}\n\n''', "", "estilo Inactivo")

print("Renderer actualizado")
