# Nicole Encajes — Supabase (base oficial) y Google Sheets (respaldo/consulta)

**Fuente oficial:** Supabase, proyecto Nicole Encajes. **La hoja no sustituye ni controla directamente la base.**
Hoja privada: https://docs.google.com/spreadsheets/d/1cr8mVW4ab6SFY1OJE90TCtHi2i_TnrM8Q8O1PwqawVE/edit

## Funcionamiento publicado

1. Abrir **https://jeffer91.github.io/almacen/sincronizar/**.
2. La consulta de respaldo conserva el acceso existente; las importaciones y la consulta de referencia privada requieren PIN administrativo.
3. En Google Sheets, hoja `CAMBIOS_PENDIENTES`, preparar cambios con una fila por presentación:
   `Código (SKU) | Producto | Marca | Categoría | Presentación | Cantidad | Unidad | Proveedor | Costo compra USD | Precio CON IVA USD | Precio SIN IVA USD | Aplicar (SI/NO)`.
4. Cambiar `Aplicar` a `SI` **solo** para filas verificadas. El resto permanece en `NO`.
5. Copiar el rango **A1:L... incluyendo encabezados** y pegar en la pantalla del sincronizador.
6. Pulsar **Revisar diferencias con Supabase**: la vista previa distingue nuevo / actualización / sin cambios, detecta duplicación de SKU, errores y conflictos de identidad.
7. Pulsar **Aplicar cambios autorizados a Supabase** y confirmar. Se consulta Supabase otra vez antes del envío: si cambió, no se escribe el lote. El importe se convierte a neto con el IVA configurado si se usa solo el precio con IVA.
8. La API valida los datos y aplica cambios mediante la función SQL existente `family_import_catalog_v2`, que trabaja en una transacción y limita a 500 presentaciones por lote.

## Copias de consulta

- En el sincronizador: **Copiar productos** o **Copiar ventas** para obtener el contenido actual de Supabase en formato tabulado.
- Antes de pegar desde A1 en `RESPALDO_PRODUCTOS` o `RESPALDO_VENTAS`, **vaciar los valores anteriores** de esa pestaña, para no conservar registros eliminados o anulados de una copia pasada.
- Alternativamente, pulsar **Descargar** y abrir el TSV en Google Sheets.
- Con ChatGPT y la conexión con Google Drive se pueden renovar estas pestañas bajo petición, sin acceder con PIN desde el navegador.
- El respaldo a Google Sheets **NO es automático**. No almacenar la clave de servicio de Supabase en el repositorio público, scripts del navegador ni celdas.
- No convertir `PRODUCTOS`, `PRESENTACIONES` ni `VENTAS` antiguas en fuente oficial por accidente. La pestaña de preparación no importa por sí sola.
- Google Sheets no es un respaldo completo de Postgres (SQL, roles, fotos/Storage, logs, funciones, etc.). Guardar copias integrales separadas cuando sean necesarias.

## Política de precios

- La API conserva el precio de Jefferson **SIN IVA**, con precisión de cuatro decimales.
- Si en el formulario se usa **Precio CON IVA**, el sincronizador divide por `1 + IVA/100`, redondeando a 4 decimales. Su vista previa muestra el precio final.
- Si se llenan ambas columnas, los valores deben coincidir dentro de 1 centavo.
- No importar una cifra de la hoja antigua como neta si no se sabe si incluye IVA. Validar antes con el dueño.

## Límites y seguridad

- La lectura directa se realiza únicamente en el servidor mediante el puente privado de Apps Script, tras autorizarlo. No se publica ni se elimina la privacidad de Google Sheets.
- La pestaña `CAMBIOS_PENDIENTES` es solo un **área de preparación**. El botón de importar requiere PIN administrativo y confirmación.
- Los cambios a Supabase no se intentan automáticamente cada 15 minutos.
- Se compara la versión consultada contra una nueva lectura antes de importar. Esta precaución reduce conflictos, pero **no proporciona bloqueo transaccional entre lectura y escritura** si otro administrador modifica exactamente a la vez.
- `importExcel` no sincroniza fotografías ni existencias; la gestión de inventario seguirá siendo un módulo posterior.
- No repetir lotes completos con SKU ambiguo. Las filas sin cambios se omiten.

## Pruebas

```bash
npm ci
npm test
```

GitHub Actions comprueba la publicación de `/sincronizar/` y que `syncSnapshot` y `exportSalesBackup` permiten acceso público y `bootstrap` conserva autenticación. Los tests comprueban plantilla, IVA, rechazo de columnas erróneas y autorización.

## Edgar: botón «⟳ Google Sheets» (Supabase → RESPALDO_EDGAR)

La fuente oficial sigue siendo Supabase. El panel de Edgar guarda en Supabase antes de habilitar cualquier respaldo. Tras guardar, pulsa **⟳ Google Sheets** en `/edgar/`.

### Estado de la integración

- Se creó en la hoja privada la pestaña `RESPALDO_EDGAR`, con 18 columnas, encabezados y filtro. No se modificaron `PRODUCTOS`, `PRESENTACIONES`, `CAMBIOS_PENDIENTES` ni `RESPALDO_PRODUCTOS`.
- Hay un botón **Sincronizar automáticamente**, conectado a `sync-sheets`, función de Supabase ya desplegada. **Mientras no se configure el webhook de Google Apps Script, la función devuelve `GOOGLE_NOT_CONNECTED` y no escribe la hoja**.
- Alternativa operativa: **Copiar respaldo de Supabase** o **Descargar respaldo TSV**. Abrir `RESPALDO_EDGAR`, limpiar sólo sus valores anteriores A:R, y pegar desde A1 (o importar el TSV). La copia NO cuenta como sincronización hasta pegarla.
- El respaldo incluye **productos/presentaciones oficiales** y **opciones/ediciones guardadas por Edgar en `family_catalog_options`**. No confundir con precios de referencia de `web/sheet-catalog.json` que todavía no se hayan migrado a Supabase. En particular, una cifra procedente sólo del JSON estático no se anuncia como respaldo confirmado.

### Activar sincronización automática por botón (configuración una sola vez)

Esta configuración debe realizarla la persona propietaria de la hoja de Google, dentro de su cuenta y de Supabase; **no enviar claves o secretos por chat ni subirlos a GitHub**.

1. Abrir la hoja https://docs.google.com/spreadsheets/d/1cr8mVW4ab6SFY1OJE90TCtHi2i_TnrM8Q8O1PwqawVE/edit. Desde **Extensiones → Apps Script**, abrir el editor y pegar el código completo de [integrations/google-apps-script/Code.gs](../integrations/google-apps-script/Code.gs).
2. En **Configuración del proyecto → Propiedades del script**, crear la propiedad `SYNC_SECRET` con un valor aleatorio de **al menos 32 caracteres**. Guardar el valor de forma privada.
3. **Implementar → Nueva implementación → Aplicación web**: ejecutar como propietario, acceso **Cualquier usuario**. Autorizar los permisos para escribir en esa hoja. Copiar la URL que termina en `/exec`.
4. En **Supabase → Nicole Encajes → Edge Functions → Secrets**, configurar:
   - `EDGAR_SHEETS_WEBHOOK_URL`: URL de Apps Script desplegada en el paso 3.
   - `EDGAR_SHEETS_SYNC_SECRET`: **exactamente el mismo** secreto de la propiedad `SYNC_SECRET` del paso 2.
5. Abrir `/edgar/`, pulsar **⟳ Google Sheets → Sincronizar automáticamente**. El sistema sólo muestra éxito cuando la función de Google responde con `ok:true` y el número de filas. Reabrir la pestaña `RESPALDO_EDGAR` para verificar fecha, precio y cantidad.
6. Si se modifica el código Apps Script, actualizar la implementación web; si se revoca o rota el secreto, actualizarlo tanto en Script Properties como en Secrets de Supabase.

La función `sync-sheets` verifica la existencia del dispositivo Edgar, pero **el navegador de Edgar no solicita autenticación y su identificador es público**. Por tanto, cualquier visitante de la URL de Edgar podría editar el catálogo y ordenar un respaldo. El secreto del webhook nunca viaja al navegador y no debe exponerse. Para restringir el acceso se necesita autenticación real.

### Sentido y comportamiento

- **Edgar → Supabase → Google Sheets**. Nunca importar valores de `RESPALDO_EDGAR` a Supabase. La pestaña de respaldo es exclusivamente de salida.
- Si Google falla, Supabase conserva el cambio y la interfaz muestra un error explícito. No se marca sincronización completa ni se duplican filas al reintentar: el receptor reemplaza el contenido de `RESPALDO_EDGAR` por la instantánea confirmada.
- El botón no sincroniza ventas ni imágenes, ni edita las demás pestañas de trabajo.

## Noviembre 2026: sincronización de la base de referencia

- Se incorporaron 1600 registros de PRECIOS_LOTE_251126 y 40 categorías a Supabase (family_sheet_staging y family_categories). La operación SQL es transaccional e idempotente y registra el resultado en family_sync_runs. Los registros que desaparezcan quedan inactivos; una carga más pequeña se bloquea por defecto.
- En /sincronizar/, **Consultar datos sincronizados** permite buscar por nombre y categoría con páginas de 50 filas. Se requiere el PIN administrativo.
- **Sincronizar desde Google Sheets** lee PRECIOS_LOTE_251126 A:AQ y CATEGORIAS A:B mediante el puente existente, si se encuentra autorizado. **Leer cambios desde Google Sheets** lee CAMBIOS_PENDIENTES A:L y abre la vista previa; solo las filas SI se consideran.
- Para habilitar ambos botones directos, seguir los pasos de autorización del Apps Script anteriores y actualizar la implementación a la versión de Code.gs que admite readMaster y readChanges. La hoja se conserva privada; no compartir secretos por chat ni en GitHub.
- Si el puente no está configurado, usar la carga manual de ambas tablas en el módulo o la conexión autorizada de ChatGPT con Google Drive. No se deben marcar precios ambiguos como aprobados.
- No se promueven automáticamente los registros de referencia al catálogo comercial. Se conserva la carga aprobada de CAMBIOS_PENDIENTES y el importador comercial Excel con su límite de 500 presentaciones por lote.
