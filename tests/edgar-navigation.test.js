"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const web=path.resolve(__dirname,"../web");
const pages=["edgar","edgar/precios","edgar/productos","edgar/facturacion","edgar/clientes","edgar/pedidos","edgar/ventas"];
test("Edgar: navegación estática y destinos existentes",()=>{
 for(const page of pages){
  const html=fs.readFileSync(path.join(web,page,"index.html"),"utf8");
  assert.match(html,/aria-label="Menú comercial de Edgar"/);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  const prefix="./";
  for(const dest of pages){assert.ok(html.includes('href="'+prefix+dest+'/"'),page+" -> "+dest);assert.ok(fs.existsSync(path.join(web,dest,"index.html")));}
  if(page.startsWith("edgar/"))assert.match(html,/<base href="..\/..\/">/);
 }
});
test("Edgar: no se simula la funcionalidad pendiente",()=>{
 for(const page of ["edgar/facturacion","edgar/clientes","edgar/pedidos"]){const html=fs.readFileSync(path.join(web,page,"index.html"),"utf8");assert.match(html,/Módulo en preparación/);assert.match(html,/data-scripts=""/);}
 const html=fs.readFileSync(path.join(web,"edgar","index.html"),"utf8");assert.match(html,/data-scripts=""/);
});
test("Edgar: se conserva el catálogo editable y el registro de ventas",()=>{
 const products=fs.readFileSync(path.join(web,"edgar/productos/index.html"),"utf8");
 assert.match(products,/id="price-editor"/);assert.match(products,/id="new-product-form"/);assert.match(products,/edgar\/access\.js/);
 const prices=fs.readFileSync(path.join(web,"edgar/precios/index.html"),"utf8");assert.doesNotMatch(prices,/id="price-editor"/);
 const sales=fs.readFileSync(path.join(web,"ventas/index.html"),"utf8");assert.match(sales,/id="saleForm"/);assert.match(sales,/sales\.js/);
});
