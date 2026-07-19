# Almacén Familiar

Aplicación **local-first** para compartir productos, fotografías, proveedores, costos y precios entre:

- Edgar — Local físico.
- Gloria — Local físico.
- Jefferson — Tienda virtual y administración.

El proyecto tiene dos formas de uso:

1. **Aplicación de Windows:** instalador `.exe` construido con Electron, SQLite y NSIS.
2. **Aplicación web instalable:** PWA responsive ubicada en `web/`, lista para publicarse en una página HTTPS y añadirse al escritorio o a la pantalla de inicio.

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
- Aplicación web instalable con funcionamiento offline y sincronización Firebase.
- Pruebas automáticas en Windows y Ubuntu.

## Prioridad de almacenamiento

### Windows

1. SQLite local es la base principal y permite trabajar sin internet.
2. Firebase comparte los cambios entre los dispositivos.
3. Los respaldos locales protegen la base de cada equipo.

Los datos se guardan en la carpeta `userData` de Electron, no dentro de la carpeta de instalación.

### Web y PWA

1. Los cambios se guardan primero en el almacenamiento local del navegador.
2. La sincronización envía y recibe instantáneas mediante Firebase.
3. La PWA puede abrirse sin conexión después de su primera carga.

## Requisitos de desarrollo

- Node.js 22.16 o superior.
- npm.

## Ejecutar la aplicación de Windows en desarrollo

```bash
npm install
npm start
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

Este comando ejecuta la suite funcional y valida la sintaxis de la aplicación web.

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

El flujo `.github/workflows/windows-installer.yml` también compila, instala silenciosamente, verifica y publica el instalador como artefacto de GitHub Actions.

## Publicar la aplicación web

La carpeta que debe publicarse es:

```text
web/
```

Todos los recursos usan rutas relativas, por lo que puede alojarse en GitHub Pages, Firebase Hosting u otro servicio de archivos estáticos con HTTPS.

### GitHub Pages

El flujo `.github/workflows/web-deploy.yml` publica automáticamente `web/` cuando se integran cambios en `main`. GitHub Pages debe estar configurado para usar **GitHub Actions** como fuente.

### Firebase Hosting

El repositorio incluye `firebase.json` y `.firebaserc`.

```bash
npm install -g firebase-tools
firebase login
firebase deploy --only hosting
```

La aplicación se podrá instalar desde Chrome, Edge, Android o Safari mediante la opción **Instalar aplicación** o **Añadir a pantalla de inicio**.

## Estructura principal

```text
.github/workflows/
├── tests.yml
├── web-deploy.yml
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

web/
├── index.html
├── app.js
├── styles.css
├── service-worker.js
├── manifest.webmanifest
└── icon.svg

tests/
```

## Firebase

Configuración predeterminada:

- Proyecto: `almacen-59227`.
- Colección de equipos: `almacen_familiar_devices`.
- Colección de fotografías: `almacen_familiar_devices_photos`.

La configuración de escritorio puede reemplazarse mediante:

- `ALMACEN_FIREBASE_API_KEY`
- `ALMACEN_FIREBASE_PROJECT_ID`
- `ALMACEN_FIREBASE_COLLECTION`

**Importante:** la API key de Firebase identifica el proyecto, pero no protege los datos. Antes de publicar la página para acceso público se deben revisar las reglas de Firestore. No se deben guardar datos sensibles mientras las reglas permitan lectura o escritura pública.

## Instalador

El instalador actual no está firmado digitalmente, por lo que Windows puede mostrar una advertencia de editor desconocido. La información local no se elimina al desinstalar (`deleteAppDataOnUninstall: false`).
