"""All SOAP replies are synthetic; no network, no real certificates."""
import pathlib
import sys
import subprocess
import json
import unittest
from unittest.mock import patch
from lxml import etree

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "server/facturacion"))
import sri_transport as sri
from xades_lab import sign_lab
from validate_invoice import check_digit

def reply(namespace, op, tag, body):
    return ('<s:Envelope xmlns:s="'+sri.SOAP+'"><s:Body><r:'+op+'Response xmlns:r="'+namespace+'"><'+tag+'>'+body+'</'+tag+'></r:'+op+'Response></s:Body></s:Envelope>').encode()

class TestSRI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        unsigned = json.loads(subprocess.check_output(["node", str(ROOT/"tests/invoice_xsd_fixtures.js")]))[0]
        cls.signed = sign_lab(unsigned.encode())
        cls.key = etree.fromstring(cls.signed).findtext("infoTributaria/claveAcceso")

    def reception(self, state, detail=""):
        return reply(sri.RECEPTION, "validarComprobante", "RespuestaRecepcionComprobante",
                     "<estado>"+state+"</estado><comprobantes>"+detail+"</comprobantes>")

    def authorization(self, state="AUTORIZADO", env="PRUEBAS", signed=None, count=1, key=None):
        key = key or self.key
        inner = (signed or self.signed).decode()
        row = ("<autorizacion><estado>"+state+"</estado><numeroAutorizacion>"+key+
               "</numeroAutorizacion><fechaAutorizacion>2026-11-26T10:00:00-05:00</fechaAutorizacion>"
               "<ambiente>"+env+"</ambiente><comprobante><![CDATA["+inner+
               "]]></comprobante><mensajes/></autorizacion>") if count else ""
        return reply(sri.AUTHORIZATION, "autorizacionComprobante", "RespuestaAutorizacionComprobante",
                     "<claveAccesoConsultada>"+key+"</claveAccesoConsultada><numeroComprobantes>"+str(count)+
                     "</numeroComprobantes><autorizaciones>"+row+"</autorizaciones>")

    def test_received_not_authorized(self):
        result = sri.reception_reply(self.reception("RECIBIDA"), self.key, "1")
        self.assertEqual(result.state, "submitted")
        self.assertIsNone(result.authorization_xml)

    def test_returned_and_duplicate(self):
        for code, state in [("35","rejected"),("43","pending"),("70","pending")]:
            detail = "<comprobante><claveAcceso>"+self.key+"</claveAcceso><mensajes><mensaje><identificador>"+code+"</identificador><mensaje>Prueba</mensaje><tipo>ERROR</tipo></mensaje></mensajes></comprobante>"
            result = sri.reception_reply(self.reception("DEVUELTA",detail),self.key,"1")
            self.assertEqual(result.state,state)
            self.assertEqual(result.messages[0]["identifier"],code)

    def test_authorization_only_in_test(self):
        result = sri.authorization_reply(self.authorization(),self.key,"1",self.signed)
        self.assertEqual(result.state,"test_authorized")
        self.assertIsNotNone(result.authorization_xml)

    def test_pending_and_rejected(self):
        for data,state in [(self.authorization(count=0),"pending"),(self.authorization("NO AUTORIZADO"),"rejected")]:
            self.assertEqual(sri.authorization_reply(data,self.key,"1",self.signed).state,state)

    def test_wrong_document_environment_and_count(self):
        modified = self.signed.replace(b"105.05",b"105.04")
        for data in [self.authorization(signed=modified),self.authorization(env="PRODUCCION"),
                     self.authorization(count=2),self.authorization(key="0"*49),
                     self.authorization().replace(b"<estado>AUTORIZADO</estado>",b"<estado>AUTORIZADO</estado><estado>AUTORIZADO</estado>"),
                     self.authorization().replace(b"2026-11-26T10:00:00-05:00",b"2026-11-26T10:00:00")]:
            with self.assertRaises(sri.SRIProtocolError):
                sri.authorization_reply(data,self.key,"1",self.signed)

    def test_protocol_errors(self):
        for data in [b"<invalid/>",b"<!DOCTYPE x [<!ENTITY a 'b'>]><x>&a;</x>",self.reception("INVENTADO")]:
            with self.assertRaises(sri.SRIProtocolError):
                sri.reception_reply(data,self.key,"1")

    def test_production_block_and_uncertain_connection(self):
        with patch.object(sri,"post") as mock:
            with self.assertRaises(sri.SRIProtocolError):
                sri.submit_certification(self.signed,self.key)
            mock.assert_not_called()
            mock.side_effect=sri.SRIUnavailable("timeout")
            with self.assertRaises(sri.SRIUnavailable):
                sri.submit_certification(self.signed,self.key,verified=True)
            mock.assert_called_once()
            self.assertEqual(mock.call_args.args[0],"1")

    def test_soap_payload(self):
        with patch.object(sri,"post",return_value=self.reception("RECIBIDA")) as mock:
            sri.submit_certification(self.signed,self.key,verified=True)
            payload = etree.fromstring(mock.call_args.args[2])
            self.assertEqual(payload.findtext(".//xml"),sri.base64.b64encode(self.signed).decode())

if __name__ == "__main__":
    unittest.main()
