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

Historial técnico de acciones relevantes. Actualmente registra la asignación o cambio de perfil del equipo.

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
- cantidades básicas de registros.

El botón **Ejecutar diagnóstico general** también revisa:

- ventana principal;
- versión instalada;
- perfil y canal del equipo;
- preferencias visuales;
- comunicación segura;
- controles obligatorios de cada pantalla.

Los diagnósticos completos solo pueden consultarse o ejecutarse durante una sesión administrativa activa.

## Eliminación y recuperación

Las tablas de productos se agregarán en la siguiente etapa. Desde el principio se mantendrá la regla de eliminación lógica: los registros se archivarán y conservarán en el historial en lugar de borrarse físicamente.
