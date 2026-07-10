# Modelo local del catálogo comercial

## Objetivo

El catálogo se diseñó para que Edgar, Gloria y Jefferson puedan crear productos y variaciones directamente, conservar fotografías diferentes por local y mantener todo el historial sin eliminar información físicamente.

Este bloque prepara la estructura y la lógica local. Las pantallas de búsqueda, creación y edición se incorporarán en los siguientes bloques.

## Productos

La tabla `products` conserva:

- nombre principal;
- nombre normalizado para búsqueda y detección de duplicados;
- marca;
- categoría;
- descripción;
- notas;
- estado;
- versión del registro;
- usuario, equipo y fechas de creación y actualización;
- datos del último retiro y restauración.

### Estados

- `active`: aparece normalmente y puede utilizarse.
- `inactive`: se conserva, pero está temporalmente fuera de uso.
- `retired`: deja de aparecer en búsquedas normales, sin borrarse.

Un nombre retirado puede utilizarse en un producto nuevo. Esto permite que Edgar o Gloria creen un reemplazo cuando no pueden restaurar el anterior. Jefferson podrá relacionar ambos registros posteriormente.

## Variaciones

La tabla `product_variants` guarda presentaciones exactas del producto, por ejemplo:

- Funda 500 g.
- Botella 1 litro.
- Caja de 12 unidades.

Cada variación puede registrar:

- nombre;
- presentación;
- unidad;
- cantidad;
- código interno opcional;
- notas;
- estado y versión;
- historial de retiro y restauración.

No se utiliza código de barras como requisito.

## Fotografías

La tabla `product_photos` permite conservar varias fotografías del mismo producto.

Cada fotografía identifica:

- producto y variación opcional;
- usuario propietario;
- local o canal;
- equipo donde se originó;
- ruta local;
- nombre y tipo del archivo;
- tamaño y dimensiones;
- checksum SHA-256;
- estado;
- etapa de sincronización;
- fotografía anterior a la que reemplaza, cuando corresponda.

### Fotografías principales

Puede existir:

- una fotografía general por producto;
- una fotografía principal por producto y canal.

Una fotografía nueva nunca reemplaza silenciosamente una principal existente. El cambio deberá ser explícito desde Administración.

### Sincronización progresiva

Los estados preparados son:

1. `local_only`;
2. `metadata_pending`;
3. `thumbnail_pending`;
4. `full_pending`;
5. `synced`;
6. `failed`.

Esto permite enviar primero los datos pequeños, después la miniatura y finalmente el archivo completo cuando la conexión sea adecuada.

## Relaciones entre productos

La tabla `product_links` permite que Jefferson relacione dos registros como:

- `replacement`: un producto nuevo reemplaza a otro retirado;
- `duplicate`: ambos registros representan el mismo producto;
- `merged_into`: el registro de origen deberá consolidarse en el destino.

En este bloque se registra la relación, pero todavía no se trasladan automáticamente costos, precios ni fotografías.

## Historial no destructivo

La tabla `catalog_events` registra cada acción relevante:

- creación de producto;
- creación de variación;
- fotografía agregada;
- cambio de estado;
- retiro;
- restauración;
- relación entre productos.

Cada evento conserva:

- actor;
- equipo;
- canal;
- estado anterior;
- estado nuevo;
- razón;
- fecha;
- estado de sincronización.

También se generan entradas en `audit_events` y `sync_queue`.

## Reglas de permisos

### Edgar y Gloria

Pueden:

- crear productos;
- crear variaciones;
- agregar fotografías de su local;
- marcar productos, variaciones y fotografías como retirados.

No pueden restaurar elementos retirados ni relacionar productos.

### Jefferson

Puede realizar todas las operaciones anteriores y además:

- restaurar productos;
- restaurar variaciones;
- restaurar fotografías;
- asignar fotografías a cualquier canal;
- relacionar productos sustitutos, duplicados o destinados a fusión.

## Eliminación

No existe ninguna operación de borrado físico en `CatalogService`.

Los registros cambian de estado y permanecen disponibles para auditoría, restauración administrativa y sincronización.
