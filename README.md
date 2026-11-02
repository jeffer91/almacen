# Almacén Familiar 2.0

Catálogo familiar sencillo para **Edgar**, **Gloria** y **Jefferson**. Aplicación web en GitHub Pages y escritorio Electron para Jefferson.

## Tres accesos web

- Edgar: https://jeffer91.github.io/almacen/edgar/
- Gloria: https://jeffer91.github.io/almacen/gloria/
- Jefferson: https://jeffer91.github.io/almacen/jefferson/

**Esas direcciones requieren que GitHub Pages esté habilitado y que Supabase esté configurado.** Cada usuario recibe su enlace privado completo con el código de acceso en el fragmento de URL. No publicar esos códigos.

## Funciones

- Buscar y crear productos desde los tres perfiles.
- Presentaciones configurables: pieza, rollo, gruesa, caja, kilo, metro, yarda y otras; cantidad y unidad.
- Una fotografía principal compartida y fotografías adicionales por color o variante.
- Un único costo vigente **común** por presentación, registrado exclusivamente por Jefferson, con historial de costos.
- Precios separados por Edgar, Gloria y Jefferson, editables por cada dueño; Jefferson puede editar todos.
- Precio heredado del último cambio registrado entre los tres si un almacén no tiene precio propio.
- El creador edita el producto y sus presentaciones; Jefferson puede editar todos.
- Proveedores administrados únicamente por Jefferson.
- Gloria ve la consulta sencilla; Edgar y Jefferson tienen acceso a más detalles.
- Supabase PostgreSQL + Storage y permisos en Edge Functions. Caché SQLite en Electron.
- Sin inventarios, ventas ni facturación en esta versión.

## Iniciar Electron

```bash
npm install
npm start
```

Para iniciar el escritorio anterior sin modificarlo:

```bash
npm run start:legacy
```

Para probar el proyecto:

```bash
npm test
```

## Conectar Supabase y publicar la aplicación

**Lee [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md)**. Incluye creación de proyecto, aplicación del esquema, despliegue de la función de servidor, generación de accesos separados, configuración de GitHub Pages y Electron.

El repositorio **no contiene secretos privados ni datos anteriores**. No se debe habilitar acceso público directo a las tablas para simular usuarios.

## Código

```text
web/                         Sitio compartido y 3 rutas de perfiles
app/main/desktop.js          Entrada nueva de Electron
app/preload/family-preload.js  Puente de caché SQLite seguro
supabase/migrations/         Modelo y restricciones de datos
supabase/functions/          API con control de permisos
.github/workflows/           Pruebas, instalador y GitHub Pages
app/main/main.js             Aplicación Electron heredada (sin borrar)
```
