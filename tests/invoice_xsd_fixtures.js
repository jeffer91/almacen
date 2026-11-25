"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const window={};vm.runInNewContext(fs.readFileSync(path.resolve(__dirname,"../web/edgar/facturacion/xml-test.js"),"utf8"),{window});
const issuer={ruc:"1234567890001",legal_name:"EMISOR DE PRUEBA",trade_name:"LABORATORIO",matrix_line1:"Dirección matriz",branch_line1:"Dirección sucursal",accounting:"NO"};
const line={code:"001",aux:"",description:"SESGO RS18",extra:"Rollo & prueba",quantity:50,unit_net:1.827,discount:0,rate:15,base:91.35,tax:13.70};
const draft={buyer:{name:"Cliente <prueba>",identification_type:"cedula",identification:"1234567890",address:"Dirección de prueba",email:"prueba@example.invalid"},issue_date:"2026-11-25",payment_code:"01",lines:[line],subtotal:91.35,discount:0,tax:13.70,total:105.05};
const mixed={...draft,lines:[line,{...line,code:"002",quantity:1,unit_net:10,discount:0,rate:0,base:10,tax:0}],subtotal:101.35,total:115.05};
const discount={...draft,lines:[{...line,quantity:2,unit_net:10,discount:1,base:19,tax:2.85}],subtotal:19,discount:1,tax:2.85,total:21.85};
process.stdout.write(JSON.stringify([draft,mixed,discount].map((d,i)=>window.NICOLE_XML.build(d,issuer,{sequence:String(i+1).padStart(9,"0"),code:"12345678"}).xml)));
