"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
test("Facturación: borrador privado, formato A4 y valores de referencia",()=>{
 const root=path.resolve(__dirname,"../web/edgar/facturacion"),read=p=>fs.readFileSync(path.join(root,p),"utf8"),win={};
 const html=read("index.html"),js=read("invoices.js"),ride=read("ride.js");
 assert.match(html,/id="edgar-protected" hidden/);assert.match(html,/sin validez tributaria/);assert.match(js,/p_token:token/);assert.doesNotMatch(js,/localStorage|sessionStorage/);
 new vm.Script(js);vm.runInNewContext(ride,{window:win});
 const l={description:"SESGO RS18",code:"001",quantity:50,unit_net:1.827,discount:0,rate:15,base:91.35},d={buyer:{name:"Cliente <prueba>"},issue_date:"2026-11-25",payment_code:"01",lines:[l],subtotal:91.35,discount:0,tax:13.70,total:105.05};
 const issuer={trade_name:"NICOLE ENCAJES"};
 const svg=win.NICOLE_RIDE.build(d,issuer);
 for(const x of ["91.35","13.70","105.05","1.827","SIN NUMERACIÓN FISCAL","SIN VALIDEZ TRIBUTARIA","Cliente &lt;prueba&gt;","logo-ride.svg","Precio Unitario"])assert.ok(svg.includes(x),x);
 assert.ok((win.NICOLE_RIDE.build({...d,lines:Array(16).fill(l)},issuer).match(/class="ride-sheet"/g)||[]).length>1);
 assert.match(read("invoices.css"),/@page\{size:A4 portrait/);
});