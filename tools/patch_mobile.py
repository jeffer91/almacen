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

path = "web/app.js"
text = read(path)
text = text.replace(
    '''  const FIREBASE = Object.freeze({\n    projectId: "almacen-59227",\n    collection: "almacen_familiar_devices"\n  });''',
    '''  const FIREBASE = Object.freeze({\n    apiKey: "AIzaSyAXO_u1O0-8NYQL6oM8GWBdcmr2_--9Dp8",\n    projectId: "almacen-59227",\n    collection: "almacen_familiar_devices"\n  });''', 1)
text = text.replace('appVersion: "web-1.0.0"', 'appVersion: "web-1.1.0"')
text = text.replace('{ stringValue: "web-1.0.0" }', '{ stringValue: "web-1.1.0" }')
if "function normalizeLegacyData" not in text:
    text = text.replace(
        '''  const emptyData = () => ({\n    products: [], product_variants: [], product_photos: [], product_links: [], suppliers: [], product_costs: [], product_prices: []\n  });''',
        '''  const emptyData = () => ({\n    products: [], product_variants: [], product_photos: [], product_links: [], suppliers: [], product_costs: [], product_prices: []\n  });\n  function normalizeLegacyData(data = {}) {\n    const merged = { ...emptyData(), ...data };\n    merged.products = (merged.products || []).map((row) => row?.status === "inactive" ? { ...row, status: "active" } : row);\n    merged.product_variants = (merged.product_variants || []).map((row) => row?.status === "inactive" ? { ...row, status: "active" } : row);\n    return merged;\n  }''', 1)
text = text.replace('data: { ...emptyData(), ...(stored?.data || {}) },', 'data: normalizeLegacyData(stored?.data || {}),', 1)
text = text.replace(
    '''  function getFirebaseApiKey() {\n    if (window.ALMACEN_FIREBASE_API_KEY) return String(window.ALMACEN_FIREBASE_API_KEY);''',
    '''  function getFirebaseApiKey() {\n    if (window.ALMACEN_FIREBASE_API_KEY) return String(window.ALMACEN_FIREBASE_API_KEY);\n    if (FIREBASE.apiKey) return FIREBASE.apiKey;''', 1)
text = text.replace(
    'mergeLatest("products", data.products || [], ["updated_at", "created_at", "retired_at", "restored_at"]);',
    'mergeLatest("products", (data.products || []).map((row) => row?.status === "inactive" ? { ...row, status: "active" } : row), ["updated_at", "created_at", "retired_at", "restored_at"]);', 1)
text = text.replace(
    'mergeLatest("product_variants", data.product_variants || [], ["updated_at", "created_at", "retired_at", "restored_at"]);',
    'mergeLatest("product_variants", (data.product_variants || []).map((row) => row?.status === "inactive" ? { ...row, status: "active" } : row), ["updated_at", "created_at", "retired_at", "restored_at"]);', 1)
write(path, text)
replace_once("web/service-worker.js",
    'const CACHE_NAME = "almacen-familiar-mobile-v1";',
    'const CACHE_NAME = "almacen-familiar-mobile-v2";',
    "versión de caché")

print("Móvil actualizado")
