# Nicole Encajes — Supabase (base oficial) y Google Sheets (respaldo/consulta)

**Fuente oficial:** Supabase, proyecto Nicole Encajes. **La hoja no sustituye ni controla directamente la base.**
Hoja privada: https://docs.google.com/spreadsheets/d/1cr8mVW4ab6SFY1OJE90TCtHi2i_TnrM8Q8O1PwqawVE/edit

## Funcionamiento publicado

1. Abrir **https://jeffer91.github.io/almacen/sincronizar/**.
2. Acceder con el PIN de administración. La sesión se mantiene solo en memoria de la pestaña.
3. En Google Sheets, hoja `CAMBIOS_PENDIENTES`, preparar cambios con una fila por presentación:
   `Código (SKU) | Producto | Marca | Categoría | Presentación | Cantidad | Unidad | Proveedor | Costo compra USD | Precio CON IVA USD | Precio SIN IVA USD | Aplicar (SI/NO)`.
4. Cambiar `Aplicar` a `SI` **solo** para filas verificadas. El resto permanece en `NO`.
5. Copiar el rango **A1:L... incluyendo encabezados** y pegar en la pantalla del sincronizador.
6. Pulsar **Revisar diferencias con Supabase**: la vista previa distingue nuevo / actualización / sin cambios, detecta duplicación de SKU, errores y conflictos de identidad.
7. Pulsar **Aplicar cambios autorizados a Supabase** y confirmar. Se consulta Supabase otra vez antes del envío: si cambió, no se escribe el lote. El importe se convierte a neto con el IVA configurado si se usa solo el precio con IVA.
8. La API valida el PIN y aplica cambios mediante la función SQL existente `family_import_catalog_v2`, que trabaja en una transacción y limita a 500 presentaciones por lote.

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

- No hay lectura automática de la hoja privada desde el navegador. No se publica ni se elimina la privacidad de Google Sheets.
- La pestaña `CAMBIOS_PENDIENTES` es solo un **área de preparación**. El botón de importar está protegido con PIN y requiere confirmación.
- Los cambios a Supabase no se intentan automáticamente cada 15 minutos.
- Se compara la versión consultada contra una nueva lectura antes de importar. Esta precaución reduce conflictos, pero **no proporciona bloqueo transaccional entre lectura y escritura** si otro administrador modifica exactamente a la vez.
- `importExcel` no sincroniza fotografías ni existencias; la gestión de inventario seguirá siendo un módulo posterior.
- No repetir lotes completos con SKU ambiguo. Las filas sin cambios se omiten.

## Pruebas

```bash
npm ci
npm test
```

GitHub Actions comprueba la publicación de `/sincronizar/` y que `exportSalesBackup` devuelve 401 sin sesión. Los tests comprueban plantilla, IVA, rechazo de columnas erróneas y autorización.
