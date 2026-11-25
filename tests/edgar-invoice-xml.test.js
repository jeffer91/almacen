"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
test("XML de laboratorio: clave, precisión y restricciones",()=>{
 const window={};vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../web/edgar/facturacion/xml-test.js"),"utf8"),{window});
 const X=window.NICOLE_XML,issuer={ruc:"1234567890001",legal_name:"Emisor",matrix_line1:"Matriz & local",branch_line1:"Sucursal",accounting:"NO"},line={code:"001",description:"SESGO RS18",quantity:50,unit_net:1.827,discount:0,rate:15,base:91.35,tax:13.70},d={buyer:{name:"Cliente <prueba>",identification_type:"cedula",identification:"1234567890"},issue_date:"2026-11-25",payment_code:"01",lines:[line],subtotal:91.35,discount:0,tax:13.70,total:105.05};
 const r=X.build(d,issuer);assert.equal(r.key.length,49);assert.equal(r.key[23],"1");assert.equal(X.checkDigit(r.key.slice(0,-1)),r.key.slice(-1));
 for(const s of ["<ambiente>1</ambiente>","<precioUnitario>1.827000</precioUnitario>","<totalSinImpuestos>91.35</totalSinImpuestos>","<valor>13.70</valor>","<importeTotal>105.05</importeTotal>","Cliente &lt;prueba&gt;","NO TRANSMITIR"])assert.ok(r.xml.includes(s),s);
 for(const invalid of [{...d,total:105.04},{...d,buyer:{name:"Sin ID"}},{...d,lines:[{...line,code:""}]},{...d,issue_date:"2026-02-30"},{...d,lines:[{...line,tax:13.69}]}])assert.throws(()=>X.build(invalid,issuer));
 assert.equal(X.checkDigit("0".repeat(48)),"0");assert.equal(X.checkDigit("0".repeat(47)+"6"),"1");
});