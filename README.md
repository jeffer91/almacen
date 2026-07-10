# Almacén Familiar

Aplicación de escritorio local-first para compartir productos, costos y precios entre:

- Edgar — Local físico.
- Gloria — Local físico.
- Jefferson — Tienda virtual y administración.

## Estado actual

Etapa 1 iniciada.

Ya está implementado:

- Proyecto base con Electron.
- Configuración para generar instalador de Windows.
- Ventana principal con aislamiento de contexto y sin acceso directo a Node.js desde la interfaz.
- Selección inicial de Edgar, Gloria o Jefferson.
- Perfil fijo guardado localmente por computadora.
- Pantalla principal sencilla con texto grande y botones amplios.
- Estructura preparada para agregar acceso administrativo, base local y sincronización.

## Ejecutar en desarrollo

Requisitos:

- Node.js instalado.
- npm disponible.

Comandos:

```bash
npm install
npm start
```

## Generar instalador de Windows

```bash
npm install
npm run build:win
```

El instalador se generará dentro de la carpeta `dist`.

## Estructura inicial

```text
app/
├── main/
│   ├── main.js
│   └── profile-store.js
├── preload/
│   └── preload.js
└── renderer/
    ├── index.html
    ├── app.js
    └── styles/
        ├── global.css
        └── easy-mode.css
```

## Próximos pasos de la etapa 1

1. Acceso administrativo protegido con contraseña.
2. Base local SQLite y migraciones.
3. Configuración persistente del dispositivo.
4. Diagnóstico inicial de aplicación y base local.
5. Pruebas automatizadas del arranque y selección de perfil.
6. Primer instalador verificable para Windows.
