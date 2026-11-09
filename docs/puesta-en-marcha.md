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

- **Sin sesión (público):** `catalog`, `login` y `uploadPhoto` (con `by` = `edgar` o `gloria`).
- **Con sesión de PIN (`x-almacen-key`):** todo lo demás (`bootstrap`, productos, presentaciones, precios, costos, proveedores, Excel, fotos, `saveSettings`, `logout`).

## 3. PIN de administración

El PIN vive solo como hash con sal en `family_admin_auth`. Para cambiarlo (reemplaza `NUEVO_PIN`, no lo guardes en el repositorio):

```sql
with s as (select encode(gen_random_bytes(16),'hex') as salt)
update public.family_admin_auth
   set pin_salt = (select salt from s), pin_hash = encode(digest((select salt from s) || 'NUEVO_PIN','sha256'),'hex'),
       failed_attempts = 0, locked_until = null, updated_at = now()
 where id = 1;
delete from public.family_admin_sessions; -- obliga a volver a ingresar el PIN
```

## 4. GitHub Pages

`web-deploy.yml` publica `web/` sin `jefferson/` ni `app.js`. Después, `live-check.yml` comprueba en producción que:

- la lista familiar carga y los links viejos redirigen;
- `/jefferson/` no existe en la web;
- la API responde la lista pública sin datos internos y rechaza escrituras sin sesión (401).

Además corre cada 3 días para que el proyecto gratuito de Supabase no se pause.

## 5. Comprobaciones

```bash
npm test
```

Revisar en GitHub Actions las pruebas, la publicación, la verificación de producción y el instalador de Windows.
