# Almacén Familiar

Aplicación de escritorio **local-first para Windows** destinada a compartir productos, fotografías, proveedores, costos y precios entre:

- Edgar — Local físico.
- Gloria — Local físico.
- Jefferson — Tienda virtual y administración.

La aplicación se distribuye únicamente como programa de Windows mediante Electron, SQLite y un instalador NSIS.

## Estado actual

Versión actual: `1.1.0`.

Funciones implementadas:

- Aplicación de escritorio con Electron y SQLite.
- Interfaz sencilla, texto grande y botones amplios para Edgar y Gloria.
- Perfiles por dispositivo.
- Administración protegida con contraseña `scrypt`, bloqueo por intentos y cierre por inactividad.
- Catálogo con búsqueda, creación de productos y variaciones.
- Proveedor, costo y PVP con IVA dentro del registro completo del producto.
- Cálculo y almacenamiento automático del precio sin IVA.
- Fotografías comprimidas y almacenadas localmente.
- Historial de costos y precios por local.
- Productos recientes por dispositivo.
- Estados activo y retirado sin borrado físico.
- Restauración de productos, variaciones y fotografías reservada para Jefferson.
- Historial de acciones, auditoría y cola de sincronización.
- Sincronización local-first con Firebase Firestore del proyecto `almacen-59227`.
- Respaldos automáticos y manuales de SQLite.
- Diagnósticos de base, pantallas y módulos principales.
- Instalador NSIS x64 para Windows.
- Pruebas automáticas en Windows y Ubuntu.

## Arquitectura de almacenamiento

1. **SQLite local** es la base principal y permite trabajar sin internet.
2. **Firebase Firestore** comparte los cambios entre los dispositivos.
3. **Respaldos locales** protegen la base de cada equipo.

Los datos se guardan en la carpeta `userData` de Electron, no dentro de la carpeta de instalación.

Firebase se utiliza para sincronización de datos entre instalaciones; no se utiliza Firebase Hosting ni existe una versión web/PWA de la aplicación.

## Requisitos de desarrollo

- Node.js 22.16 o superior.
- npm.

## Ejecutar la aplicación en desarrollo

```bash
npm install
npm start
```

Para iniciar sin permitir el cambio de perfil:

```bash
npm run start:locked
```

Para cambiar de perfil durante pruebas:

```bash
npm run start:test-profile
```

La contraseña administrativa se mantiene local en cada instalación. Ni la contraseña ni su hash se sincronizan con Firebase.

## Ejecutar pruebas

```bash
npm run release:check
```

Este comando ejecuta la suite funcional de la aplicación de escritorio.

## Generar y verificar el instalador de Windows

En Windows PowerShell:

```powershell
npm ci
npm run release:win
```

Los archivos se generan en `dist`:

```text
Almacen-Familiar-Setup-<version>-x64.exe
installer-verification.json
asar-files.txt
```

El flujo `.github/workflows/windows-installer.yml` compila, instala silenciosamente, verifica y publica el instalador como artefacto de GitHub Actions.

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
│   ├── catalog/
│   │   ├── catalog-service.js
│   │   ├── commerce-service.js
│   │   ├── product-entry-service.js
│   │   └── photo-storage-service.js
│   ├── database/
│   ├── diagnostics/
│   ├── startup/
│   └── sync/
├── preload/preload.js
└── renderer/

build/
docs/
scripts/
tests/
```

## Firebase

Configuración predeterminada de sincronización:

- Proyecto: `almacen-59227`.
- Colección de equipos: `almacen_familiar_devices`.
- Colección de fotografías: `almacen_familiar_devices_photos`.

La configuración de escritorio puede reemplazarse mediante:

- `ALMACEN_FIREBASE_API_KEY`
- `ALMACEN_FIREBASE_PROJECT_ID`
- `ALMACEN_FIREBASE_COLLECTION`

**Importante:** la API key de Firebase identifica el proyecto, pero no protege los datos. La protección depende de las reglas de Firestore. No se deben guardar datos sensibles mientras las reglas permitan lectura o escritura pública.

## Instalador

El instalador actual no está firmado digitalmente, por lo que Windows puede mostrar una advertencia de editor desconocido. La información local no se elimina al desinstalar (`deleteAppDataOnUninstall: false`).
