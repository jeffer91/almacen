# Puesta en marcha · Nicole Encajes 2.1

La aplicación está preparada para usar **un único Supabase** (PostgreSQL + Storage), **tres vistas de GitHub Pages** y **Electron para Jefferson**.

## 1. Proyecto ya creado y operativo

- **Nombre:** Nicole Encajes.
- **ID de proyecto:** `oppaviqjlyrnkpxjsfvo`.
- **URL:** https://oppaviqjlyrnkpxjsfvo.supabase.co
- **Región:** São Paulo (`sa-east-1`).
- **Estado inicial:** proyecto activo, con ocho tablas protegidas por RLS, bucket privado y API desplegada.

No es necesario crear otro proyecto. No colocar service_role ni otros secretos administrativos en GitHub o GitHub Pages.

## 2. Base central ya instalada

La migración inicial y los índices de proveedores ya fueron aplicados al proyecto. Para instalaciones nuevas, aplicar \`supabase/migrations/20261101_family_catalog.sql\` desde el editor SQL de Supabase o con las migraciones del CLI:

\`\`\`bash
supabase login
supabase link --project-ref TU_PROJECT_REF
supabase db push
\`\`\`

Las tablas están protegidas con RLS sin permisos de lectura/escritura para usuarios públicos; únicamente la función de servidor accede con service_role. Las imágenes van a un bucket privado.

## 3. Edge Function ya desplegada

\`\`\`bash
supabase functions deploy catalog-api --no-verify-jwt
\`\`\`

**Importante:** se desactiva la comprobación automática del JWT de Supabase porque este sistema utiliza tres enlaces privados de larga duración. La función sí comprueba cada solicitud: hash SHA-256 del secreto, estado activo, y permisos del rol. No cambiar la función a acceso público sin esta verificación.

URL obtenida:

\`\`\`
https://TU_PROJECT_REF.supabase.co/functions/v1/catalog-api
\`\`\`

## 4. Accesos individuales ya generados

Los tres accesos actuales están activos y las claves se entregan en privado al propietario. **No ejecutar de nuevo lo siguiente**, salvo que se quiera revocar y regenerar todos los accesos:

\`\`\`sql
with tokens as materialized (
  select role, encode(gen_random_bytes(32),'hex') as secret
  from unnest(array['edgar','gloria','jefferson']) as u(role)
), written as (
  insert into public.family_access_links(role, token_hash)
  select role,encode(digest(secret,'sha256'),'hex') from tokens
  on conflict(role) do update set token_hash=excluded.token_hash,
    enabled=true,updated_at=now()
  returning role
)
select t.role, t.secret from tokens t join written w on w.role=t.role;
\`\`\`

Los **enlaces privados completos** son:

\`\`\`
https://jeffer91.github.io/almacen/edgar/#key=SECRETO_EDGAR
https://jeffer91.github.io/almacen/gloria/#key=SECRETO_GLORIA
https://jeffer91.github.io/almacen/jefferson/#key=SECRETO_JEFFERSON
\`\`\`

Al abrir un enlace válido, el navegador recuerda la clave y retira el fragmento de la barra de direcciones. No hay formulario de contraseña. El enlace privado original es necesario para abrir por primera vez desde otro dispositivo.

**Advertencia:** cualquier persona con el enlace privado completo puede actuar como ese usuario. No compartirlo con terceros. Para revocar uno, poner \`enabled=false\` en su fila de \`family_access_links\` o regenerar el token del rol.

## 5. GitHub Pages ya conectado

El archivo público `web/config.js` ya apunta al endpoint real de Supabase. La variable opcional `ALMACEN_SUPABASE_PROJECT_REF` de GitHub Actions puede sobrescribirla, si se configura, y deberá apuntar al mismo proyecto.

GitHub Pages ya está publicado y pasó la verificación de producción. En **Settings → Pages** se utiliza **GitHub Actions** como fuente. El flujo \`.github/workflows/web-deploy.yml\` copia el sitio web y genera \`config.js\` con el endpoint correspondiente.

Verificar que el flujo de Pages termine en **Success**, después abrir los tres enlaces por separado. Si Pages no está activado, el flujo puede fallar por configuración y las URLs no servirán.

## 6. Ejecutar Electron

\`\`\`bash
npm install
npm start
\`\`\`

La interfaz Electron utiliza exclusivamente el perfil Jefferson y conserva una copia de consulta en **SQLite**. Si no has actualizado \`web/config.js\` con tu endpoint, configúralo temporalmente al iniciar:

Windows PowerShell:

\`\`\`powershell
$env:ALMACEN_API_URL = "https://TU_PROJECT_REF.supabase.co/functions/v1/catalog-api"
npm start
\`\`\`

En la primera apertura, Electron necesita el enlace de Jefferson con su secreto. Puedes copiar la clave del enlace original y abrir una primera vez \`web/jefferson/index.html#key=...\` en el navegador, o utilizar el mecanismo de provisión local que se documentará en la configuración final. **No incorporar secretos al código ni al instalador**.

Para abrir la aplicación Electron anterior (Firebase/SQLite), que permanece conservada:

\`\`\`bash
npm run start:legacy
\`\`\`

## 7. Permisos y reglas

- Edgar, Gloria y Jefferson: consulta, creación de productos y carga de fotografías.
- Cada creador: corrige nombre, marca, categoría y presentaciones de sus propios productos. Jefferson puede editar todos.
- Solo Jefferson: crea proveedores, registra costos y cambia el proveedor vigente. Se conserva el historial de costos.
- Cada almacén: modifica únicamente su precio propio. Jefferson modifica cualquiera de los tres.
- Cuando un almacén no ha establecido precio propio, ve el **último precio modificado de cualquiera de los tres**. El precio propio nunca cambia por herencia.
- Un producto puede tener presentaciones como pieza, rollo, gruesa, caja, kilo, metro y yarda. Cada presentación tiene **un costo común con historial** y **hasta tres precios propios**.
- Los nuevos productos pueden aparecer sin costo ni precio.
- Gloria ve la ficha simple; Edgar y Jefferson pueden desplegar historial y proveedor.

## Límites actuales

- El proyecto Supabase ya está activo; cualquier problema de carga deberá revisarse con el diagnóstico de GitHub Actions y los logs de Supabase.
- El caché de Electron permite **consulta de datos guardados** sin conexión. Las modificaciones requieren estar conectado; la persistencia local de imágenes y la cola de cambios offline están pendientes.
- Los enlaces secretos ofrecen comodidad, no el mismo nivel de protección que autenticación individual robusta.
- Se verificaron las tres páginas públicas, la respuesta 401 de la API sin credenciales y las operaciones SQL de productos, presentaciones, costos e historial (transacción revertida). Falta una prueba manual autenticada de todos los flujos de usuario y subida real de una fotografía.

## Comprobaciones

\`\`\`bash
npm test
node --check web/app.js
node --check app/main/desktop.js
\`\`\`

Revisar GitHub Actions para la ejecución en Windows/Linux y el instalador NSIS.
