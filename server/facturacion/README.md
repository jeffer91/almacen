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


## Panel de gestión y certificado Security Data

La sección **Facturas > Firma electrónica** muestra el estado registrado por el futuro servicio privado. Los controles de carga están deshabilitados de forma intencional: no hay un receptor de certificados en producción. No se deben habilitar mediante JavaScript ni aceptar la clave privada en una función que dependa únicamente del PIN comercial.

Para habilitar el servicio se requiere una identidad administrativa fuerte (por ejemplo, MFA), HTTPS, almacenamiento cifrado de secretos del servidor, control de acceso y registros sin contraseñas. El archivo PKCS#12 (.p12/.pfx) de Security Data se debe entregar directamente al servicio privado autenticado por su titular; la contraseña no debe persistir en el navegador ni en la base comercial. Verificar correspondencia entre certificado y clave, titular autorizado, vigencia, cadena de confianza y revocación antes de activar firma. Registrar únicamente metadatos públicos del certificado en edgar_private.signing_status. No habilitar emisión real hasta completar pruebas y autorización.

El historial de gestión lee borradores y documentos registrados; solo una integración tributaria verificada puede registrar autorización/anulación. No es una herramienta para simular el estado del SRI.


## Preparación de producción: estado verificable

El módulo `sri_transport.py` prepara los servicios SOAP off-line oficiales con HTTPS y tiempos de espera. La recepción RECIBIDA se mantiene como transmitida; la consulta de autorización verifica clave, dígito de control, ambiente, número de autorización, fecha y equivalencia del XML firmado devuelto. Los resultados de certificación nunca se consideran autorización fiscal productiva. La función de envío solamente admite certificación y no se ha conectado a ninguna interfaz. Las pruebas emplean respuestas simuladas. No hay un emisor productivo implementado ni desplegado.

`certificate_preflight.py` permite comprobar un PKCS#12 en un equipo privado: formato, contraseña, clave, vigencia y uso de firma. Solicita la contraseña por entrada oculta, no persiste secretos y no certifica titularidad, confianza ni revocación. Es una prevalidación, no una autorización de emisión. En el entorno privado con dependencias instaladas:
```sh
python server/facturacion/certificate_preflight.py /ruta/privada/certificado.p12
```
No copiar el certificado a este repositorio. No introducir contraseñas como argumentos de terminal ni en el chat.

La migración invoice_production_release_guard bloquea altas de documentos fiscales hasta registrar requisitos verificables. Rechaza claves de ambiente 1, secuenciales incompatibles y dígitos incorrectos. Las tablas no son modificables por el navegador. **No activar banderas manualmente para saltarse controles.** Las actualizaciones de estados deberán provenir de un servicio privado autenticado, no del resultado enviado por el cliente.

### Requisitos antes de publicar un emisor

1. Desplegar el servidor privado (no GitHub Pages), autenticación administrativa reforzada y gestión cifrada de secretos.
2. Obtener XSD oficial desde https://www.sri.gob.ec/facturacion-electronica y verificar la ficha 2.34; la copia local sigue siendo referencia provisional.
3. Confirmar titularidad, cadena de confianza, revocación y vigencia del certificado Security Data; confirmar RUC, establecimientos, permiso de emisión y requisitos del proveedor.
4. Conciliar el último secuencial utilizado en todos los sistemas y reservar el siguiente de forma atómica e idempotente. No asumir que el PDF de referencia es la última factura.
5. Implementar persistencia de XML firmado y respuesta SRI, recuperación ante interrupciones consultando la misma clave, y reenvío controlado tras corrección; jamás reservar otra clave por un timeout.
6. Completar la firma con certificado real y autorización de certificación en celcer.sri.gob.ec; verificar rechazo, recuperación y ausencia de duplicados.
7. Comparar visualmente PDF definitivo, código de barras y XML autorizado. Probar entrega al comprador y preservación de documentos.
8. Obtener aprobación del titular y activar producción desde el servicio privado. Continuar con la plataforma de facturación vigente mientras estos pasos estén incompletos.

```sh
python tests/test_sri_transport.py
python tests/test_certificate_preflight.py
python tests/validate_invoice_xsd.py
python tests/test_xades_lab.py
```
