"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const root=path.resolve(__dirname,"../web");
const w={};vm.runInNewContext(fs.readFileSync(path.join(root,"viewer-core.js"),"utf8"),{window:w});vm.runInNewContext(fs.readFileSync(path.join(root,"ventas/sales-catalog.js"),"utf8"),{window:w});
const core=w.NICOLE_SALES_CATALOG;
const fixtures=[{"source_id":"p50","source_kind":"excel","original_name":"Pon Pon 50 mm. -im","canonical_name":"pompon 50 mm.","category":"Pompones","variety":"Normal","provider":"IM","size_value":50,"presentation":"50 u.","cost":3.23,"tariffs":[{"label":"PxM.","value":4.2}],"search_text":"pompon 50 mm normal im 50 u","conflict":false},{"source_id":"p38","source_kind":"excel","original_name":"Pon Pon 38 mm. -im","canonical_name":"pompon 38 mm.","category":"Pompones","variety":"Normal","provider":"IM","size_value":38,"presentation":"50 u.","cost":1.91,"tariffs":[{"label":"PxM.","value":3}],"search_text":"pompon 38 mm normal im 50 u"},{"source_id":"f","source_kind":"excel","original_name":"Fleco oro 8 cm","canonical_name":"fleco oro 8 cm","category":"Flecos","variety":"Dorado","provider":"IM","size_value":8,"presentation":"10 m.","cost":5,"tariffs":[{"label":"x m.","value":1}],"search_text":"fleco oro dorado 8 cm"},{"source_id":"c","source_kind":"excel","original_name":"Cinta raso N° 4","canonical_name":"cinta raso n 4","category":"Cintas","variety":"Raso","provider":"IM","presentation":"50 y.","cost":null,"tariffs":[],"search_text":"cinta raso 4"}];
test("El catálogo inteligente separa medidas de cantidad y tolera errores en distintas familias",()=>{
 const cards=core.smartCards(fixtures);
 for(const [q,id] of [["pompn 50","p50"],["pon pon 38","p38"],["fleko","f"],["sintas","c"]])assert.equal(core.rank(cards,q)[0].id,id);
 assert.equal(core.rank(cards,"pompn 50").length,1);
});
test("El costo se conserva por presentación y no se inventan tarifas",()=>{
 const cards=core.smartCards(fixtures);
 assert.equal(cards[0].items[0].saleUnit,"paquete");
 assert.equal(cards[0].items[0].cost,3.23);
 assert.equal(cards[0].items[0].referencePrice,4.2);
 assert.equal(cards[2].items[0].comparableCost,null);
 assert.equal(cards[3].items[0].cost,null);
 assert.equal(cards[3].items[0].referencePrice,undefined);
});
