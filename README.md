# Almacén Familiar

Aplicación de escritorio local-first para compartir productos, costos y precios entre:

- Edgar — Local físico.
- Gloria — Local físico.
- Jefferson — Tienda virtual y administración.

## Estado actual

Etapa 1 en desarrollo. Versión actual: `0.2.0`.

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
- Pruebas automáticas para contraseña y sesión.

## Regla temporal de configuración administrativa

Mientras todavía no exista sincronización entre dispositivos, la contraseña inicial solo puede crearse en la computadora configurada con el perfil de Jefferson.

Cuando se implemente la sincronización segura, las computadoras de Edgar y Gloria podrán recibir la credencial administrativa protegida para que Jefferson ingrese desde esos equipos sin permitir que otros usuarios creen una contraseña nueva.

## Ejecutar en desarrollo

Requisitos:

- Node.js instalado.
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
│   └── admin-session.js
├── preload/
│   └── preload.js
└── renderer/
    ├── index.html
    ├── app.js
    └── styles/
        ├── global.css
        ├── easy-mode.css
        └── admin.css

tests/
└── admin-auth.test.js
```

## Próximos pasos de la etapa 1

1. Base local SQLite.
2. Migraciones y creación automática del esquema.
3. Configuración completa del dispositivo.
4. Diagnóstico inicial de aplicación y base local.
5. Pruebas del arranque y selección de perfil.
6. Primer instalador verificable para Windows.
