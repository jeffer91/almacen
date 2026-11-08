# Nicole Encajes

Catálogo y lista de precios de la familia. Un solo proyecto de Supabase sirve dos aplicaciones:

| Para quién | Qué es | Dónde |
| --- | --- | --- |
| **Edgar y Gloria** | Lista de precios (solo lectura) + fotos de productos | https://jeffer91.github.io/almacen/ |
| **Jefferson** | Administración: productos, precios, costos, proveedores y fotos | App de escritorio Electron (Windows) |

Los links viejos `/edgar/` y `/gloria/` redirigen al link nuevo. La página de administración (`web/jefferson/`) **no** se publica en internet: solo la abre Electron.

## Lista de precios familiar (web)

- Un solo link público, sin contraseña.
- Buscador que ignora tildes, mayúsculas y orden de palabras, más filtro por categoría.
- Botones de descarga en **PDF** y **Excel** (de lo que se está viendo).
- **Fotos pendientes:** muestra 3 productos sin foto a la vez; «Tomar foto» abre la cámara, la foto se reduce antes de subir y se puede anotar el color. La primera vez se pregunta quién toma la foto (Edgar o Gloria).
- No muestra costos ni proveedores y no permite crear ni editar nada.
- El precio que se muestra es el «precio Jefferson» de cada presentación (si falta, el último registrado).

## Administración (Electron)

- Crear y editar productos y presentaciones, importar Excel, fijar precios, registrar costos (con historial) y proveedores.
- Fotos: subir varias con color, elegir la principal, eliminar, ver quién la tomó y cuándo.
- Botón **📷 Fotos**: todas las fotos recientes (incluidas las de la familia) y la lista de productos sin foto.
- La primera vez pide pegar el enlace privado de Jefferson; la clave se guarda cifrada con `safeStorage` de Windows.

```bash
npm ci
npm start
```

El instalador de Windows se compila y verifica en GitHub Actions (`windows-installer.yml`).

## Seguridad

- Tablas con RLS y sin acceso directo; todo pasa por la Edge Function `catalog-api` (service_role solo en servidor).
- Sin clave: solo `catalog` (lista pública sin costos, proveedores ni rutas internas) y `uploadPhoto` (máx. 2 MB, solo JPG/PNG/WebP, productos existentes, máx. 12 fotos por producto).
- Todo lo demás exige la clave de Jefferson (hash SHA-256 en `family_access_links`). Los enlaces de Edgar y Gloria están desactivados.
- Fotos en un bucket privado; se entregan con URLs firmadas que vencen en 1 hora.

## Desarrollo

```bash
npm test
```

- `supabase/migrations/`: estructura SQL. `supabase/functions/catalog-api/`: API.
- `web/index.html` + `viewer.js` + `viewer-core.js`: lista familiar. `web/jefferson/` + `app.js`: administración.
- Flujos: `tests.yml` (pruebas), `web-deploy.yml` (Pages), `live-check.yml` (verificación real en producción), `windows-installer.yml`.

Más detalle en [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md).
