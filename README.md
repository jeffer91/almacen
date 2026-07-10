# Almacén Familiar

Aplicación de escritorio local-first para compartir productos, costos y precios entre:

- Edgar — Local físico.
- Gloria — Local físico.
- Jefferson — Tienda virtual y administración.

## Estado actual

Etapa 1 en desarrollo. Versión actual: `0.4.0`.

Ya está implementado:

- Proyecto base con Electron.
- Configuración para generar instalador de Windows.
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
- Pruebas automáticas para contraseña, sesión, migraciones, persistencia y preferencias.

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

## Generar instalador de Windows

```bash
npm install
npm run build:win
```

El instalador se generará dentro de la carpeta `dist`.

## Estructura actual

```text
app/
├── main/
│   ├── main.js
│   ├── profile-store.js
│   ├── admin-auth-store.js
│   ├── admin-session.js
│   ├── device-preferences.js
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
    └── styles/
        ├── global.css
        ├── easy-mode.css
        ├── admin.css
        └── preferences.css

tests/
├── admin-auth.test.js
├── local-database.test.js
└── device-preferences.test.js

docs/
├── database.md
└── device-preferences.md
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
- `system_health`.

La documentación técnica se encuentra en:

- `docs/database.md`;
- `docs/device-preferences.md`.

## Próximos bloques de la etapa 1

1. Diagnóstico general de aplicación y pantallas.
2. Pruebas del arranque y selección de perfil.
3. Respaldos básicos de la base local.
4. Compilación y verificación del primer instalador de Windows.
