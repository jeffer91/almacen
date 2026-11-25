"""Synthetic-only tests: no secrets, no SRI network, no fiscal number."""
import json
import subprocess
import sys
from pathlib import Path
from lxml import etree
from cryptography.exceptions import InvalidSignature
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server/facturacion"))
from xades_lab import sign_lab, verify_lab, DS, XA, NS

def rejected(data):
    try:
        verify_lab(data)
    except (ValueError, InvalidSignature):
        return
    raise AssertionError("Modified signature accepted")

def main():
    fixtures = json.loads(subprocess.check_output(["node", str(ROOT/"tests/invoice_xsd_fixtures.js")]))
    schema = etree.XMLSchema(etree.parse(str(ROOT/"vendor/sri/xsd/factura_V1.1.0.xsd"), parser=etree.XMLParser(resolve_entities=False,no_network=True,load_dtd=False)))
    for fixture in fixtures:
        signed = sign_lab(fixture.encode())
        assert verify_lab(signed)
        root = etree.fromstring(signed)
        schema.assertValid(root)
        print("Synthetic invoice: signed, cryptographically verified and reference XSD valid")
        rejected(signed.replace(b"<importeTotal>",b"<importeTotal>1",1))
        for xpath in (".//xades:SigningTime",".//ds:X509Certificate",".//ds:SignatureValue"):
            changed = etree.fromstring(signed)
            node = changed.find(xpath, namespaces=NS)
            node.text = ("A" if node.text[0] != "A" else "B")+node.text[1:]
            rejected(etree.tostring(changed))
        try:
            sign_lab(signed)
        except ValueError:
            pass
        else:
            raise AssertionError("Duplicate signature")
    try:
        sign_lab(fixtures[0].replace("<ambiente>1</ambiente>","<ambiente>2</ambiente>").encode())
    except ValueError:
        pass
    else:
        raise AssertionError("Production allowed")
    print("Tampering, duplicate signing and production rejected.")

if __name__ == "__main__":
    main()
