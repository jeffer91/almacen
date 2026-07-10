# Respaldos locales de SQLite

## Objetivo

Cada computadora conserva copias independientes de su base local para reducir el riesgo de pérdida de información por daños del archivo, errores del sistema o problemas durante futuras actualizaciones.

## Ubicación

Los respaldos se guardan fuera de la carpeta de instalación:

```text
<carpeta de datos de la aplicación>/backups/
```

## Tipos de respaldo

### Automático

- Se intenta crear al iniciar la aplicación.
- Solo se genera si no existe otro automático de las últimas 24 horas.
- Se conservan los 10 automáticos más recientes.

### Manual

- Jefferson puede generarlo desde Administración.
- Se crea con el botón **Crear respaldo ahora**.
- Se conservan los 20 manuales más recientes.

## Creación consistente

La aplicación utiliza `VACUUM INTO` para producir una copia SQLite consistente mientras la base principal permanece abierta.

Antes de crear la copia se solicita un checkpoint del archivo WAL.

## Verificación

Cada respaldo nuevo se verifica antes de considerarse válido:

- apertura en modo solo lectura;
- `PRAGMA quick_check`;
- revisión de claves foráneas;
- lectura de la versión del esquema;
- conteo de tablas;
- cálculo de checksum SHA-256.

Cuando una copia nueva no supera la verificación, se elimina automáticamente y se informa el error.

## Seguridad

- Crear, consultar y verificar respaldos requiere una sesión administrativa activa.
- Solo se aceptan nombres generados por la aplicación.
- Se bloquean rutas externas y nombres manipulados.
- Los respaldos no se guardan en GitHub.
- La carpeta puede abrirse desde el panel administrativo.

## Alcance actual

Este bloque permite crear, listar y verificar copias. La restauración guiada se incorporará más adelante, cuando exista suficiente información comercial para probarla sin riesgo.
