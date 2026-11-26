"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const S=require("../web/sheets-backup-core.js");

test("respaldo Edgar incluye exclusivamente filas verificables en Supabase",()=>{
  const data={products:[{id:"prod1",name:"Cinta 0",brand:"",category:"Cintas",active:true,updated_at:"2026-11-21"}],
    presentations:[{id:"pres1",product_id:"prod1",sku:"C-0",label:"Rollo",quantity:200,unit:"yardas",
      current_cost:2.125,updated_at:"2026-11-21"}],
    prices:[{presentation_id:"pres1",shop:"jefferson",price:10}],iva_rate:15};
  const options={assigned:{pres1:"Proveedor A"},options:[{
    id:"opt1",product:"Cinta 0",brand:"",source_label:"Pieza",label:"Docena",supplier:"Proveedor B",
    quantity:12,unit:"piezas",cost:2,gross:3.45,revision:2
  }]};
  const rows=S.backupRows(data,options,"2026-11-21");
  assert.equal(rows.length,3);
  assert.equal(rows[0].length,18);
  assert.deepEqual(rows.map(r=>r[0]),["Tipo registro","PRESENTACIÓN","OPCIÓN EDGAR"]);
  assert.equal(rows[1][1],"pres1");
  assert.equal(rows[1][8],"Proveedor A");
  assert.equal(rows[1][11],"2.1250");
  assert.equal(rows[1][12],"10.0000");
  assert.equal(rows[1][13],"11.50");
  assert.equal(rows[2][1],"opt1");
  assert.equal(rows[2][14],"Pieza");
  assert.equal(rows[2][12],"3.0000");
  assert.equal(rows[2][13],"3.45");
});
test("sin presentaciones no inventa filas de productos de la web",()=>{
  const rows=S.backupRows({products:[],presentations:[],prices:[]},{options:[]},"2026-11-21");
  assert.equal(rows.length,1);
});
test("TSV protege celdas frente a fórmulas y permite reemplazo íntegro",()=>{
  const x=S.asTSV([["Producto","Costo"],["=IMPORTXML('url')",1],["+Comienzo",2]]);
  assert.ok(x.includes("'=IMPORTXML"));
  assert.ok(x.includes("'+Comienzo"));
  assert.equal(x.split("\r\n").length,3);
});
test("panel de Edgar incluye botón y cuadro de Google Sheets; panel de Gloria no",()=>{
  const root=path.join(__dirname,"..","web");
  const edgar=fs.readFileSync(path.join(root,"edgar","productos","index.html"),"utf8");
  const viewer=fs.readFileSync(path.join(root,"edgar","productos","products.js"),"utf8");
  const gloria=fs.readFileSync(path.join(root,"index.html"),"utf8");
  assert.match(edgar,/id="sheets-sync-dialog"/);
  assert.match(edgar,/sheets-backup-core\.js/);
  assert.match(viewer,/data-act="sync-sheet"/);
  assert.match(viewer,/GOOGLE_NOT_CONNECTED/);
  assert.match(viewer,/sheets-sync-now/);
  assert.doesNotMatch(gloria,/sheets-sync-dialog/);
});
