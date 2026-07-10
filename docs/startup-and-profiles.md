# Arranque y selección de perfil

## Objetivo

La aplicación debe abrir de forma predecible incluso cuando sea la primera ejecución, cuando ya exista un perfil o cuando la configuración local esté dañada.

## Flujo de arranque

Antes de mostrar la ventana, la aplicación comprueba:

1. Estado del archivo de perfil.
2. Inicialización de SQLite.
3. Migraciones pendientes.
4. Registro del equipo y canal.
5. Preferencias visuales locales.

El resultado queda disponible como un reporte de arranque con estado, pantalla de destino, advertencias y duración.

## Pantallas de destino

### Primera ejecución

Cuando no existe perfil:

- se crea la base local;
- se aplican las migraciones;
- se muestra la selección de Edgar, Gloria o Jefferson.

### Perfil válido

Cuando existe un perfil correcto:

- se conserva el identificador del equipo;
- se registra la última apertura;
- se cargan las preferencias;
- se muestra directamente la pantalla principal.

### Perfil dañado

Cuando el archivo no puede interpretarse o contiene datos inválidos:

- la aplicación abre la selección inicial;
- informa una advertencia recuperable;
- la base local continúa disponible;
- al seleccionar un nuevo perfil, el archivo dañado se conserva como respaldo `.bak`.

## Reglas de selección

- Solo se aceptan `edgar`, `gloria` y `jefferson`.
- Repetir el mismo perfil conserva `deviceId` y `configuredAt`.
- Cambiar a otra persona queda bloqueado fuera de Administración.
- Después de escribir el archivo, la aplicación vuelve a leerlo para comprobar que se guardó correctamente.
- La escritura utiliza un archivo temporal para evitar configuraciones parciales.

## Pruebas automáticas

Las pruebas cubren:

- primer arranque;
- arranque con perfil válido;
- preferencias recomendadas por perfil;
- persistencia del identificador del equipo;
- bloqueo de cambios no autorizados;
- detección y recuperación de JSON dañado;
- respaldo del archivo defectuoso;
- inicialización de SQLite durante el arranque.

GitHub Actions ejecuta las pruebas en Linux y Windows para detectar diferencias entre sistemas de archivos.
