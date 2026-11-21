# Nicole Encajes

Catálogo y lista de precios de la familia. Un solo proyecto de Supabase sirve dos aplicaciones:

| Para quién | Qué es | Dónde |
| --- | --- | --- |
| **Gloria** | Lista familiar de precios (consulta) y fotos | https://jeffer91.github.io/almacen/ |
| **Edgar** | Tabla de precios, edición de productos existentes, nueva presentación y alta de productos | https://jeffer91.github.io/almacen/edgar/ |
| **Jefferson** | Administración: productos, precios, costos, proveedores y fotos | App de escritorio Electron (Windows) |

La ruta `/gloria/` redirige a la lista familiar. La ruta `/edgar/` ofrece edición únicamente tras vincular el navegador mediante una invitación privada de un solo uso, sin pedir PIN en cada cambio. La página de administración (`web/jefferson/`) **no** se publica en internet: solo la abre Electron.

## Respaldo en Google Sheets y actualización de Supabase

- **Supabase sigue siendo la base oficial.** Google Sheets es un respaldo de consulta y una zona de preparación, no un segundo origen de verdad.
- Página protegida con PIN: [Sincronización y respaldo](https://jeffer91.github.io/almacen/sincronizar/).
- Importar filas aprobadas de la hoja `CAMBIOS_PENDIENTES` con validación y vista previa; recibir CSV/TSV de respaldo de productos y ventas.
- **La copia hacia Sheets no es automática**: requiere pegar el respaldo exportado o pedir la actualización mediante ChatGPT/Google Drive. La hoja no se hace pública.
- [Procedimiento, controles y limitaciones](docs/google-sheets-sync.md).

## Ventas del día (GitHub Pages con PIN)

- Acceso desde **https://jeffer91.github.io/almacen/ventas/** o desde el botón «Ventas» del catálogo público.
- Solicita el PIN administrativo existente; token solo en memoria de la pestaña, no en almacenamiento persistente.
- Registrar ventas por artículo, incluso cuando todavía no existe en el catálogo; fecha de Ecuador, presentación, cantidad (incluidos metros), unidad, precio, forma de pago y notas.
- Consultar total e historial por fecha, exportar CSV para Excel y anular registros con auditoría (sin borrado físico).
- Los registros se guardan en `public.family_daily_sales`, con RLS y sin permisos de consulta pública directa. La Edge Function requiere sesión de administrador para registrar, listar o anular.
- No descuenta inventario (todavía no existe control de existencias) y no genera comprobantes fiscales.

## Lista de precios familiar (web)

- Un solo link público, sin contraseña.
- Buscador que ignora tildes, mayúsculas y orden de palabras, más filtro por categoría.
- Botones de descarga en **PDF** y **Excel** (de lo que se está viendo).
- **Fotos pendientes:** muestra 3 productos sin foto a la vez; «Tomar foto» abre la cámara, la foto se reduce antes de subir y se puede anotar el color. La primera vez se pregunta quién toma la foto (Edgar o Gloria).
- Gloria puede consultar el catálogo, sin herramientas de edición. Edgar ve una tabla editable tras vincular su dispositivo; puede modificar precio CON IVA, costo, cantidad, unidad, presentación y proveedor de filas oficiales, añadir opciones por proveedor o presentación y crear productos con su categoría. Las operaciones se guardan en Supabase.
- El precio que se muestra es el «precio Jefferson» de cada presentación (si falta, el último registrado).

## Edición de Edgar desde el navegador

1. Abrir `/edgar/` en el dispositivo de Edgar.
2. Activarlo una sola vez con el enlace privado `/edgar/#activar=...`. El enlace se consume y desaparece de la barra de dirección; **no se publica en GitHub ni se entrega a terceros**.
3. Pulsar «Editar» para actualizar precios, costos o información de una presentación oficial. El precio ingresado es **con IVA**, y se guarda oficialmente sin IVA.
4. Pulsar «Agregar opción» para registrar una alternativa (otro proveedor o presentación). Estas alternativas se guardan en `family_catalog_options`, visibles para ambas vistas, y no reemplazan las presentaciones oficiales.
5. Pulsar «+ Nuevo producto» para dar de alta un producto real con categoría, primera presentación, cantidad, costo opcional, proveedor opcional y precio con IVA. Se guarda en las tablas oficiales de Supabase y se muestra en ambas vistas.
6. Si otra persona actualiza la misma presentación, el guardado detecta el conflicto y exige volver a cargar.

**Google Sheets** continúa como respaldo/manual; una edición de Edgar no modifica automáticamente la hoja privada.

## Administración (Electron)

Entra con **PIN** (se pide una vez por computadora; 5 intentos fallidos bloquean 15 minutos). Pestañas:

- **Catálogo:** productos con código, costo, precio sin IVA, con IVA y margen; ficha con fotos e historial de costos.
- **Cargar productos:** formulario uno por uno (indica si es nuevo o actualiza) y carga por lote con plantilla Excel, vista previa editable y filas marcadas como nuevo / actualiza / error.
- **Precios:** tabla global editable (costo, sin IVA, con IVA), margen y descarga a Excel.
- **Fotos:** fotos recientes (incluidas las de la familia) y productos sin foto.
- **Tienda:** nombre, RUC, teléfono, dirección, correo, IVA y validez de cotizaciones; cerrar sesión.
- **Clientes** y **Ventas** en Electron: próximamente (el registro de ventas ya está disponible en GitHub Pages con PIN).

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
