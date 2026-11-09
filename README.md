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

Entra con **PIN** (se pide una vez por computadora; 5 intentos fallidos bloquean 15 minutos). Pestañas:

- **Catálogo:** productos con código, costo, precio sin IVA, con IVA y margen; ficha con fotos e historial de costos.
- **Cargar productos:** formulario uno por uno (indica si es nuevo o actualiza) y carga por lote con plantilla Excel, vista previa editable y filas marcadas como nuevo / actualiza / error.
- **Precios:** tabla global editable (costo, sin IVA, con IVA), margen y descarga a Excel.
- **Fotos:** fotos recientes (incluidas las de la familia) y productos sin foto.
- **Tienda:** nombre, RUC, teléfono, dirección, correo, IVA y validez de cotizaciones; cerrar sesión.
- **Clientes** y **Ventas:** próximamente.

El precio se guarda **sin IVA** (4 decimales) y el precio con IVA se calcula con el IVA de la tienda.

```bash
npm ci
npm start
```

El instalador de Windows se compila y verifica en GitHub Actions (`windows-installer.yml`).

## Seguridad

- Tablas con RLS y sin acceso directo; todo pasa por la Edge Function `catalog-api` (service_role solo en servidor).
- Sin sesión: solo `catalog` (lista pública con costo y precios, sin proveedores ni rutas internas), `login` y `uploadPhoto` (máx. 2 MB, solo JPG/PNG/WebP, productos existentes, máx. 12 fotos por producto).
- La app de administración entra con PIN: el PIN se guarda como hash con sal en `family_admin_auth` (nunca en el repositorio) y la sesión resultante (`family_admin_sessions`, 180 días) se guarda cifrada en Windows.
- Fotos en un bucket privado; se entregan con URLs firmadas que vencen en 1 hora.

## Desarrollo

```bash
npm test
```

- `supabase/migrations/`: estructura SQL. `supabase/functions/catalog-api/`: API.
- `web/index.html` + `viewer.js` + `viewer-core.js`: lista familiar. `web/jefferson/` + `app.js`: administración.
- Flujos: `tests.yml` (pruebas), `web-deploy.yml` (Pages), `live-check.yml` (verificación real en producción), `windows-installer.yml`.

Más detalle en [docs/puesta-en-marcha.md](docs/puesta-en-marcha.md).
