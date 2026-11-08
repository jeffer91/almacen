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
- **Con la clave de Jefferson:** todas las demás acciones (`bootstrap`, productos, presentaciones, precios, costos, proveedores, Excel, `setPrimaryPhoto`, `deletePhoto`, `archiveProduct`).

## 3. Clave de Jefferson

La clave se guarda solo como hash en `family_access_links`. Para generar una nueva (invalida la anterior):

```sql
with t as materialized (select encode(gen_random_bytes(32),'hex') as secret)
update public.family_access_links
   set token_hash = encode(digest((select secret from t),'sha256'),'hex'), enabled = true, updated_at = now()
 where role = 'jefferson'
returning (select secret from t) as secret;
```

En Electron, pegar `https://jeffer91.github.io/almacen/jefferson/#key=SECRETO` (o solo el secreto) en la pantalla de activación. **Nunca** guardar el secreto en el repositorio.

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
