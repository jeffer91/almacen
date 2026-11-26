import pathlib
import sys
import unittest
from datetime import datetime, timezone, timedelta
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"server/facturacion"))
from certificate_preflight import inspect_pkcs12

class TestCertificatePreflight(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.key=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        cls.ca=rsa.generate_private_key(public_exponent=65537,key_size=2048)
        cls.name=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,"SYNTHETIC HOLDER")])
        cls.issuer=x509.Name([x509.NameAttribute(NameOID.COMMON_NAME,"SYNTHETIC CA")])
        cls.now=datetime.now(timezone.utc)

    def blob(self,expired=False,self_issued=False,usage=True):
        builder=x509.CertificateBuilder().subject_name(self.name).issuer_name(self.name if self_issued else self.issuer).public_key(self.key.public_key()).serial_number(x509.random_serial_number()).not_valid_before(self.now-timedelta(days=2)).not_valid_after(self.now+timedelta(days=-1 if expired else 1)).add_extension(x509.BasicConstraints(ca=False,path_length=None),critical=True)
        if usage:
            builder=builder.add_extension(x509.KeyUsage(digital_signature=True,content_commitment=True,key_encipherment=False,data_encipherment=False,key_agreement=False,key_cert_sign=False,crl_sign=False,encipher_only=False,decipher_only=False),critical=True)
        cert=builder.sign(self.key if self_issued else self.ca,hashes.SHA256())
        return pkcs12.serialize_key_and_certificates(b"fixture",self.key,cert,None,serialization.BestAvailableEncryption(b"synthetic"))

    def test_preflight_does_not_certify_production(self):
        data=inspect_pkcs12(self.blob(),b"synthetic")
        self.assertTrue(data["private_key_matches"])
        self.assertFalse(data["production_ready"])
        self.assertFalse(data["revocation_verified"])
        self.assertFalse(data["trust_chain_verified"])
        self.assertNotIn("password",data)

    def test_invalid_inputs(self):
        for blob,pwd in [(self.blob(),b"wrong"),(self.blob(expired=True),b"synthetic"),(self.blob(self_issued=True),b"synthetic"),(self.blob(usage=False),b"synthetic"),(b"invalid",b"synthetic")]:
            with self.assertRaises(ValueError):
                inspect_pkcs12(blob,pwd)

if __name__=="__main__":
    unittest.main()
