# Nicole Encajes

Catálogo y lista de precios de la familia. Un solo proyecto de Supabase sirve dos aplicaciones:

| Para quién | Qué es | Dónde |
| --- | --- | --- |
| **Gloria** | Lista familiar de precios (consulta) y fotos | https://jeffer91.github.io/almacen/ |
| **Edgar** | Tabla de precios, edición de productos existentes, nueva presentación y alta de productos | https://jeffer91.github.io/almacen/edgar/ |
| **Jefferson** | Administración: productos, precios, costos, proveedores y fotos | App de escritorio Electron (Windows) |

La ruta `/gloria/` redirige a la lista familiar. La ruta `/edgar/` permite editar directamente, sin PIN ni código de activación. **Advertencia:** GitHub Pages es pública y el identificador de edición incluido en esta ruta no es autenticación: cualquier persona que visite o inspeccione el enlace de Edgar puede modificar el catálogo. La página de administración (`web/jefferson/`) **no** se publica en internet: solo la abre Electron.


## Acceso público a los módulos web (24-11-2026)

Gloria, Edgar, Ventas, Catálogo Excel y Sincronización se abren sin PIN. Cualquier visitante puede consultar los datos y usar las operaciones ofrecidas, incluyendo ediciones, registro/anulación de ventas e importaciones. No se puede verificar su identidad. La administración de Electron conserva PIN y las tablas siguen sin acceso directo. Google Sheets y las credenciales del servidor permanecen privados.

## Panel de administración comercial

- https://jeffer91.github.io/almacen/administrador/ — público; indicadores de consulta y módulo de carga masiva.
- Indicadores reales, filtros, evolución, pagos, cantidades por unidad y ranking exportable.
- Catálogo oficial: productos por categoría, presentaciones, marcas, cobertura de fotografías/precios oficiales/costos, pendientes de calidad, SKU, detalle y exportaciones CSV. Archivo Excel histórico separado. Ventas por categoría por coincidencia de nombre (no por ID histórico).
- No estima utilidad ni existencias: faltan costos históricos por venta e inventario.

## Precios comerciales y longitud

Las nuevas plantillas web usan Costo, Precio final, PXM opcional y Precio por metro opcional. El precio debe superar costo; PXM debe superar costo y no superar precio. Para metros y yardas se calcula costo por metro, sin inventar costos faltantes. Basta un importe disponible entre costo, precio, PXM y precio por metro. El costo y el precio pueden faltar: se advierte y se conservan los importes existentes. Las comparaciones de rentabilidad solo se realizan cuando están disponibles ambos valores. El IVA interno se mantiene para compatibilidad. SKU opcional. El módulo comercial usa una función transaccional; otros módulos históricos conservan sus reglas.

## Cargas masivas Excel

- https://jeffer91.github.io/almacen/administrador/cargas/ — descargar/cargar plantillas .xlsx de productos y precios (500 filas, 5 MB por archivo).
- Productos: revisión previa y lote mediante importExcel; precios: plantilla precargada por categoría/lote con ID de presentación, columnas de precio nuevo y validación del precio anterior. Solo modifica family_prices del precio oficial Jefferson. No se cambian ventas históricas.
- Sin PIN, como los demás módulos web. El usuario confirma antes de guardar; la confirmación no autentica. La comparación previa reduce conflictos, pero no garantiza bloqueo transaccional entre lectura y escritura.

## Catálogo Excel completo (23-11-2026)

- Consulta administrativa: https://jeffer91.github.io/almacen/catalogo-excel/ (enlace también en Gloria y Edgar).
- El acceso es público, sin PIN; la consulta sigue siendo de solo lectura.
- Archivo de procedencia: `ALMACEN 2024(4).xls`; 16 hojas detectadas, de las cuales 2 están ocultas y **excluidas**: `Bordados` y `Pasamaneria`.
- Se almacenaron **1.801 filas comerciales** de 11 hojas visibles, en **10 bloques**. Se descartaron las hojas sin catálogo de productos (`N, de P.`, `Jeff`, `Falta`) y el marcador aislado de la fila 65536 de Cintas.
- Todos los encabezados y valores se preservan por columna original, con hoja y fila de procedencia. **No se inventan ni recalculan costos** cuando la naturaleza del valor es ambigua.
- Datos de archivo originales: `family_excel_catalog_sheets` y `family_excel_catalog_rows`. Ambas tablas tienen RLS y **no admiten lectura directa anon/authenticated**; solo la Edge Function `excel-catalog` sirve los datos de lectura pública.
- Copia legible en Google Sheets maestro: 11 pestañas `XLS_*`. No se alteraron las 17 pestañas existentes.
- Los datos originales todavía **no equivalen** a productos normalizados en `family_products` ni a precios oficiales en `family_prices`; la consulta es de solo lectura y conserva la procedencia histórica.

## Respaldo en Google Sheets y actualización de Supabase

- **Supabase sigue siendo la base oficial.** Google Sheets es un respaldo de consulta y una zona de preparación, no un segundo origen de verdad.
- Página de acceso público: [Sincronización y respaldo](https://jeffer91.github.io/almacen/sincronizar/).
- Importar filas aprobadas de la hoja `CAMBIOS_PENDIENTES` con validación y vista previa; recibir CSV/TSV de respaldo de productos y ventas.
- Edgar dispone de **⟳ Google Sheets** y de la pestaña privada `RESPALDO_EDGAR`. El botón puede copiar/descargar de inmediato la instantánea oficial de Supabase para pegar desde A1. La **sincronización automática por un clic** está implementada, pero aún requiere autorizar una implementación de Google Apps Script y configurar dos secretos privados en Supabase.
- La hoja no se hace pública; el respaldo no sustituye ni reimporta las pestañas de trabajo.
- [Procedimiento, controles y limitaciones](docs/google-sheets-sync.md).

## Ventas del día (GitHub Pages sin PIN)

- Acceso desde **https://jeffer91.github.io/almacen/ventas/** o desde el botón «Ventas» del catálogo público.
- Se abre directamente, sin PIN. Cualquier visitante puede consultar, registrar o anular ventas.
- Registrar ventas por artículo, incluso cuando todavía no existe en el catálogo; fecha de Ecuador, presentación, cantidad (incluidos metros), unidad, precio, forma de pago y notas.
- Consultar total e historial por fecha, exportar CSV para Excel y anular registros con auditoría (sin borrado físico).
- Los registros se guardan en `public.family_daily_sales`, con RLS y sin permisos de consulta pública directa. La Edge Function permite registrar, listar o anular ventas desde el acceso público.
- No descuenta inventario (todavía no existe control de existencias) y no genera comprobantes fiscales.

## Lista de precios familiar (web)

- Un solo link público, sin contraseña.
- Buscador que ignora tildes, mayúsculas y orden de palabras, más filtro por categoría.
- Botones de descarga en **PDF** y **Excel** (de lo que se está viendo).
- **Fotos pendientes:** muestra 3 productos sin foto a la vez; «Tomar foto» abre la cámara, la foto se reduce antes de subir y se puede anotar el color. La primera vez se pregunta quién toma la foto (Edgar o Gloria).
- Gloria puede consultar el catálogo, sin herramientas de edición. Edgar ve una tabla editable sin vincular el dispositivo; puede modificar precio CON IVA, costo, cantidad, unidad, presentación y proveedor de filas oficiales, añadir opciones por proveedor o presentación y crear productos con su categoría. Las operaciones se guardan en Supabase.
- El precio que se muestra es el «precio Jefferson» de cada presentación (si falta, el último registrado).

## Edición de Edgar desde el navegador

1. Abrir [Panel de Edgar](https://jeffer91.github.io/almacen/edgar/) sin ingresar códigos ni PIN.
2. Pulsar el botón de **lápiz** en cualquier fila para abrir el formulario emergente, editar precio CON IVA, costo, cantidad, unidad, presentación y proveedor, y guardar.
3. Pulsar **+ Opción** para agregar una presentación o un proveedor alternativo para un producto existente.
4. Pulsar **+ Nuevo producto** para dar de alta un producto oficial con categoría, presentación y precio.
5. Las ediciones se guardan en **Supabase** y aparecen en el catálogo familiar. **Google Sheets** se actualiza sólo después de pulsar el botón de sincronización (requiere conexión de Apps Script) o de pegar el respaldo manualmente en `RESPALDO_EDGAR`; todavía no se actualiza sola.

6. Pulsar **⟳ Google Sheets**. La opción automática sólo informará éxito si Google confirma la escritura en `RESPALDO_EDGAR`. Si aún no está conectado, usar **Copiar respaldo de Supabase** y pegar en esa pestaña; para habilitar un clic, seguir [la configuración privada de Apps Script](docs/google-sheets-sync.md#activar-sincronización-automática-por-botón-configuración-una-sola-vez).

**Riesgo asumido en este modo:** sin autenticación no puede comprobarse quién es Edgar. La ruta y su identificador de escritura se publican en internet; cualquier persona que obtenga acceso puede modificar datos. El identificador público se puede revocar borrando su huella de `family_editor_keys`, pero no protege contra modificaciones no autorizadas mientras esté activo. Para proteger las ediciones se necesita inicio de sesión real.

## Administración (Electron)

Entra con **PIN** (se pide una vez por computadora; 5 intentos fallidos bloquean 15 minutos). Pestañas:

- **Catálogo:** productos con código, costo, precio sin IVA, con IVA y margen; ficha con fotos e historial de costos.
- **Cargar productos:** formulario uno por uno (indica si es nuevo o actualiza) y carga por lote con plantilla Excel, vista previa editable y filas marcadas como nuevo / actualiza / error.
- **Precios:** tabla global editable (costo, sin IVA, con IVA), margen y descarga a Excel.
- **Fotos:** fotos recientes (incluidas las de la familia) y productos sin foto.
- **Tienda:** nombre, RUC, teléfono, dirección, correo, IVA y validez de cotizaciones; cerrar sesión.
- **Clientes** y **Ventas** en Electron: próximamente (el registro de ventas ya está disponible en GitHub Pages sin PIN).

El precio se guarda **sin IVA** (4 decimales) y el precio con IVA se calcula con el IVA de la tienda.

```bash
npm ci
npm start
```

El instalador de Windows se compila y verifica en GitHub Actions (`windows-installer.yml`).

## Seguridad

- Tablas con RLS y sin acceso directo; todo pasa por la Edge Function `catalog-api` (service_role solo en servidor).
- Sin sesión: módulos web públicos (ventas, respaldo, importación y consulta Excel), `catalog` (lista pública con costo y precios, sin proveedores ni rutas internas), `login` y `uploadPhoto` (máx. 2 MB, solo JPG/PNG/WebP, productos existentes, máx. 12 fotos por producto).
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
