"""Validate lab XML against the pinned reference XSD. Never transmit or log customer data."""
from pathlib import Path
import json
import subprocess
import sys
from lxml import etree

ROOT = Path(__file__).resolve().parents[1]
SCHEMA = ROOT / "vendor/sri/xsd/factura_V1.1.0.xsd"

def parser():
    return etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False, huge_tree=False)

def read_xml(data):
    root = etree.fromstring(data, parser=parser())
    if root.getroottree().docinfo.doctype:
        raise ValueError("DTD forbidden in invoice XML")
    if root.tag != "factura" or root.get("version") != "1.1.0":
        raise ValueError("Expected factura 1.1.0")
    if root.findtext("infoTributaria/ambiente") != "1":
        raise ValueError("Laboratory validation only; environment must be 1")
    return root

def main():
    schema = etree.XMLSchema(etree.parse(str(SCHEMA), parser=parser()))
    if len(sys.argv) > 1:
        for arg in sys.argv[1:]:
            data = Path(arg).read_bytes()
            try:
                schema.assertValid(read_xml(data))
            except (etree.XMLSyntaxError, etree.DocumentInvalid, ValueError) as e:
                print(f"INVALID: {type(e).__name__}; line {getattr(e, 'lineno', '?')}.", file=sys.stderr)
                return 1
            print("Valid against reference XSD; not authorized or signed.")
        return 0
    cases = json.loads(subprocess.check_output(["node", str(ROOT / "tests/invoice_xsd_fixtures.js")]))
    for i, xml in enumerate(cases, 1):
        root = read_xml(xml.encode("utf-8"))
        schema.assertValid(root)
        print(f"Fixture {i}: valid against reference XSD")
    for bad in (
        cases[0].replace("<importeTotal>105.05</importeTotal>", ""),
        cases[0].replace("<cantidad>50.000000</cantidad>", "<cantidad>abc</cantidad>"),
        cases[0].replace("<claveAcceso>", "<claveAcceso>0"),
    ):
        if schema.validate(read_xml(bad.encode("utf-8"))):
            raise AssertionError("Invalid structure was accepted")
    print("Three invalid structural fixtures rejected.")
    return 0

if __name__ == "__main__":
    sys.exit(main())
