from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / "app/main/catalog/commerce-service.js"
text = PATH.read_text(encoding="utf-8")

if "const DEFAULT_TAX_RATE = 15;" not in text:
    text = text.replace(
        'const crypto = require("node:crypto");\n',
        '''const crypto = require("node:crypto");\n\nconst DEFAULT_TAX_RATE = 15;\nconst MONEY_FACTOR = 100;\n\nfunction roundMoney(value) {\n  return Math.round((Number(value) + Number.EPSILON) * MONEY_FACTOR) / MONEY_FACTOR;\n}\n\nfunction normalizeTaxRate(value) {\n  const number = value === null || typeof value === "undefined" || value === ""\n    ? DEFAULT_TAX_RATE\n    : Number(value);\n  if (!Number.isFinite(number) || number < 0 || number > 100) {\n    throw commerceError("TAX_RATE_INVALID", "El porcentaje de IVA debe estar entre 0 y 100.");\n  }\n  return Math.round(number * 100) / 100;\n}\n\nfunction calculatePriceWithoutTax(pvpWithTax, taxRate) {\n  const gross = positiveMoney(pvpWithTax, "El PVP con IVA");\n  const rate = normalizeTaxRate(taxRate);\n  return roundMoney(gross / (1 + rate / 100));\n}\n''', 1)

text = text.replace("  return Math.round(number * 100) / 100;", "  return roundMoney(number);", 1)

pattern = r"  recordPrice\(input, rawContext\) \{.*?\n  \}\n\n  getProductCommerce\(productId\) \{"
replacement = '''  recordPrice(input, rawContext) {\n    const context = requireContext(rawContext);\n    this.ensureContext(context);\n    const productId = cleanText(input?.productId, { required: true, max: 80, label: "El producto" });\n    const variantId = cleanText(input?.variantId, { max: 80 });\n    this.ensureProduct(productId, variantId);\n\n    const channelId = cleanText(input?.channelId, { max: 80 }) || context.channelId;\n    const channel = this.database.prepare("SELECT id FROM channels WHERE id = ? AND is_active = 1").get(channelId);\n    if (!channel) throw commerceError("CHANNEL_NOT_FOUND", "No se encontró el local seleccionado.");\n\n    const pvpWithTax = positiveMoney(input?.pvpWithTax ?? input?.amount, "El PVP con IVA");\n    const taxRate = normalizeTaxRate(input?.taxRate);\n    const priceWithoutTax = calculatePriceWithoutTax(pvpWithTax, taxRate);\n    const timestamp = nowIso();\n    const price = {\n      id: crypto.randomUUID(), productId, variantId, channelId, amount: pvpWithTax,\n      pvpWithTax, priceWithoutTax, taxRate, currency: "USD",\n      notes: cleanText(input?.notes, { max: 1000 }),\n      createdByUserId: context.userId, deviceId: context.deviceId, createdAt: timestamp\n    };\n\n    this.database.prepare(\n      `INSERT INTO product_prices (\n        id, product_id, variant_id, channel_id, amount, pvp_with_tax,\n        price_without_tax, tax_rate, currency, notes, created_by_user_id,\n        device_id, created_at, sync_status, synchronized_at\n      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'USD', ?, ?, ?, ?, 'pending', NULL)`\n    ).run(\n      price.id, price.productId, price.variantId, price.channelId, price.amount,\n      price.pvpWithTax, price.priceWithoutTax, price.taxRate, price.notes,\n      context.userId, context.deviceId, timestamp\n    );\n\n    this.insertAudit({\n      eventType: "product_price_recorded", entityType: "product_price",\n      entityId: price.id, context, details: price, timestamp\n    });\n    this.insertSync({ table: "product_prices", recordId: price.id, operation: "insert", payload: price, timestamp });\n    this.recordRecent(productId, "price_updated", context);\n    return price;\n  }\n\n  getProductCommerce(productId) {'''
text, count = re.subn(pattern, replacement, text, count=1, flags=re.S)
if count != 1:
    raise RuntimeError(f"recordPrice no reemplazado: {count}")

old_map = '''        channelName: row.channel_name,\n        amount: Number(row.amount),\n        currency: row.currency,'''
new_map = '''        channelName: row.channel_name,\n        amount: Number(row.pvp_with_tax ?? row.amount),\n        pvpWithTax: Number(row.pvp_with_tax ?? row.amount),\n        priceWithoutTax: Number(row.price_without_tax ?? row.amount),\n        taxRate: Number(row.tax_rate ?? 0),\n        currency: row.currency,'''
if old_map not in text:
    raise RuntimeError("mapeo de precios no encontrado")
text = text.replace(old_map, new_map, 1)

old_exports = '''module.exports = {\n  CommerceService,\n  cleanText,\n  normalizeName,\n  requireContext\n};'''
new_exports = '''module.exports = {\n  CommerceService,\n  DEFAULT_TAX_RATE,\n  calculatePriceWithoutTax,\n  cleanText,\n  normalizeName,\n  normalizeTaxRate,\n  requireContext,\n  roundMoney\n};'''
if old_exports not in text:
    raise RuntimeError("exportaciones no encontradas")
text = text.replace(old_exports, new_exports, 1)
PATH.write_text(text, encoding="utf-8")
print("Comercio actualizado")
