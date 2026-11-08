# Nicole Encajes

Catálogo compartido para **Edgar**, **Gloria** y **Jefferson**. Un solo proyecto de Supabase sirve la web (GitHub Pages) y el escritorio (Electron).

## Accesos

| Perfil | Enlace web |
| --- | --- |
| Edgar | https://jeffer91.github.io/almacen/edgar/ |
| Gloria | https://jeffer91.github.io/almacen/gloria/ |
| Jefferson | https://jeffer91.github.io/almacen/jefferson/ |

**Lista de precios familiar:** https://jeffer91.github.io/almacen/ es un solo link público para Edgar y Gloria: ver precios, buscar, descargar PDF/Excel y tomar fotos de productos pendientes. No pueden crear ni editar productos ni precios. La gestión (productos, precios, costos, proveedores) se hace solo desde la app Electron de Jefferson, que usa su clave privada cifrada en el equipo.

Al abrirlo por primera vez, la aplicación guarda el acceso en el dispositivo y permite ingresar las siguientes veces sin contraseña. Si llega a terceros, revocar/regenerar el enlace en Supabase.

## Catálogo y permisos

- Los tres pueden consultar, crear productos y agregar fotos.
- Productos con nombre, marca/categoría opcionales y múltiples presentaciones configurables: pieza, rollo, gruesa, caja, kilo, metro, yarda, docena y unidad personalizada.
- Cada presentación tiene una cantidad, su unidad, un costo **compartido** y tres precios de venta por almacén.
- Los tres pueden configurar **su propio precio**; Jefferson administra cualquiera. Si no existe precio propio, se hereda el **último precio actualizado** por otro almacén.
- Jefferson registra proveedores y nuevos costos. El historial conserva fecha, costo y proveedor de cada registro. Edgar y Jefferson pueden desplegar el historial; Gloria ve el costo vigente en una vista simplificada.
- Cada creador modifica sus productos y sus presentaciones. Jefferson puede modificar todos. Los demás no pueden editar productos ajenos.
- Fotos compartidas, una principal, varias por color y compresión previa a la carga.
- Los productos recién creados pueden mostrar «Precio pendiente».
- Sin inventarios, ventas ni facturación en esta primera versión.

## Arquitectura desplegada

- **Supabase:** proyecto `Nicole Encajes`, ref `oppaviqjlyrnkpxjsfvo`, PostgreSQL 17, Storage privado y Edge Function `catalog-api`.
- **Seguridad:** tres secretos independientes por enlace; autenticación de la función comprobando hashes; permisos validados en servidor; RLS con acceso directo denegado en las ocho tablas.
- **Web:** `web/` publicado por GitHub Pages y verificado mediante `.github/workflows/live-check.yml`.
- **Electron:** vista Jefferson y caché SQLite de consulta. Se guardan las credenciales del escritorio usando `safeStorage` cuando está disponible.
- **Offline:** consulta de los datos guardados; la edición y subida de fotos requieren conexión a Supabase.
- **Sistema anterior:** conservado. Iniciar con `npm run start:legacy` si fuese necesario.

No hay datos anteriores que migrar.

## Uso de Electron

```bash
npm ci
npm start
```

Al abrir por primera vez, pega el enlace privado de Jefferson. El acceso se conserva localmente.

El instalador para Windows se construye y verifica automáticamente en <https://github.com/jeffer91/almacen/actions/workflows/windows-installer.yml>. El archivo se llama `Nicole-Encajes-Setup-2.1.0-x64.exe` (el nombre exacto depende de la versión publicada).

## Desarrollo y comprobación

```bash
npm test
node --check web/app.js
node --check app/main/desktop.js
```

Flujos de GitHub Actions:

- `tests.yml`: pruebas Linux y Windows.
- `web-deploy.yml`: publicación GitHub Pages.
- `live-check.yml`: prueba real de las tres páginas, configuración e inexistencia de acceso anónimo a la API.
- `windows-installer.yml`: compilación, verificación de NSIS y artefacto descargable.

La estructura SQL está en `supabase/migrations/`; la función de servidor en `supabase/functions/catalog-api/`. El endpoint es **público**, pero no acepta datos sin un enlace válido. Las claves administrativas de Supabase no deben aparecer en frontend ni en repositorio.

## Referencia

Consulta [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md) para administración, revocación de claves y recuperación. Las pruebas de publicación confirman la disponibilidad, pero no reemplazan la validación funcional de una carga real de producto y fotografía por cada perfil.
