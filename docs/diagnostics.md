# Diagnóstico general de la aplicación

## Objetivo

El diagnóstico permite a Jefferson comprobar desde Administración si la instalación local está funcionando correctamente.

## Áreas revisadas

### Aplicación

- Ventana principal disponible.
- Estado visible, enfocado y maximizado.
- Versión instalada identificada.
- Comunicación segura entre la interfaz y Electron.

### Perfil

- Usuario asignado.
- Identificador único del equipo.
- Canal asociado.

### Preferencias

- Nombre fácil del equipo.
- Tamaño de letra.
- Contraste alto.
- Movimiento reducido.

### Base local

- Integridad SQLite.
- Claves foráneas.
- Tablas obligatorias.
- Versión del esquema.
- Registros faltantes.

### Pantallas

- Configuración inicial.
- Pantalla principal.
- Acceso administrativo.
- Centro de control.
- Configuración visual.

Cada pantalla reporta si sus controles obligatorios existen. La prueba no modifica productos ni datos comerciales.

## Estados

- `healthy`: todas las comprobaciones aprobaron.
- `warning`: la aplicación funciona, pero existe algo por revisar.
- `error`: una o más comprobaciones esenciales fallaron.

## Historial

Cada ejecución se conserva en SQLite mediante:

- `diagnostic_runs`;
- `diagnostic_checks`;
- `screen_reports`.

Se almacena la fecha, duración, versión, cantidades de resultados y detalle de cada comprobación.

## Seguridad

- Las pantallas pueden enviar su estado técnico sin abrir Administración.
- Leer resultados completos o ejecutar el diagnóstico general requiere una sesión administrativa activa.
- Los reportes se validan y limitan antes de guardarse.
- No se incluyen contraseñas ni datos sensibles en los detalles.
