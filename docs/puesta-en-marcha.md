# Puesta en marcha · Nicole Encajes

## 1. Supabase

- **Proyecto:** Nicole Encajes · ref `oppaviqjlyrnkpxjsfvo` · región `sa-east-1`.
- **URL:** https://oppaviqjlyrnkpxjsfvo.supabase.co
- Si el proyecto se pausa por inactividad (plan gratuito), la lista y la app dejan de cargar: reanudarlo en el panel de Supabase.

Para una instalación nueva, aplicar las migraciones de `supabase/migrations/` (editor SQL o `supabase db push`).

## 2. Edge Function

```bash
supabase functions deploy catalog-api --no-verify-jwt
```

La verificación JWT de Supabase va desactivada porque la función hace su propia comprobación:

- **Sin clave (público):** `catalog` y `uploadPhoto` (con `by` = `edgar` o `gloria`).
- **App de administración (`x-almacen-admin: jefferson`):** todas las demás acciones (`bootstrap`, productos, presentaciones, precios, costos, proveedores, Excel, `setPrimaryPhoto`, `deletePhoto`, `archiveProduct`).

## 3. Acceso de administración

La app Electron entra sin activación: envía `x-almacen-admin: jefferson` en cada solicitud. No hay contraseña (decisión del dueño), así que cualquiera que conozca la dirección de la API podría editar. La lista familiar nunca envía esa cabecera.

## 4. GitHub Pages

`web-deploy.yml` publica `web/` sin `jefferson/` ni `app.js`. Después, `live-check.yml` comprueba en producción que:

- la lista familiar carga y los links viejos redirigen;
- `/jefferson/` no existe en la web;
- la API responde la lista pública sin datos internos y rechaza escrituras sin clave (401).

## 5. Comprobaciones

```bash
npm test
```

Revisar en GitHub Actions las pruebas, la publicación, la verificación de producción y el instalador de Windows.
