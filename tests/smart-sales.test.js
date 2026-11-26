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

test("Selectores dependientes conservan la tarifa exacta de cada variedad y proveedor",()=>{
 const base={...fixtures[0],size_unit:"mm"};
 const records=[base,{...base,source_id:"p50s",original_name:"Pon Pon 50 mm Surt.",variety:"Surtido",cost:3.08,tariffs:[{label:"PxM.",value:4.5}]},{...base,source_id:"p50ic",provider:"IC",cost:3.1,tariffs:[{label:"PxM.",value:4.1}]},{...fixtures[1],size_unit:"mm"}];
 const choices=core.saleChoices(core.smartCards(records));
 assert.equal(choices.length,4);
 assert.equal(core.facetValues(choices,"variety").join("|"),"Normal|Surtido");
 const surt=core.filterChoices(choices,{variety:"Surtido"});
 assert.equal(core.facetValues(surt,"measure").join("|"),"50 mm");
 assert.equal(surt[0].item.referencePrice,4.5);
 assert.equal(surt[0].item.cost,3.08);
 const normal=core.filterChoices(choices,{variety:"Normal",measure:"50 mm"});
 assert.equal(core.facetValues(normal,"provider").join("|"),"IC|IM");
 assert.equal(core.filterChoices(normal,{provider:"IM"})[0].item.referencePrice,4.2);
 assert.equal(core.filterChoices(normal,{provider:"IC"})[0].item.referencePrice,4.1);
 assert.equal(core.filterChoices(choices,{variety:"Surtido",measure:"38 mm"}).length,0);
});
test("Las dos rutas de ventas muestran doce columnas, incluidas las variedades",()=>{
 for(const file of ["ventas/index.html","edgar/ventas/index.html"]){
  const html=fs.readFileSync(path.join(root,file),"utf8");
  assert.match(html,/<th>Variedad<\/th><th>Medida \/ presentación<\/th><th>Proveedor<\/th>/);
  assert.equal(html.match(/<thead><tr>(.*?)<\/tr><\/thead>/)[1].match(/<th>/g).length,12);
 }
 const js=fs.readFileSync(path.join(root,"ventas/sales.js"),"utf8");
 assert.equal(js.match(/row.innerHTML = '([^']+)'/)[1].match(/<td(?:\s|>)/g).length,12);
 assert.match(js,/product_name:row.exactChoice\?displayName\(row.exactChoice.card\)/);
});
