"""Private certificate preflight. Does not upload, store, sign or send anything.
Run on the future private signing host, not GitHub Pages or CI with real keys.
"""
import argparse
import getpass
import json
from datetime import datetime, timezone
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12

def inspect_pkcs12(blob, password, now=None):
    if not isinstance(blob, bytes) or not 0 < len(blob) <= 2_000_000:
        raise ValueError("Invalid PKCS#12 file size")
    try:
        key, cert, chain = pkcs12.load_key_and_certificates(blob, password)
    except (ValueError, TypeError) as exc:
        raise ValueError("Invalid certificate file or password") from exc
    if cert is None or key is None or not isinstance(key, rsa.RSAPrivateKey) or key.key_size < 2048:
        raise ValueError("RSA certificate and matching private key required (minimum 2048 bits)")
    pub = cert.public_key()
    if not isinstance(pub, rsa.RSAPublicKey) or pub.public_numbers() != key.public_key().public_numbers():
        raise ValueError("Certificate and private key do not match")
    now = now or datetime.now(timezone.utc)
    if not cert.not_valid_before_utc <= now <= cert.not_valid_after_utc:
        raise ValueError("Certificate not currently valid")
    try:
        usage = cert.extensions.get_extension_for_class(x509.KeyUsage).value
        if not (usage.digital_signature or usage.content_commitment):
            raise ValueError("Certificate not permitted for digital signatures")
    except x509.ExtensionNotFound:
        raise ValueError("Certificate key usage missing; specialist review required") from None
    try:
        if cert.extensions.get_extension_for_class(x509.BasicConstraints).value.ca:
            raise ValueError("CA certificate cannot be used to issue invoices")
    except x509.ExtensionNotFound:
        pass
    if cert.subject == cert.issuer:
        raise ValueError("Self-issued certificate not accepted for commercial preflight")
    # Only public metadata is returned. No private material or password.
    return {"fingerprint_sha256": cert.fingerprint(hashes.SHA256()).hex(),
            "subject": cert.subject.rfc4514_string(),
            "issuer": cert.issuer.rfc4514_string(),
            "not_before": cert.not_valid_before_utc.isoformat(),
            "not_after": cert.not_valid_after_utc.isoformat(),
            "chain_certificates": len(chain or []),
            "private_key_matches": True, "time_valid": True,
            "trust_chain_verified": False, "revocation_verified": False,
            "issuer_identity_verified": False, "production_ready": False}

def main():
    p=argparse.ArgumentParser(description="Offline Security Data PKCS#12 preflight; no credentials are stored")
    p.add_argument("file", type=Path)
    a=p.parse_args()
    try:
        if a.file.suffix.lower() not in {".p12", ".pfx"} or a.file.stat().st_size > 2_000_000:
            raise ValueError("Expected a PKCS#12 .p12 or .pfx file")
        if not a.file.is_file():
            raise ValueError("Expected a local file")
        password=getpass.getpass("Contraseña del certificado (no se guarda): ").encode()
        print(json.dumps(inspect_pkcs12(a.file.read_bytes(), password), ensure_ascii=False, indent=2))
    except (ValueError,OSError) as exc:
        p.exit(1,"Validación previa no superada: "+str(exc)+"\n")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
