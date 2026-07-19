# Almacén Familiar

Aplicación de escritorio **local-first** para compartir productos, fotografías, proveedores, costos y precios entre:

- Edgar — Local físico.
- Gloria — Local físico.
- Jefferson — Tienda virtual y administración.

## Estado actual

Versión actual: `1.1.0`. La primera versión funcional del catálogo está completa.

Funciones implementadas:

- Aplicación de escritorio con Electron y SQLite.
- Interfaz sencilla, texto grande y botones amplios para Edgar y Gloria.
- Perfiles fijos por computadora.
- Administración protegida con contraseña `scrypt`, bloqueo por intentos y cierre por inactividad.
- Catálogo con búsqueda, creación de productos y variaciones.
- Fotografías comprimidas y almacenadas localmente.
- Proveedores, historial de costos y precios por local.
- Productos recientes por computadora.
- Estados activo y retirado sin borrado físico.
- Restauración de productos, variaciones y fotografías reservada para Jefferson.
- Historial de acciones, auditoría y cola de sincronización.
- Sincronización local-first con Firebase Firestore del proyecto `almacen-59227`.
- Respaldos automáticos y manuales de SQLite.
- Diagnósticos de base, pantallas y módulos principales.
- Instalador NSIS x64 para Windows.
- Aplicación móvil instalable (PWA) con trabajo local y sincronización Firebase.
- Pruebas automáticas en Windows y Ubuntu.

## Prioridad de almacenamiento

1. SQLite local es la base principal y permite trabajar sin internet.
2. Firebase comparte los cambios entre las tres computadoras.
3. Los respaldos locales protegen la base de cada equipo.

Los datos de la aplicación se guardan en la carpeta `userData` de Electron, no dentro de la carpeta de instalación.

## Requisitos de desarrollo

- Node.js 22.16 o superior.
- npm.

## Ejecutar en desarrollo

```bash
npm install
npm start
```

### Cambiar de perfil durante las pruebas

```bash
npm run start:test-profile
```

Este comando muestra **Cambiar perfil (pruebas)** y permite alternar entre Edgar, Gloria y Jefferson sin borrar la base. El cambio queda deshabilitado automáticamente al abrir con `npm start` o desde el instalador normal.

La contraseña administrativa se mantiene local en cada instalación. Por seguridad, ni la contraseña ni su hash se sincronizan con Firebase.

## Ejecutar pruebas

```bash
npm test
```

## Generar y verificar el instalador de Windows

```powershell
npm install
npm run release:win
```

Los archivos se generan en `dist`:

```text
Almacen-Familiar-Setup-<version>-x64.exe
installer-verification.json
asar-files.txt
```

## Estructura principal

```text
.github/workflows/
├── tests.yml
└── windows-installer.yml

app/
├── main/
│   ├── main.js
│   ├── profile-store.js
│   ├── admin-auth-store.js
│   ├── admin-session.js
│   ├── device-preferences.js
│   ├── backups/backup-service.js
│   ├── catalog/
│   │   ├── catalog-service.js
│   │   ├── commerce-service.js
│   │   └── photo-storage-service.js
│   ├── database/
│   │   ├── connection.js
│   │   ├── migrations.js
│   │   ├── migration-runner.js
│   │   └── local-database-service.js
│   ├── diagnostics/diagnostics-service.js
│   ├── startup/startup-service.js
│   └── sync/firebase-sync-service.js
├── preload/preload.js
└── renderer/
    ├── index.html
    ├── app.js
    ├── catalog.js
    ├── diagnostics.js
    ├── backups.js
    ├── preferences.js
    └── styles/

tests/
├── admin-auth.test.js
├── backups.test.js
├── catalog.test.js
├── commerce.test.js
├── device-preferences.test.js
├── diagnostics.test.js
├── local-database.test.js
├── startup-profile.test.js
└── sync.test.js
```

## Tablas SQLite

- `schema_migrations`
- `users`
- `channels`
- `devices`
- `device_settings`
- `audit_events`
- `sync_queue`
- `system_health`
- `diagnostic_runs`
- `diagnostic_checks`
- `screen_reports`
- `products`
- `product_variants`
- `product_photos`
- `product_links`
- `catalog_events`
- `suppliers`
- `product_costs`
- `product_prices`
- `recent_product_activity`
- `sync_state`

## Firebase

La configuración predeterminada corresponde a:

- Proyecto: `almacen-59227`.
- Colección de equipos: `almacen_familiar_devices`.
- Colección de fotografías: `almacen_familiar_devices_photos`.

La configuración puede reemplazarse mediante estas variables de entorno:

- `ALMACEN_FIREBASE_API_KEY`
- `ALMACEN_FIREBASE_PROJECT_ID`
- `ALMACEN_FIREBASE_COLLECTION`

Las reglas de Firestore deben permitir las operaciones necesarias de la aplicación. No se deben guardar datos sensibles mientras las reglas sean públicas.

## Instalador

El instalador actual no está firmado digitalmente, por lo que Windows puede mostrar una advertencia de editor desconocido. La información local no se elimina al desinstalar (`deleteAppDataOnUninstall: false`).
