from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def replace_once(path, old, new, label):
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'No se encontró el bloque esperado: {label} ({path})')
    file.write_text(text.replace(old, new, 1), encoding='utf-8')


def replace_all(path, old, new, label):
    file = ROOT / path
    text = file.read_text(encoding='utf-8')
    if old not in text and new not in text:
        raise RuntimeError(f'No se encontró el valor esperado: {label} ({path})')
    file.write_text(text.replace(old, new), encoding='utf-8')


sync_path = 'app/main/sync/firebase-sync-service.js'
replace_once(
    sync_path,
    '''const DEFAULT_CONFIG = Object.freeze({
  apiKey: process.env.ALMACEN_FIREBASE_API_KEY || "AIzaSyAJgkVqr7p_GKnYFTSHybvBLyFGHplE_uc",
  projectId: process.env.ALMACEN_FIREBASE_PROJECT_ID || "jeff-2f92d",
  collection: process.env.ALMACEN_FIREBASE_COLLECTION || "almacen_familiar_devices"
});''',
    '''const MAX_FIRESTORE_PHOTO_BYTES = 520 * 1024;

const DEFAULT_CONFIG = Object.freeze({
  apiKey: process.env.ALMACEN_FIREBASE_API_KEY || "AIzaSyAXO_u1O0-8NYQL6oM8GWBdcmr2_--9Dp8",
  projectId: process.env.ALMACEN_FIREBASE_PROJECT_ID || "almacen-59227",
  collection: process.env.ALMACEN_FIREBASE_COLLECTION || "almacen_familiar_devices"
});''',
    'configuración Firebase y límite de fotografía'
)
replace_all(sync_path, '760 * 1024', 'MAX_FIRESTORE_PHOTO_BYTES', 'límite de fotografía')
replace_once(
    sync_path,
    '''    this.database
      .prepare("UPDATE product_prices SET sync_status = 'synced', synchronized_at = ? WHERE sync_status = 'pending'")
      .run(timestamp);

    return { pushedRecords: Number(pending.total || 0), snapshot };''',
    '''    this.database
      .prepare("UPDATE product_prices SET sync_status = 'synced', synchronized_at = ? WHERE sync_status = 'pending'")
      .run(timestamp);
    this.database
      .prepare(
        `UPDATE sync_queue
         SET completed_at = ?, updated_at = ?, last_error = NULL
         WHERE completed_at IS NULL
           AND source_table = 'product_photos'
           AND EXISTS (
             SELECT 1
             FROM product_photos pp
             WHERE pp.id = sync_queue.record_id
               AND (pp.status <> 'active' OR pp.sync_status = 'synced')
           )`
      )
      .run(timestamp, timestamp);

    return { pushedRecords: Number(pending.total || 0), snapshot };''',
    'cierre de cola de fotografías no activas'
)
replace_once(
    sync_path,
    '''      const snapshots = await this.fetchSnapshots();
      let pulledRecords = 0;
      for (const item of snapshots) {
        pulledRecords += this.mergeSnapshot(item.payload, profile.deviceId);
      }''',
    '''      const snapshots = await this.fetchSnapshots();
      for (const item of snapshots) {
        if (item.payload?.device?.id && item.payload.device.id !== profile.deviceId) {
          this.ensureRemoteDevice(item.payload);
        }
      }
      let pulledRecords = 0;
      for (const item of snapshots) {
        pulledRecords += this.mergeSnapshot(item.payload, profile.deviceId);
      }''',
    'registro previo de dispositivos remotos'
)
replace_once(
    sync_path,
    '''module.exports = {
  DEFAULT_CONFIG,
  FirebaseSyncService
};''',
    '''module.exports = {
  DEFAULT_CONFIG,
  FirebaseSyncService,
  MAX_FIRESTORE_PHOTO_BYTES
};''',
    'exportación del límite de fotografía'
)

catalog_path = 'app/renderer/catalog.js'
replace_once(
    catalog_path,
    '''  function statusLabel(status) {
    return { active: "Activo", inactive: "Inactivo", retired: "Retirado", hidden: "Oculta" }[status] || status || "—";
  }

  function eventLabel(eventType) {''',
    '''  function statusLabel(status) {
    return { active: "Activo", inactive: "Inactivo", retired: "Retirado", hidden: "Oculta" }[status] || status || "—";
  }

  function isAdministrator() {
    return window.AlmacenShell?.getProfile?.()?.role === "administrator";
  }

  function eventLabel(eventType) {''',
    'detección del rol administrador'
)
replace_once(
    catalog_path,
    '''          return `<article class="catalog-photo-card">${visual}<p><strong>${esc(photo.fileName)}</strong></p><p class="catalog-muted">${statusLabel(photo.status)} · ${esc(photo.channelId)}</p>${photo.status !== "retired" ? `<button class="button button-secondary" type="button" data-photo-retire="${esc(photo.id)}">Retirar foto</button>` : ""}</article>`;''',
    '''          const action = photo.status === "retired"
            ? isAdministrator()
              ? `<button class="button button-secondary" type="button" data-photo-status="active" data-photo-id="${esc(photo.id)}">Restaurar foto</button>`
              : '<span class="catalog-muted">Solo Jefferson puede restaurarla.</span>'
            : `<button class="button button-secondary" type="button" data-photo-status="retired" data-photo-id="${esc(photo.id)}">Retirar foto</button>`;
          return `<article class="catalog-photo-card">${visual}<p><strong>${esc(photo.fileName)}</strong></p><p class="catalog-muted">${statusLabel(photo.status)} · ${esc(photo.channelId)}</p>${action}</article>`;''',
    'acciones de fotografía por rol'
)
replace_once(
    catalog_path,
    '''              ${variant.status !== "retired" ? `<button class="button button-secondary" type="button" data-variant-status="retired" data-variant-id="${esc(variant.id)}">Retirar</button>` : `<button class="button button-secondary" type="button" data-variant-status="active" data-variant-id="${esc(variant.id)}">Restaurar</button>`}''',
    '''              ${variant.status !== "retired"
                ? `<button class="button button-secondary" type="button" data-variant-status="retired" data-variant-id="${esc(variant.id)}">Retirar</button>`
                : isAdministrator()
                  ? `<button class="button button-secondary" type="button" data-variant-status="active" data-variant-id="${esc(variant.id)}">Restaurar</button>`
                  : '<span class="catalog-muted">Solo Jefferson puede restaurarla.</span>'}''',
    'restauración de variaciones por rol'
)
replace_once(
    catalog_path,
    '''        : '<button class="button button-primary" type="button" data-product-status="active">Restaurar</button>';''',
    '''        : isAdministrator()
          ? '<button class="button button-primary" type="button" data-product-status="active">Restaurar</button>'
          : '<span class="catalog-muted">Solo Jefferson puede restaurar este producto.</span>';''',
    'restauración de productos por rol'
)
replace_once(
    catalog_path,
    '''    elements.detail.querySelectorAll("[data-photo-retire]").forEach((button) => {
      button.addEventListener("click", () => retirePhoto(button.dataset.photoRetire));
    });''',
    '''    elements.detail.querySelectorAll("[data-photo-status]").forEach((button) => {
      button.addEventListener("click", () => changePhotoStatus(button.dataset.photoId, button.dataset.photoStatus));
    });''',
    'eventos de estado de fotografía'
)
replace_once(
    catalog_path,
    '''  async function retirePhoto(photoId) {
    if (!window.confirm("¿Retirar esta fotografía?")) return;
    try {
      const response = await window.almacen.setPhotoStatus(photoId, "retired");
      if (!response.ok) throw new Error(response.message || "No se pudo retirar la fotografía.");
      await openProduct(state.currentDetail.product.id);
    } catch (error) {
      showMessage(error.message || "No se pudo retirar la fotografía.", "error");
    }
  }''',
    '''  async function changePhotoStatus(photoId, status) {
    if (status === "retired" && !window.confirm("¿Retirar esta fotografía?")) return;
    try {
      const response = await window.almacen.setPhotoStatus(photoId, status);
      if (!response.ok) throw new Error(response.message || "No se pudo cambiar la fotografía.");
      await openProduct(state.currentDetail.product.id);
    } catch (error) {
      showMessage(error.message || "No se pudo cambiar la fotografía.", "error");
    }
  }''',
    'cambio general del estado de fotografía'
)

replace_once(
    'app/renderer/index.html',
    '''  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">''',
    '''  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' file: data:; style-src 'self'; script-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'self'">
  <meta name="color-scheme" content="light">''',
    'política de seguridad de contenido'
)

(ROOT / 'README.md').write_text('''# Almacén Familiar

Aplicación de escritorio **local-first** para compartir productos, fotografías, proveedores, costos y precios entre:

- Edgar — Local físico.
- Gloria — Local físico.
- Jefferson — Tienda virtual y administración.

## Estado actual

Versión actual: `1.0.0`. La primera versión funcional del catálogo está completa.

Funciones implementadas:

- Aplicación de escritorio con Electron y SQLite.
- Interfaz sencilla, texto grande y botones amplios para Edgar y Gloria.
- Perfiles fijos por computadora.
- Administración protegida con contraseña `scrypt`, bloqueo por intentos y cierre por inactividad.
- Catálogo con búsqueda, creación de productos y variaciones.
- Fotografías comprimidas y almacenadas localmente.
- Proveedores, historial de costos y precios por local.
- Productos recientes por computadora.
- Estados activo, inactivo y retirado sin borrado físico.
- Restauración de productos, variaciones y fotografías reservada para Jefferson.
- Historial de acciones, auditoría y cola de sincronización.
- Sincronización local-first con Firebase Firestore del proyecto `almacen-59227`.
- Respaldos automáticos y manuales de SQLite.
- Diagnósticos de base, pantallas y módulos principales.
- Instalador NSIS x64 para Windows.
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
''', encoding='utf-8')

(ROOT / 'tests/sync.test.js').write_text('''/* =========================================================
Nombre completo: sync.test.js
Ruta o ubicación: /tests/sync.test.js
Función o funciones:
- Probar la sincronización Firebase con transporte simulado.
- Confirmar que el trabajo local no depende de una conexión real.
- Verificar la configuración predeterminada y el cierre de la cola de fotografías.
Con qué se conecta:
- app/main/sync/firebase-sync-service.js
- app/main/database/local-database-service.js
========================================================= */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { LocalDatabaseService } = require("../app/main/database/local-database-service");
const { DEFAULT_CONFIG, FirebaseSyncService } = require("../app/main/sync/firebase-sync-service");

function profile() {
  return {
    id: "jefferson",
    displayName: "Jefferson",
    channelId: "tienda-virtual",
    channelName: "Tienda virtual",
    role: "administrator",
    deviceId: "device-sync-001",
    configuredAt: new Date().toISOString()
  };
}

async function withDatabase(callback) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "almacen-sync-"));
  const database = new LocalDatabaseService();
  try {
    database.initialize({ userDataPath: directory, appVersion: "1.0.0", profile: profile() });
    await callback(database, directory);
  } finally {
    database.close();
    await fs.rm(directory, { recursive: true, force: true });
  }
}

function successfulFetch(calls = []) {
  return async (url, options = {}) => {
    calls.push({ url, method: options.method || "GET" });
    if ((options.method || "GET") === "PATCH") {
      return { ok: true, status: 200, json: async () => ({}), text: async () => "" };
    }
    return { ok: true, status: 200, json: async () => ({ documents: [] }), text: async () => "" };
  };
}

test("usa el proyecto Firebase correcto como configuración predeterminada", () => {
  assert.equal(DEFAULT_CONFIG.projectId, "almacen-59227");
  assert.equal(DEFAULT_CONFIG.collection, "almacen_familiar_devices");
  assert.equal(DEFAULT_CONFIG.apiKey, "AIzaSyAXO_u1O0-8NYQL6oM8GWBdcmr2_--9Dp8");
});

test("publica y consulta instantáneas con un transporte simulado", async () => {
  await withDatabase(async (database, directory) => {
    const calls = [];
    const sync = new FirebaseSyncService({
      databaseService: database,
      userDataPath: directory,
      fetchImpl: successfulFetch(calls),
      config: { apiKey: "test", projectId: "project-test", collection: "devices" }
    });

    const result = await sync.syncNow(profile(), "1.0.0");
    assert.equal(result.ok, true);
    assert.equal(result.status.status, "ready");
    assert.equal(calls.some((call) => call.method === "PATCH"), true);
    assert.equal(calls.some((call) => call.method === "GET"), true);
  });
});

test("completa la cola de una fotografía retirada después de publicar metadatos", async () => {
  await withDatabase(async (database, directory) => {
    const productId = "product-photo-sync";
    const photoId = "photo-retired-sync";
    const timestamp = new Date().toISOString();
    database.database.prepare(`INSERT INTO products (
      id, canonical_name, normalized_name, brand, category, description, notes, status, version,
      created_by_user_id, created_device_id, created_at, updated_by_user_id, updated_device_id, updated_at,
      retired_by_user_id, retired_device_id, retired_at, retirement_reason,
      restored_by_user_id, restored_device_id, restored_at
    ) VALUES (?, 'Producto foto', 'producto foto', NULL, NULL, NULL, NULL, 'active', 1,
      'jefferson', ?, ?, 'jefferson', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`).run(
      productId, profile().deviceId, timestamp, profile().deviceId, timestamp
    );
    database.database.prepare(`INSERT INTO product_photos (
      id, product_id, variant_id, owner_user_id, channel_id, device_id, local_path, file_name,
      mime_type, file_size_bytes, width_pixels, height_pixels, checksum_sha256,
      is_default_global, is_default_channel, status, sync_status, sync_error, replaces_photo_id,
      created_at, updated_at, hidden_at, retired_at
    ) VALUES (?, ?, NULL, 'jefferson', 'tienda-virtual', ?, NULL, 'retirada.jpg',
      'image/jpeg', 100, NULL, NULL, NULL, 0, 0, 'retired', 'metadata_pending', NULL, NULL,
      ?, ?, NULL, ?)`).run(photoId, productId, profile().deviceId, timestamp, timestamp, timestamp);
    database.database.prepare(`INSERT INTO sync_queue (
      id, source_table, record_id, operation, target, payload_json, priority, attempts,
      next_attempt_at, last_error, created_at, updated_at, completed_at
    ) VALUES ('queue-retired-photo', 'product_photos', ?, 'archive', 'primary', '{}', 80, 0,
      NULL, NULL, ?, ?, NULL)`).run(photoId, timestamp, timestamp);

    const sync = new FirebaseSyncService({
      databaseService: database,
      userDataPath: directory,
      fetchImpl: successfulFetch(),
      config: { apiKey: "test", projectId: "project-test", collection: "devices" }
    });
    await sync.pushSnapshot(profile(), "1.0.0");

    const queue = database.database
      .prepare("SELECT completed_at, last_error FROM sync_queue WHERE id = 'queue-retired-photo'")
      .get();
    assert.ok(queue.completed_at);
    assert.equal(queue.last_error, null);
  });
});
''', encoding='utf-8')

print('Correcciones de auditoría aplicadas correctamente.')
