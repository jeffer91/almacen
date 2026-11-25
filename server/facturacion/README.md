# Firmador privado: fase de laboratorio

Prototipo Python sin servidor HTTP ni acceso desde GitHub Pages. Basado en la sección 6 y anexo 14 de la ficha técnica SRI 2.34 (julio 2026), XAdES-BES 1.3.2, firma enveloped, UTF-8, referencia al comprobante, SignedProperties y KeyInfo. RSA-SHA1 se limita a reproducir el perfil de compatibilidad del ejemplo SRI; no se recomienda para protocolos nuevos.

El código acepta únicamente facturas sintéticas con RUC ficticio 1234567890001, razón social EMISOR DE PRUEBA, ambiente 1 y marca de prueba. Genera una identidad RSA autofirmada temporal en memoria y prueba el ciclo PKCS#12; nunca carga una firma real, escribe un certificado privado ni transmite documentos. La verificación local comprueba criptografía, referencias y alteraciones, no confianza oficial, revocación ni autorización.

Prueba local desde raíz del repositorio, con Python 3.11+ y Node.js:
```sh
python3 -m venv .venv
.venv/bin/pip install -r server/facturacion/requirements-lab.txt
.venv/bin/python tests/test_xades_lab.py
```

Próxima etapa: servicio privado autenticado que recupere borradores desde Supabase, valide configuración fiscal y XSD oficial y firme exclusivamente documentos internos. Certificado real .p12/.pfx y contraseña se configuran directamente en el almacén de secretos del servidor por el titular; nunca en GitHub, chat, localStorage, Google Sheets o JavaScript. Si el certificado es un token USB se requiere un mecanismo diferente. El PIN de cuatro dígitos por sí solo no autoriza firma fiscal. Producción permanece bloqueada hasta confirmar control de dispositivos y permisos, certificado y cadena, revocación, perfil SRI, idempotencia, emisión de prueba y autorización expresa. No se despliega un servicio ni se contrata alojamiento en esta fase.
