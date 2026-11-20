"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const sync=require("../web/sync-core.js");
const header=sync.HEADERS.join("\t");
const make=(v)=>[header,v.join("\t")].join("\n");
const approved=(values={})=>[
 "SKU-CIN-04","Cinta N.º 4","","Cintas","Rollo 50 yardas","1","rollo","","","2,90","","SI"
].map((x,i)=>Object.prototype.hasOwnProperty.call(values,i)?values[i]:x);

test("Copia de Sheets: separadores TSV y autorización SI",()=>{
 const sample=make(approved());
 const parsed=sync.parsePending(sample,15);
 assert.equal(parsed.rows.length,1);
 assert.equal(parsed.errors.length,0);
 assert.equal(parsed.rows[0].precio,2.5217);
 assert.equal(parsed.rows[0].gross,2.90);
 assert.equal(sync.importRows(sync.planRows(parsed,{products:[],presentations:[],prices:[],settings:{iva_rate:15}}).plan)[0].precio,"2.5217");
});
test("No edita filas que no están autorizadas",()=>{
 const parsed=sync.parsePending(make(approved({11:"NO"})),15);
 assert.equal(parsed.rows.length,0);assert.equal(parsed.ignored,1);
});
test("No admite pegado de columnas incorrectas",()=>{
 assert.throws(()=>sync.parsePending("Producto\tPrecio\nCinta\t1.2"),/encabezados/i);
});
test("Detecta precio incoherente con y sin IVA",()=>{
 const parsed=sync.parsePending(make(approved({9:"2.90",10:"2.90"})),15);
 assert.match(parsed.errors.join(" "),/IVA/);
});
test("Previene choque de SKU entre artículos",()=>{
 const parsed=sync.parsePending(make(approved()),15);
 const old={
  products:[{id:"p1",name:"Otro modelo",brand:""}],
  presentations:[{id:"v1",product_id:"p1",sku:"SKU-CIN-04",label:"Rollo 50 yardas",quantity:1,unit:"rollo"}],
  prices:[],settings:{iva_rate:15}
 };
 assert.match(sync.planRows(parsed,old).errors.join(" "),/otro producto/);
});
test("Reconoce artículo sin modificación y excluye de importación",()=>{
 const parsed=sync.parsePending(make(approved({9:"",10:"",3:"Cintas"})),15);
 const db={
  products:[{id:"p1",name:"Cinta N.º 4",brand:"",category:"Cintas"}],
  presentations:[{id:"v1",product_id:"p1",sku:"SKU-CIN-04",label:"Rollo 50 yardas",quantity:1,unit:"rollo",current_cost:null}],
  prices:[],settings:{iva_rate:15}
 };
 const planned=sync.planRows(parsed,db);
 assert.equal(planned.plan[0].operation,"SIN CAMBIOS");
 assert.equal(sync.importRows(planned.plan).length,0);
});
test("Copia de respaldo protege celdas que parecen fórmulas",()=>{
 assert.match(sync.tsv([["=1+2","+cmd","-P", "@ref"]]),/^'=1\+2\t'\+cmd\t'-P\t'@ref$/);
});
test("Google Sheets privado no se consulta directamente desde el navegador",()=>{
 const ui=fs.readFileSync(path.join(__dirname,"../web/sincronizar/sync.js"),"utf8");
 const html=fs.readFileSync(path.join(__dirname,"../web/sincronizar/index.html"),"utf8");
 const api=fs.readFileSync(path.join(__dirname,"../supabase/functions/catalog-api/index.ts"),"utf8");
 assert.match(html,/id="loginForm"/);
 assert.match(html,/id="preview"/);
 assert.match(ui,/api\("bootstrap"\)/);
 assert.match(ui,/api\("importExcel",\{rows\}\)/);
 assert.match(ui,/core\.signature\(latest\)!==baseline/);
 assert.doesNotMatch(ui,/service_role|GOOGLE_API_KEY|localStorage|sessionStorage/);
 assert.match(api,/action === "exportSalesBackup"/);
 assert.match(api,/role !== "jefferson"\) return fail\("Solo administración puede respaldar ventas"/);
});
