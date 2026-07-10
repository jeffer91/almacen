# Base local SQLite

## Objetivo

Cada computadora conserva una base local propia para que Edgar, Gloria y Jefferson puedan trabajar aunque no tengan internet. La sincronización externa se agregará después y utilizará la base local como origen de los cambios pendientes.

## Archivo local

La aplicación crea automáticamente:

```text
<carpeta de datos de la aplicación>/data/almacen-familiar.sqlite3
```

El archivo no se guarda dentro del repositorio ni dentro de la carpeta de instalación.

## Configuración de la conexión

- Claves foráneas activadas.
- Modo de diario WAL.
- Espera de hasta cinco segundos ante bloqueos temporales.
- Extensiones externas desactivadas.
- Cadenas SQL con comillas dobles desactivadas.
- Esquema confiable desactivado.

## Migraciones

La tabla `schema_migrations` registra:

- versión;
- nombre;
- hash SHA-256 del contenido;
- fecha de aplicación.

Una migración aplicada no puede modificarse silenciosamente. Si cambia su nombre o contenido, la aplicación detiene la actualización y genera un error de integridad del esquema.

La versión actual del esquema es la **4**.

## Tablas actuales

### `users`

Usuarios iniciales:

- Edgar;
- Gloria;
- Jefferson.

### `channels`

Canales iniciales:

- Local de Edgar;
- Local de Gloria;
- Tienda virtual.

### `devices`

Registra cada instalación, el nombre del equipo, sistema operativo, versión, usuario asignado, canal y última comprobación.

### `device_settings`

Configuraciones locales por equipo, como tamaño del texto o futuras preferencias de sincronización.

### `audit_events`

Historial técnico de acciones relevantes. Registra asignaciones de perfil y operaciones del catálogo.

### `sync_queue`

Cola preparada para la futura sincronización progresiva con bases externas.

### `system_health`

Conserva el resultado de la última prueba de integridad local.

### `diagnostic_runs`

Conserva cada ejecución del diagnóstico general, su estado, duración, versión y cantidades de resultados.

### `diagnostic_checks`

Guarda las comprobaciones individuales de aplicación, perfil, preferencias, base y pantallas.

### `screen_reports`

Mantiene el último reporte técnico enviado por cada pantalla de la interfaz.

### `products`

Catálogo principal con nombre, marca, categoría, descripción, estado, versión y responsables de cada cambio.

### `product_variants`

Presentaciones o variaciones exactas de cada producto, con unidad, cantidad y código interno opcional.

### `product_photos`

Metadatos de fotografías locales por usuario, canal y equipo. Incluye checksum, fotografía principal y etapa de sincronización progresiva.

### `product_links`

Relaciones administrativas entre productos reemplazados, duplicados o destinados a una futura fusión.

### `catalog_events`

Historial no destructivo de creación, retiro, restauración, fotografías y relaciones del catálogo.

## Diagnóstico administrativo

El botón **Probar base local** comprueba:

- apertura y lectura;
- escritura del estado de salud;
- `PRAGMA quick_check`;
- errores de claves foráneas;
- presencia de todas las tablas obligatorias;
- versión del esquema;
- modo de diario;
- tamaño del archivo;
- cantidades básicas de registros, incluidos productos, variaciones, fotografías y eventos.

El botón **Ejecutar diagnóstico general** también revisa:

- ventana principal;
- versión instalada;
- perfil y canal del equipo;
- preferencias visuales;
- comunicación segura;
- controles obligatorios de cada pantalla.

Los diagnósticos completos solo pueden consultarse o ejecutarse durante una sesión administrativa activa.

## Eliminación y recuperación

El catálogo no expone operaciones de borrado físico.

Los productos y variaciones utilizan los estados:

- `active`;
- `inactive`;
- `retired`.

Las fotografías utilizan:

- `active`;
- `hidden`;
- `retired`.

Cada retiro queda registrado en `catalog_events`, `audit_events` y `sync_queue`. La restauración de elementos retirados está reservada para Jefferson.
