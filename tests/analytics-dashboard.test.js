"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),core=require("../web/administrador/analytics-core.js");
const row=(product_name,unit,quantity,total,sale_date="2026-11-24",voided_at=null)=>({product_name,unit,quantity,total,sale_date,voided_at,payment_method:"efectivo"});
test("Agrupa nombres, separa unidades y excluye anulaciones",()=>{const a=core.analyze([row("Cínta","metro",2,5.25),row("cinta","rollo",1,12),row("Cinta","metro",2,4,"2026-11-24","2026-11-24"),row("Botón","unidad",3,1.50)]);assert.equal(a.revenue,1875);assert.equal(a.records,3);assert.equal(a.voided,1);assert.equal(a.unique,2);assert.equal(a.products[0].units.metro,2);assert.equal(a.products[0].units.rollo,1);assert.equal(a.average,625)});
test("Filtros inclusivos por fecha, unidad y búsqueda",()=>{const a=core.analyze([row("Botón","unidad",3,1.50,"2026-11-22"),row("Botón","unidad",1,0.50),row("Botón","rollo",1,10)],{from:"2026-11-23",to:"2026-11-24",unit:"unidad",search:"boton"});assert.equal(a.revenue,50);assert.equal(a.records,1)});
test("Periodo anterior de igual duración",()=>assert.deepEqual(core.previous("2026-11-01","2026-11-07"),{from:"2026-10-25",to:"2026-10-31"}));
test("No inventa indicadores y protege fórmulas CSV",()=>{assert.equal(core.analyze([]).revenue,0);assert.ok(core.csv([["=1+2"]]).includes("'=1+2"))});
