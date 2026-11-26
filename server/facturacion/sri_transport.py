"""SRI offline SOAP transport, deliberately disconnected from the public web UI.

Production transmission is NOT enabled. Only trusted server-side code should
call this module after signature, schema, certificate and fiscal checks.
"""
from dataclasses import dataclass
from datetime import datetime
import base64
import re
import ssl
import urllib.request
from urllib.error import HTTPError, URLError
from lxml import etree

SOAP = "http://schemas.xmlsoap.org/soap/envelope/"
RECEPTION = "http://ec.gob.sri.ws.recepcion"
AUTHORIZATION = "http://ec.gob.sri.ws.autorizacion"
DS = "http://www.w3.org/2000/09/xmldsig#"
HOSTS = {"1": "celcer.sri.gob.ec", "2": "cel.sri.gob.ec"}
MAX_RESPONSE = 8_000_000

class SRIProtocolError(Exception):
    """Malformed or unexpected reply. Never treat as fiscal authorization."""

class SRIUnavailable(Exception):
    """Communication uncertain. Query the SAME key before any retry."""

@dataclass(frozen=True)
class Result:
    state: str
    messages: tuple = ()
    authorization_xml: bytes | None = None
    authorization_at: str | None = None

def parse(data):
    if not isinstance(data, bytes) or not data or len(data) > MAX_RESPONSE:
        raise SRIProtocolError("XML size invalid")
    try:
        root = etree.fromstring(data, parser=etree.XMLParser(
            resolve_entities=False, load_dtd=False, no_network=True, huge_tree=False))
    except etree.XMLSyntaxError as exc:
        raise SRIProtocolError("Invalid XML response") from exc
    if root.getroottree().docinfo.doctype:
        raise SRIProtocolError("DTD forbidden")
    return root

def one(node, name):
    found = node.findall(name)
    if len(found) != 1:
        raise SRIProtocolError("Missing or duplicated field: " + name)
    return found[0]

def field(node, name):
    return (one(node, name).text or "").strip()

def envelope(data, namespace, operation, result):
    root = parse(data)
    if root.tag != "{%s}Envelope" % SOAP:
        raise SRIProtocolError("Unexpected SOAP envelope")
    body = one(root, "{%s}Body" % SOAP)
    if body.find("{%s}Fault" % SOAP) is not None:
        raise SRIProtocolError("SRI SOAP fault")
    return one(one(body, "{%s}%sResponse" % (namespace, operation)), result)

def messages(node):
    return tuple({
        "identifier": (x.findtext("identificador") or "")[:30],
        "message": (x.findtext("mensaje") or "")[:500],
        "additional": (x.findtext("informacionAdicional") or "")[:1500],
        "type": (x.findtext("tipo") or "")[:30],
    } for x in node.findall(".//mensajes/mensaje"))

def validate_key(key, environment):
    if environment not in HOSTS or not re.fullmatch(r"[0-9]{49}", key):
        raise SRIProtocolError("Invalid environment or access key")
    from validate_invoice import check_digit
    if key[23] != environment or key[-1] != check_digit(key[:-1]):
        raise SRIProtocolError("Access key does not match environment or checksum")

def signed_invoice(data, key, environment):
    validate_key(key, environment)
    root = parse(data)
    if root.tag != "factura" or root.get("id") != "comprobante":
        raise SRIProtocolError("Unexpected invoice root")
    info = one(root, "infoTributaria")
    if field(info, "claveAcceso") != key or field(info, "ambiente") != environment:
        raise SRIProtocolError("Invoice identity mismatch")
    sigs = root.findall("{%s}Signature" % DS)
    if len(sigs) != 1:
        raise SRIProtocolError("Signed invoice required")
    return root

def reception_reply(data, key, environment):
    validate_key(key, environment)
    r = envelope(data, RECEPTION, "validarComprobante", "RespuestaRecepcionComprobante")
    state = field(r, "estado")
    found = r.findall("comprobantes/comprobante")
    if any(field(c, "claveAcceso") != key for c in found):
        raise SRIProtocolError("Reception key mismatch")
    msgs = messages(r)
    if state == "RECIBIDA":
        return Result("submitted", msgs)
    if state == "DEVUELTA" and found:
        # Duplicate / processing messages do not prove a failed authorization.
        uncertain = any(m["identifier"] in {"43", "45", "70"} for m in msgs)
        return Result("pending" if uncertain else "rejected", msgs)
    raise SRIProtocolError("Unknown reception result")

def authorization_reply(data, key, environment, expected_signed):
    expected = signed_invoice(expected_signed, key, environment)
    r = envelope(data, AUTHORIZATION, "autorizacionComprobante", "RespuestaAutorizacionComprobante")
    if field(r, "claveAccesoConsultada") != key:
        raise SRIProtocolError("Authorization key mismatch")
    count = field(r, "numeroComprobantes")
    if not re.fullmatch(r"\d{1,4}", count):
        raise SRIProtocolError("Invalid authorization count")
    found = r.findall("autorizaciones/autorizacion")
    if int(count) != len(found):
        raise SRIProtocolError("Authorization count mismatch")
    if not found:
        return Result("pending")
    if len(found) != 1:
        raise SRIProtocolError("Ambiguous authorization results")
    a = found[0]
    state = field(a, "estado")
    msgs = messages(a)
    if state in {"EN PROCESAMIENTO", "PPR"}:
        return Result("pending", msgs)
    if state in {"NO AUTORIZADO", "RECHAZADO"}:
        return Result("rejected", msgs)
    if state != "AUTORIZADO":
        raise SRIProtocolError("Unknown authorization status")
    env = field(a, "ambiente")
    if env != {"1": "PRUEBAS", "2": "PRODUCCION"}[environment]:
        raise SRIProtocolError("Authorization environment mismatch")
    if field(a, "numeroAutorizacion") != key:
        raise SRIProtocolError("Authorization number mismatch")
    stamp = field(a, "fechaAutorizacion")
    try:
        dt = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SRIProtocolError("Invalid authorization timestamp") from exc
    if dt.tzinfo is None:
        raise SRIProtocolError("Authorization timestamp lacks offset")
    inner = one(a, "comprobante")
    if len(inner) or not inner.text:
        raise SRIProtocolError("Expected embedded signed XML")
    returned = signed_invoice(inner.text.encode("utf-8"), key, environment)
    canonical = lambda x: etree.tostring(x, method="c14n", with_comments=False)
    if canonical(returned) != canonical(expected):
        raise SRIProtocolError("Authorized XML differs from signed invoice")
    # Preserve official authorization wrapper, not an invented representation.
    return Result("test_authorized" if environment == "1" else "authorized",
                  msgs, etree.tostring(a, encoding="UTF-8", xml_declaration=True), stamp)

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SRIProtocolError("Unexpected redirect from SRI")

def soap_request(namespace, operation, field_name, value):
    root = etree.Element("{%s}Envelope" % SOAP, nsmap={"soap": SOAP, "sri": namespace})
    body = etree.SubElement(root, "{%s}Body" % SOAP)
    op = etree.SubElement(body, "{%s}%s" % (namespace, operation))
    etree.SubElement(op, field_name).text = value
    return etree.tostring(root, encoding="UTF-8", xml_declaration=True)

def post(environment, service, payload, timeout=20):
    if environment not in HOSTS or service not in {"RecepcionComprobantesOffline", "AutorizacionComprobantesOffline"}:
        raise SRIProtocolError("Invalid service")
    url = "https://" + HOSTS[environment] + "/comprobantes-electronicos-ws/" + service
    req = urllib.request.Request(url, data=payload, headers={
        "Content-Type": "text/xml; charset=utf-8", "SOAPAction": '""',
        "Accept": "text/xml", "Accept-Encoding": "identity"}, method="POST")
    opener = urllib.request.build_opener(NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    try:
        with opener.open(req, timeout=timeout) as response:
            data = response.read(MAX_RESPONSE + 1)
            if len(data) > MAX_RESPONSE:
                raise SRIProtocolError("SRI response too large")
            return data
    except (HTTPError, URLError, TimeoutError, OSError) as exc:
        raise SRIUnavailable("SRI connection uncertain; query same key") from exc

def query_authorization(key, environment, expected_signed):
    signed_invoice(expected_signed, key, environment)
    payload = soap_request(AUTHORIZATION, "autorizacionComprobante", "claveAccesoComprobante", key)
    return authorization_reply(post(environment, "AutorizacionComprobantesOffline", payload),
                               key, environment, expected_signed)

def submit_certification(signed_xml, key, *, verified=False):
    """Certification only. Caller must independently verify signature and XSD.
    Never automatically retry an uncertain reception."""
    if verified is not True:
        raise SRIProtocolError("Signature and schema verification required")
    signed_invoice(signed_xml, key, "1")
    payload = soap_request(RECEPTION, "validarComprobante", "xml", base64.b64encode(signed_xml).decode("ascii"))
    return reception_reply(post("1", "RecepcionComprobantesOffline", payload), key, "1")
