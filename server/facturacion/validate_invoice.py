"""Independent monetary and access-key validation for local invoice laboratory.
No signing, credential storage, or SRI communication. Accepts parsed XML only
after the caller has rejected external entities and validated the XSD.
"""
from collections import defaultdict
from datetime import datetime
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP, localcontext
import re

CENT = Decimal("0.01")

def amount(element, path, precision=2):
    raw = element.findtext(path)
    if raw is None or not re.fullmatch(r"\d{1,12}(?:\.\d{1," + str(precision) + r"})?", raw):
        raise ValueError("Invalid decimal: " + path)
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError("Invalid decimal") from exc
    if not value.is_finite():
        raise ValueError("Nonfinite decimal")
    return value

def money(value):
    return value.quantize(CENT, rounding=ROUND_HALF_UP)

def check_digit(base):
    if not re.fullmatch(r"[0-9]{48}", base):
        raise ValueError("Invalid access key")
    weight = 2
    total = 0
    for digit in reversed(base):
        total += int(digit) * weight
        weight = 2 if weight == 7 else weight + 1
    result = 11 - total % 11
    return str(0 if result == 11 else 1 if result == 10 else result)

def verify_key(root):
    info = root.find("infoTributaria")
    fiscal = root.find("infoFactura")
    if info is None or fiscal is None:
        raise ValueError("Missing invoice header")
    key = info.findtext("claveAcceso") or ""
    if not re.fullmatch(r"[0-9]{49}", key) or key[-1] != check_digit(key[:-1]):
        raise ValueError("Invalid access-key check digit")
    date = datetime.strptime(fiscal.findtext("fechaEmision"), "%d/%m/%Y").strftime("%d%m%Y")
    expected = date + "".join(info.findtext(tag) or "" for tag in (
        "codDoc", "ruc", "ambiente", "estab", "ptoEmi", "secuencial"
    )) + key[39:47] + (info.findtext("tipoEmision") or "")
    if key[:-1] != expected or info.findtext("codDoc") != "01" or info.findtext("ambiente") != "1" or info.findtext("tipoEmision") != "1":
        raise ValueError("Access-key fields mismatch; laboratory only")
    if info.findtext("secuencial") == "000000000":
        raise ValueError("Zero sequential")

def validate_invoice(root):
    """Raise ValueError on semantic mismatch, even for an XSD-valid invoice."""
    with localcontext() as ctx:
        ctx.prec = 40
        verify_key(root)
        fiscal = root.find("infoFactura")
        totals = defaultdict(lambda: [Decimal(0), Decimal(0)])
        subtotal = discount = tax = Decimal(0)
        details = root.findall("detalles/detalle")
        if not 1 <= len(details) <= 100:
            raise ValueError("Invalid line count")
        for line in details:
            q = amount(line, "cantidad", 6)
            price = amount(line, "precioUnitario", 6)
            ds = amount(line, "descuento")
            base = money(q * price) - ds
            if q <= 0 or base < 0 or base != amount(line, "precioTotalSinImpuesto"):
                raise ValueError("Line subtotal mismatch")
            taxes = line.findall("impuestos/impuesto")
            if len(taxes) != 1 or taxes[0].findtext("codigo") != "2":
                raise ValueError("Unsupported tax profile")
            row = taxes[0]
            code = row.findtext("codigoPorcentaje")
            rate = amount(row, "tarifa")
            if (code, rate) not in {("4", Decimal(15)), ("0", Decimal(0))}:
                raise ValueError("Unsupported VAT rate")
            value = money(base * rate / 100)
            if amount(row, "baseImponible") != base or amount(row, "valor") != value:
                raise ValueError("Line VAT mismatch")
            subtotal += base
            discount += ds
            tax += value
            totals[code][0] += base
            totals[code][1] += value
        declared = {}
        for row in fiscal.findall("totalConImpuestos/totalImpuesto"):
            code = row.findtext("codigoPorcentaje")
            if row.findtext("codigo") != "2" or code in declared:
                raise ValueError("Invalid tax grouping")
            declared[code] = [amount(row, "baseImponible"), amount(row, "valor")]
        if dict(totals) != declared:
            raise ValueError("Grouped tax mismatch")
        total = subtotal + tax
        if (subtotal != amount(fiscal, "totalSinImpuestos")
                or discount != amount(fiscal, "totalDescuento")
                or amount(fiscal, "propina") != 0
                or total != amount(fiscal, "importeTotal")):
            raise ValueError("Invoice totals mismatch")
        payments = fiscal.findall("pagos/pago")
        if not payments or any(p.findtext("formaPago") not in {"01", "16", "19", "20"} for p in payments):
            raise ValueError("Unsupported payment")
        if sum((amount(p, "total") for p in payments), Decimal(0)) != total:
            raise ValueError("Payment total mismatch")
        return {"subtotal": subtotal, "discount": discount, "tax": tax, "total": total}
