"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
test("Pedidos: entrada protegida, operaciones independientes y datos sin caché local",()=>{
 const p=path.resolve(__dirname,"../web/edgar/pedidos");
 const h=fs.readFileSync(path.join(p,"index.html"),"utf8"),j=fs.readFileSync(path.join(p,"orders.js"),"utf8");
 assert.match(h,/id="edgar-protected" hidden data-scripts="\.\/edgar\/pedidos\/orders\.js/);
 assert.match(h,/id="o-form"/);assert.match(h,/id="o-pay-form"/);
 assert.doesNotMatch(h,/Módulo en preparación/);
 for(const name of ["edgar_order_catalog","edgar_customer_list","edgar_order_create","edgar_order_list","edgar_order_detail","edgar_order_update","edgar_order_pay"])assert.ok(j.includes(name));
 assert.match(j,/p_token:token/);assert.doesNotMatch(j,/localStorage|sessionStorage/);new vm.Script(j);
});