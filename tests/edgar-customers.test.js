"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
test("Edgar: clientes requiere sesión y dispone de módulo independiente",()=>{
 const root=path.resolve(__dirname,"../web/edgar/clientes");
 const html=fs.readFileSync(path.join(root,"index.html"),"utf8"),js=fs.readFileSync(path.join(root,"customers.js"),"utf8");
 assert.match(html,/id="edgar-protected" hidden data-scripts="\.\/edgar\/clientes\/customers\.js/);
 assert.match(html,/id="customer-form"/);assert.match(html,/id="customer-search"/);
 assert.doesNotMatch(html,/Módulo en preparación/);
 assert.match(js,/NICOLE_EDGAR_SESSION\?\.getToken/);
 for(const rpc of ["edgar_customer_list","edgar_customer_save","edgar_customer_set_active"])assert.ok(js.includes(rpc));
 assert.doesNotMatch(js,/localStorage|sessionStorage/);new vm.Script(js);
});