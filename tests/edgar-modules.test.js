"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const web=path.resolve(__dirname,"../web");
const read=p=>fs.readFileSync(path.join(web,p),"utf8");
test("Edgar: consulta y edición tienen entradas independientes",()=>{
 const p=read("edgar/precios/index.html"), e=read("edgar/productos/index.html");
 assert.match(p,/edgar\/precios\/prices\.js/);assert.match(e,/edgar\/productos\/products\.js/);
 assert.doesNotMatch(p,/viewer\.js|access\.js|price-editor|sheets-backup-core/);
 assert.doesNotMatch(e,/src="\.\/viewer\.js/);
 const s=read("edgar/precios/prices.js");
 assert.doesNotMatch(s,/uploadPhoto|openEditor|EDGAR_EDIT_DEVICE|new-product|sync-sheet/);
 new vm.Script(s);new vm.Script(read("edgar/productos/products.js"));
});
test("Edgar: la consulta sigue mostrando el catálogo oficial si falla la lista de opciones",async()=>{
 const root={innerHTML:"",addEventListener(){}};
 const doc={hidden:false,activeElement:null,getElementById:id=>id==="app"?root:null,addEventListener(){}};
 const calls=[],cache=new Map();
 const data={ok:true,products:[{id:"p",name:"Cinta prueba",category:"Cintas"}],presentations:[{id:"x",product_id:"p",label:"Rollo",quantity:1,unit:"unidad",current_cost:1}],prices:[{presentation_id:"x",shop:"jefferson",price:2}],photos:[],iva_rate:15};
 const ctx={document:doc,window:{NICOLE_VIEW:require("../web/viewer-core.js"),ALMACEN_API_URL:"https://example.invalid/functions/v1/catalog-api",ALMACEN_PUBLIC_KEY:"test",setInterval(){}},localStorage:{getItem:k=>cache.get(k),setItem:(k,v)=>cache.set(k,v)},URL,AbortController,setTimeout,clearTimeout,fetch:async(url,opts)=>{calls.push(JSON.parse(opts.body));if(String(url).includes("/rpc/"))throw Error("RPC caído");return{ok:true,json:async()=>data}}};
 vm.runInNewContext(read("edgar/precios/prices.js"),ctx);
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(root.innerHTML,/Cinta prueba/);assert.match(root.innerHTML,/\$2\.30/);assert.match(root.innerHTML,/No se pudieron actualizar las presentaciones/);assert.equal(calls.length,2);assert.equal(calls[0].action,"catalog");assert.equal(calls[1].device,"");
});
