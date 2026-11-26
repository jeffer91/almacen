"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const root=path.join(__dirname,".."),read=p=>fs.readFileSync(path.join(root,p),"utf8");
test("La edición comercial no utiliza claves publicadas ni invitaciones antiguas",()=>{
 const html=read("web/edgar/productos/index.html"),products=read("web/edgar/productos/products.js"),viewer=read("web/viewer.js");
 assert.doesNotMatch(html,/edgar\/access\.js/);
 assert.doesNotMatch(products+viewer+read("web/edgar/access.js"),/EDGAR_EDIT_DEVICE/);
 assert.match(products,/NICOLE_EDGAR_SESSION\?\.getToken\(\)/);
 const dir=path.join(root,"supabase/migrations");
 const migration=fs.readdirSync(dir).find(p=>p.endsWith("_edgar_require_real_session_for_catalog.sql"));
 assert.ok(migration);
 const sql=fs.readFileSync(path.join(dir,migration),"utf8");
 assert.equal((sql.match(/edgar_pin_validate\(device\)/g)||[]).length,4);
 assert.match(sql,/revoke execute on function public\.family_pair_editor/);
 assert.match(sql,/interval '30 days'/);
});
test("Fotos y respaldo requieren autorización, sin compartir el token comercial con Google",()=>{
 const api=read("supabase/functions/catalog-api/index.ts"),sync=read("supabase/functions/sync-sheets/index.ts");
 assert.match(api,/if\(photoAction&&authenticatedRole!=="jefferson"&&!edgarSales\)return fail/);
 assert.match(api,/const jpeg=mime===/);
 assert.doesNotMatch(api,/uploadPhoto\(by as Shop/);
 assert.match(sync,/db\.rpc\("edgar_pin_validate"/);
 assert.doesNotMatch(sync,/family_editor_keys|JSON\.stringify\(\{secret,token/);
 assert.match(sync,/JSON\.stringify\(\{secret,device:"0"\.repeat\(64\)\}\)/);
});