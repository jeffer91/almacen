# Almacén Familiar

Aplicación de escritorio local-first para compartir productos, costos y precios entre:

- Edgar — Local físico.
- Gloria — Local físico.
- Jefferson — Tienda virtual y administración.

## Estado actual

Etapa 1 en verificación final. Versión actual: `0.8.0`.

Ya está implementado:

- Proyecto base con Electron.
- Ventana principal con aislamiento de contexto y sin acceso directo a Node.js desde la interfaz.
- Selección inicial de Edgar, Gloria o Jefferson.
- Perfil fijo guardado localmente por computadora.
- Pantalla principal sencilla con texto grande y botones amplios.
- Botón superior de Administración.
- Creación inicial de la contraseña desde el perfil de Jefferson.
- Contraseña almacenada mediante hash `scrypt`, sin texto plano.
- Inicio y cierre de sesión administrativa.
- Cierre automático después de 15 minutos sin actividad.
- Bloqueo temporal después de cinco intentos incorrectos.
- Centro de control administrativo inicial.
- Base local SQLite creada automáticamente.
- Migraciones versionadas y protegidas mediante checksum SHA-256.
- Usuarios y canales iniciales insertados automáticamente.
- Registro local del equipo y del perfil asignado.
- Configuraciones persistentes por dispositivo.
- Tablas iniciales de auditoría, salud y cola de sincronización.
- Diagnóstico administrativo de integridad, claves foráneas, tablas y tamaño.
- Nombre fácil para cada computadora.
- Tamaños de letra normal, grande y muy grande.
- Botón rápido para cambiar la letra sin entrar a Administración.
- Contraste alto y movimiento reducido.
- Apertura maximizada configurable.
- Valores visuales recomendados automáticamente para Edgar y Gloria.
- Diagnóstico general de aplicación, perfil, preferencias, base y pantallas.
- Reporte automático de controles obligatorios de cada pantalla.
- Historial local de diagnósticos con resultados y duración.
- Arranque coordinado antes de mostrar la ventana.
- Detección de primera ejecución, perfil válido y perfil dañado.
- Recuperación de configuraciones dañadas mediante respaldo local.
- Verificación de escritura después de guardar un perfil.
- Bloqueo de cambios de usuario fuera de Administración.
- Respaldos automáticos diarios de SQLite.
- Creación manual de respaldos desde Administración.
- Verificación de integridad, claves foráneas, esquema y checksum SHA-256.
- Retención de 10 respaldos automáticos y 20 manuales.
- Listado y apertura de la carpeta local de respaldos.
- Configuración de instalador NSIS para Windows x64.
- Compilación automatizada del instalador mediante GitHub Actions.
- Verificación del contenido de `app.asar`.
- Instalación silenciosa de prueba en Windows.
- Generación de hash SHA-256 y reporte JSON del instalador.
- Publicación del instalador verificado como artefacto de GitHub durante 30 días.
- Pruebas automáticas en Linux y Windows.
- Pruebas para contraseña, sesión, migraciones, persistencia, preferencias, diagnósticos, arranque, perfiles y respaldos.

## Regla temporal de configuración administrativa

Mientras todavía no exista sincronización entre dispositivos, la contraseña inicial solo puede crearse en la computadora configurada con el perfil de Jefferson.

Cuando se implemente la sincronización segura, las computadoras de Edgar y Gloria podrán recibir la credencial administrativa protegida para que Jefferson ingrese desde esos equipos sin permitir que otros usuarios creen una contraseña nueva.

## Ejecutar en desarrollo

Requisitos:

- Node.js 22.16 o superior.
- npm disponible.

Comandos:

```bash
npm install
npm start
```

## Ejecutar pruebas

```bash
npm test
```

## Generar y verificar el instalador de Windows

En Windows:

```powershell
npm install
npm run release:win
```

También puede ejecutarse por partes:

```powershell
npm run build:win
npm run verify:win
```

Los resultados se generan dentro de `dist`:

```text
Almacen-Familiar-Setup-<version>-x64.exe
installer-verification.json
asar-files.txt
```

## Estructura actual

```text
.github/
└── workflows/
    ├── tests.yml
    └── windows-installer.yml

app/
├── main/
│   ├── main.js
│   ├── profile-store.js
│   ├── admin-auth-store.js
│   ├── admin-session.js
│   ├── device-preferences.js
│   ├── startup/
│   │   └── startup-service.js
│   ├── diagnostics/
│   │   └── diagnostics-service.js
│   ├── backups/
│   │   └── backup-service.js
│   └── database/
│       ├── connection.js
│       ├── migrations.js
│       ├── migration-runner.js
│       └── local-database-service.js
├── preload/
│   └── preload.js
└── renderer/
    ├── index.html
    ├── app.js
    ├── preferences.js
    ├── diagnostics.js
    ├── backups.js
    └── styles/
        ├── global.css
        ├── easy-mode.css
        ├── admin.css
        ├── preferences.css
        ├── diagnostics.css
        └── backups.css

build/
└── README.md

scripts/
└── verify-windows-build.ps1

tests/
├── admin-auth.test.js
├── local-database.test.js
├── device-preferences.test.js
├── diagnostics.test.js
├── startup-profile.test.js
└── backups.test.js

docs/
├── database.md
├── device-preferences.md
├── diagnostics.md
├── startup-and-profiles.md
├── backups.md
└── windows-installer.md
```

## Base local actual

Tablas creadas:

- `schema_migrations`;
- `users`;
- `channels`;
- `devices`;
- `device_settings`;
- `audit_events`;
- `sync_queue`;
- `system_health`;
- `diagnostic_runs`;
- `diagnostic_checks`;
- `screen_reports`.

## Consideraciones del primer instalador

- Todavía no se utiliza un certificado de firma de código.
- Windows puede mostrar una advertencia de editor desconocido.
- El primer instalador utiliza el icono predeterminado de Electron.
- La firma y el icono institucional se incorporarán antes de una distribución pública definitiva.

## Documentación técnica

- `docs/database.md`;
- `docs/device-preferences.md`;
- `docs/diagnostics.md`;
- `docs/startup-and-profiles.md`;
- `docs/backups.md`;
- `docs/windows-installer.md`.

## Próxima etapa

La siguiente etapa inicia el catálogo comercial:

1. Productos.
2. Variaciones.
3. Fotografías locales y sincronizables.
4. Estados activos, inactivos y retirados.
5. Historial no destructivo.
