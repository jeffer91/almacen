"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"../web");
test("Edgar: el PIN protege las siete rutas y los scripts se cargan tras validar",()=>{
 for(const p of ["edgar","edgar/precios","edgar/productos","edgar/clientes","edgar/pedidos","edgar/facturacion","edgar/ventas"]){
  const s=fs.readFileSync(path.join(root,p,"index.html"),"utf8");
  assert.match(s,/id="edgar-protected" hidden/);assert.match(s,/edgar\/auth\.js/);assert.match(s,/id="edgar-pin-form"/);
  assert.doesNotMatch(s,/<script src="[^"]+(prices|products|sales)\.js/);
 }
 const s=fs.readFileSync(path.join(root,"edgar/auth.js"),"utf8");
 new vm.Script(s);assert.match(s,/edgar_pin_validate/);assert.match(s,/edgar_pin_logout/);assert.match(s,/localStorage/);
});
