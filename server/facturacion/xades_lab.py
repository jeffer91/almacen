"""Offline XAdES-BES laboratory prototype. No real certificate input or SRI transport."""
import base64
import copy
import hashlib
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from lxml import etree
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

DS = "http://www.w3.org/2000/09/xmldsig#"
XA = "http://uri.etsi.org/01903/v1.3.2#"
C14N = "http://www.w3.org/TR/2001/REC-xml-c14n-20010315"
SHA1 = DS + "sha1"
RSA_SHA1 = DS + "rsa-sha1"
ENV = DS + "enveloped-signature"
PROPS = "http://uri.etsi.org/01903#SignedProperties"
LAB_CN = "NICOLE LABORATORIO - NO VALIDO"
LAB_RUC = "1234567890001"
NS = {"ds": DS, "xades": XA}

def element(parent, ns, name, text=None, **attrs):
    child = etree.SubElement(parent, "{%s}%s" % (ns, name), **attrs)
    if text is not None:
        child.text = str(text)
    return child

def b64(value):
    return base64.b64encode(value).decode("ascii")

def digest(value):
    return b64(hashlib.sha1(value).digest())

def canonical(node):
    return etree.tostring(node, method="c14n", exclusive=False, with_comments=False)

def parse(data):
    if not isinstance(data, bytes) or len(data) > 2_000_000:
        raise ValueError("XML exceeds laboratory limit")
    root = etree.fromstring(data, parser=etree.XMLParser(resolve_entities=False, load_dtd=False, no_network=True, huge_tree=False))
    if root.getroottree().docinfo.doctype or root.tag != "factura" or root.get("id") != "comprobante" or root.get("version") != "1.1.0":
        raise ValueError("Expected invoice 1.1.0 without DTD")
    if root.findtext("infoTributaria/ambiente") != "1" or root.findtext("infoTributaria/ruc") != LAB_RUC:
        raise ValueError("Synthetic laboratory invoices only")
    if root.findtext("infoTributaria/razonSocial") != "EMISOR DE PRUEBA":
        raise ValueError("Synthetic issuer required")
    if not any("PRUEBA LOCAL" in (v.text or "") for v in root.findall("infoAdicional/campoAdicional")):
        raise ValueError("Laboratory marker required")
    return root

def generate_test_identity():
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, LAB_CN)])
    now = datetime.now(timezone.utc)
    cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
        .public_key(key.public_key()).serial_number(x509.random_serial_number())
        .not_valid_before(now-timedelta(minutes=5)).not_valid_after(now+timedelta(days=1))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(key, hashes.SHA256()))
    # Exercise PKCS#12 loading without persisting a key or accepting an external certificate.
    password = uuid4().hex.encode()
    blob = pkcs12.serialize_key_and_certificates(b"laboratory", key, cert, None, serialization.BestAvailableEncryption(password))
    key, cert, _ = pkcs12.load_key_and_certificates(blob, password)
    return key, cert

def reference(si, target, node, *, kind=None, ref_id=None, enveloped=False):
    attrs = {"URI": "#" + target}
    if kind:
        attrs["Type"] = kind
    if ref_id:
        attrs["Id"] = ref_id
    ref = element(si, DS, "Reference", **attrs)
    transforms = element(ref, DS, "Transforms")
    if enveloped:
        element(transforms, DS, "Transform", Algorithm=ENV)
    element(transforms, DS, "Transform", Algorithm=C14N)
    element(ref, DS, "DigestMethod", Algorithm=SHA1)
    element(ref, DS, "DigestValue", digest(canonical(node)))

def sign_lab(data):
    root = parse(data)
    if root.xpath("//ds:Signature", namespaces=NS):
        raise ValueError("Already signed")
    if any(a in ("Id", "ID", "{http://www.w3.org/XML/1998/namespace}id") or (a == "id" and n is not root)
           for n in root.iter() if isinstance(n.tag, str) for a in n.attrib):
        raise ValueError("Unexpected identifier")
    key, cert = generate_test_identity()
    der = cert.public_bytes(serialization.Encoding.DER)
    unsigned = copy.deepcopy(root)
    sid = "Signature-" + uuid4().hex
    kid, pid, rid = sid+"-KeyInfo", sid+"-Properties", sid+"-Document"
    sig = etree.SubElement(root, "{%s}Signature" % DS, nsmap=NS, Id=sid)
    si = element(sig, DS, "SignedInfo")
    element(si, DS, "CanonicalizationMethod", Algorithm=C14N)
    element(si, DS, "SignatureMethod", Algorithm=RSA_SHA1)
    sv = element(sig, DS, "SignatureValue")
    ki = element(sig, DS, "KeyInfo", Id=kid)
    xd = element(ki, DS, "X509Data")
    element(xd, DS, "X509Certificate", b64(der))
    kv = element(element(ki, DS, "KeyValue"), DS, "RSAKeyValue")
    pub = key.public_key().public_numbers()
    for name, num in (("Modulus", pub.n), ("Exponent", pub.e)):
        element(kv, DS, name, b64(num.to_bytes((num.bit_length()+7)//8, "big")))
    obj = element(sig, DS, "Object")
    qp = element(obj, XA, "QualifyingProperties", Target="#"+sid)
    sp = element(qp, XA, "SignedProperties", Id=pid)
    ssp = element(sp, XA, "SignedSignatureProperties")
    element(ssp, XA, "SigningTime", datetime.now(timezone.utc).isoformat(timespec="seconds"))
    c = element(element(ssp, XA, "SigningCertificate"), XA, "Cert")
    cd = element(c, XA, "CertDigest")
    element(cd, DS, "DigestMethod", Algorithm=SHA1)
    element(cd, DS, "DigestValue", digest(der))
    iss = element(c, XA, "IssuerSerial")
    element(iss, DS, "X509IssuerName", cert.issuer.rfc4514_string())
    element(iss, DS, "X509SerialNumber", cert.serial_number)
    fmt = element(element(sp, XA, "SignedDataObjectProperties"), XA, "DataObjectFormat", ObjectReference="#"+rid)
    element(fmt, XA, "Description", "Comprobante de laboratorio")
    element(fmt, XA, "MimeType", "text/xml")
    reference(si, pid, sp, kind=PROPS)
    reference(si, kid, ki)
    reference(si, "comprobante", unsigned, ref_id=rid, enveloped=True)
    sv.text = b64(key.sign(canonical(si), padding.PKCS1v15(), hashes.SHA1()))
    signed = etree.tostring(root, encoding="UTF-8", xml_declaration=True)
    verify_lab(signed)
    return signed

def verify_lab(data):
    root = parse(data)
    signatures = root.xpath("//ds:Signature", namespaces=NS)
    if len(signatures) != 1 or signatures[0].getparent() is not root:
        raise ValueError("Expected exactly one enveloped signature")
    sig = signatures[0]
    si = sig.find("{%s}SignedInfo" % DS)
    ki = sig.find("{%s}KeyInfo" % DS)
    sp = sig.find(".//{%s}SignedProperties" % XA)
    if si is None or ki is None or sp is None:
        raise ValueError("Incomplete signature")
    if si.find("{%s}CanonicalizationMethod" % DS).get("Algorithm") != C14N or si.find("{%s}SignatureMethod" % DS).get("Algorithm") != RSA_SHA1:
        raise ValueError("Unexpected signature algorithms")
    der = base64.b64decode(ki.findtext(".//{%s}X509Certificate" % DS), validate=True)
    cert = x509.load_der_x509_certificate(der)
    if cert.subject != cert.issuer or cert.subject.get_attributes_for_oid(NameOID.COMMON_NAME)[0].value != LAB_CN:
        raise ValueError("Non-laboratory certificate")
    now = datetime.now(timezone.utc)
    if not cert.not_valid_before_utc <= now <= cert.not_valid_after_utc:
        raise ValueError("Expired laboratory certificate")
    cert.public_key().verify(cert.signature, cert.tbs_certificate_bytes, padding.PKCS1v15(), cert.signature_hash_algorithm)
    cert.public_key().verify(base64.b64decode(sig.findtext("{%s}SignatureValue" % DS), validate=True), canonical(si), padding.PKCS1v15(), hashes.SHA1())
    ids = root.xpath("//*[@Id or @ID or @id or @xml:id]", namespaces={"xml":"http://www.w3.org/XML/1998/namespace"})
    seen = set()
    for n in ids:
        for a in ("Id","ID","id","{http://www.w3.org/XML/1998/namespace}id"):
            if a in n.attrib:
                v = n.get(a)
                if v in seen:
                    raise ValueError("Duplicate identifier")
                seen.add(v)
    unsigned = copy.deepcopy(root)
    unsigned.remove(unsigned.find("{%s}Signature" % DS))
    targets = {"#comprobante": unsigned, "#"+ki.get("Id"): ki, "#"+sp.get("Id"): sp}
    refs = si.findall("{%s}Reference" % DS)
    if len(refs) != 3 or {r.get("URI") for r in refs} != set(targets):
        raise ValueError("Unexpected references")
    for ref in refs:
        uri = ref.get("URI")
        expected = [ENV, C14N] if uri == "#comprobante" else [C14N]
        algorithms = [t.get("Algorithm") for t in ref.findall(".//{%s}Transform" % DS)]
        if algorithms != expected or ref.find("{%s}DigestMethod" % DS).get("Algorithm") != SHA1:
            raise ValueError("Unexpected digest or transforms")
        if ref.findtext("{%s}DigestValue" % DS) != digest(canonical(targets[uri])):
            raise ValueError("Modified signed reference")
        if uri == "#"+sp.get("Id") and ref.get("Type") != PROPS:
            raise ValueError("Incorrect SignedProperties type")
    if sp.findtext(".//{%s}CertDigest/{%s}DigestValue" % (XA,DS)) != digest(der):
        raise ValueError("Certificate digest mismatch")
    if sp.getparent().get("Target") != "#"+sig.get("Id"):
        raise ValueError("Incorrect XAdES target")
    return True
