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

- **Sin sesión (lectura pública autorizada previamente):** `catalog`, `login`, `syncSnapshot`. La consulta pública de precios aún incluye determinados costos comerciales; revisar el alcance de publicación antes de restringirla.
- **Con sesión de PIN (`x-almacen-key`):** ventas y fotografías requieren sesión comercial válida o administrativa según operación; administración completa (`bootstrap`, productos, presentaciones, precios, costos, proveedores, fotos, `saveSettings`, `logout`); el catálogo Excel histórico se consulta públicamente en `excel-catalog`.

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

## Refuerzo de acceso comercial

La edición de productos, opciones y presentaciones exige una sesión del PIN validada en Supabase. El antiguo identificador estático y la activación de dispositivos por invitación dejaron de autorizar cambios. La sesión comercial se recuerda por un máximo de 30 días; cerrar sesión la revoca. El respaldo de Edgar exige la misma sesión y nunca transfiere el token comercial a Google. Las fotografías requieren sesión y comprobación de tipo de archivo. La lectura familiar pública se conserva; falta decidir si restringir los costos y datos de proveedores a sesiones comerciales. La facturación real permanece bloqueada hasta completar su servicio privado y certificación.
