"use strict";
(function(scope){
const norm=v=>String(v??"").trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ");
const exact=v=>String(v??"").trim().toLowerCase();
const blank=v=>v===null||v===undefined||String(v).trim()==="";
const round4=n=>Math.round((n+Number.EPSILON)*10000)/10000;
const round2=n=>Math.round((n+Number.EPSILON)*100)/100;
const PRICE_HEADERS=["ID presentación","Código","Producto","Marca","Categoría","Presentación","Precio actual con IVA","Nuevo precio con IVA","Nuevo precio sin IVA"];
const PRICE_FIELDS=["id","codigo","producto","marca","categoria","presentacion","actual","bruto","neto"];
function priceRows(snapshot,category=""){const p=new Map((snapshot.products||[]).filter(x=>x.active!==false&&(!category||x.category===category)).map(x=>[x.id,x]));const prices=new Map((snapshot.prices||[]).filter(x=>x.shop==="jefferson").map(x=>[x.presentation_id,Number(x.price)]));const rate=1+Number(snapshot.settings?.iva_rate??15)/100;
return (snapshot.presentations||[]).filter(r=>p.has(r.product_id)).map(r=>{const x=p.get(r.product_id);return [r.id,r.sku||"",x.name,x.brand||"",x.category||"",r.label,prices.has(r.id)?round2(prices.get(r.id)*rate):"","",""]}).sort((a,b)=>String(a[4]).localeCompare(String(b[4]),"es")||String(a[2]).localeCompare(String(b[2]),"es")||String(a[5]).localeCompare(String(b[5]),"es"))}
function pricePlan(rows,snapshot,amount){
const rate=1+Number(snapshot.settings?.iva_rate??15)/100,errors=[],plan=[],seen=new Set();if(!Number.isFinite(rate)||rate<1||rate>1.5)throw Error("IVA inválido");
const products=new Map((snapshot.products||[]).filter(x=>x.active!==false).map(x=>[x.id,x]));const presentations=new Map((snapshot.presentations||[]).map(x=>[x.id,x]));const old=new Map((snapshot.prices||[]).filter(x=>x.shop==="jefferson").map(x=>[x.presentation_id,Number(x.price)]));let ignored=0;
for(const r of rows){const line="Fila "+r._fila+": ";if(blank(r.bruto)&&blank(r.neto)){ignored++;continue}const id=String(r.id||"").trim(),pres=presentations.get(id),p=pres&&products.get(pres.product_id);if(!p){errors.push(line+"ID inexistente o producto archivado.");continue}if(seen.has(id)){errors.push(line+"Presentación repetida.");continue}seen.add(id);
if(exact(r.producto)!==exact(p.name)||exact(r.marca)!==exact(p.brand)||exact(r.presentacion)!==exact(pres.label)||exact(r.codigo)!==exact(pres.sku)||exact(r.categoria)!==exact(p.category)){errors.push(line+"La identidad del producto cambió. Descarga una plantilla nueva.");continue}
const gross=amount(r.bruto),net=amount(r.neto);if(Number.isNaN(gross)||Number.isNaN(net)){errors.push(line+"Precio inválido.");continue}if(gross!==null&&net!==null&&Math.abs(round2(net*rate)-gross)>0.01000001){errors.push(line+"Precios con y sin IVA incompatibles.");continue}
const previous=old.has(id)?old.get(id):null,newNet=net!==null?round4(net):round4(gross/rate);
const expectedGross=previous===null?"":round2(previous*rate);if(blank(r.actual)!==blank(expectedGross)||(!blank(r.actual)&&Math.abs(Number(r.actual)-expectedGross)>0.00001)){errors.push(line+"El precio actual ya cambió. Descarga una plantilla nueva.");continue}
plan.push({line:r._fila,id,name:p.name,label:pres.label,previous,gross:round2(newNet*rate),net:newNet,operation:previous===null?"NUEVO PRECIO":Math.abs(previous-newNet)<0.00005?"SIN CAMBIOS":"ACTUALIZAR PRECIO"});
}return {plan,errors,ignored};
}
function productPlan(rows,snapshot,sync){
const errors=[],plan=[],seenSku=new Set(),seenIdentity=new Set(),products=snapshot.products||[],presentations=snapshot.presentations||[],prices=snapshot.prices||[],rate=1+Number(snapshot.settings?.iva_rate??15)/100;if(!Number.isFinite(rate)||rate<1||rate>1.5)throw Error("IVA inválido");
for(const raw of rows){const line="Fila "+raw._fila+": ",r=Object.fromEntries(["codigo","producto","marca","categoria","presentacion","cantidad","unidad","proveedor","costo","precio_sin_iva","precio_con_iva"].map(k=>[k,String(raw[k]??"").trim()]));
const q=sync.amount(r.cantidad,{blank:false,zero:false}),cost=sync.amount(r.costo),gross=sync.amount(r.precio_con_iva),net=sync.amount(r.precio_sin_iva);
if(!r.codigo||r.codigo.length>40||!r.producto||r.producto.length>180||!r.categoria||r.categoria.length>100||!r.presentacion||r.presentacion.length>80||!r.unidad||r.unidad.length>40||r.marca.length>100||r.proveedor.length>160){errors.push(line+"Código, producto, categoría, presentación y unidad son obligatorios; revisa la longitud.");continue}
if(!Number.isFinite(q)||Number.isNaN(cost)||Number.isNaN(gross)||Number.isNaN(net)){errors.push(line+"Cantidad, costo o precio inválido.");continue}if(net!==null&&gross!==null&&Math.abs(round2(net*rate)-gross)>0.01000001){errors.push(line+"Precios con y sin IVA incompatibles.");continue}
const sku=norm(r.codigo),identity=[r.producto,r.marca,r.presentacion].map(norm).join("|");if(seenSku.has(sku)||seenIdentity.has(identity)){errors.push(line+"Código o presentación repetida en el archivo.");continue}seenSku.add(sku);seenIdentity.add(identity);
const bySku=presentations.filter(x=>x.sku&&norm(x.sku)===sku),matches=products.filter(x=>norm(x.name)===norm(r.producto)&&norm(x.brand)===norm(r.marca));if(bySku.length>1||matches.length>1){errors.push(line+"Identidad ambigua en Supabase.");continue}
let p=matches[0],pres=bySku[0];if(p&&p.active===false){errors.push(line+"El producto está archivado.");continue}
if(p&&(exact(p.name)!==exact(r.producto)||exact(p.brand)!==exact(r.marca))){errors.push(line+"Usa el nombre y marca exactos del catálogo para evitar duplicados.");continue}
if(pres&&(!p||pres.product_id!==p.id||exact(pres.sku)!==exact(r.codigo)||exact(pres.label)!==exact(r.presentacion))){errors.push(line+"El código corresponde a otro producto o presentación; no se renombra por importación.");continue}
if(p){const others=presentations.filter(x=>x.product_id===p.id&&norm(x.label)===norm(r.presentacion));if(others.length>1||others.some(x=>exact(x.label)!==exact(r.presentacion)||x.sku&&exact(x.sku)!==exact(r.codigo))){errors.push(line+"La presentación existe con otra identidad o SKU.");continue}if(!pres)pres=others[0]}
const newNet=net!==null?round4(net):gross!==null?round4(gross/rate):null,old=pres?prices.find(x=>x.presentation_id===pres.id&&x.shop==="jefferson"):null,previous=old?Number(old.price):null;
const changed=pres&&(!pres.sku||Number(pres.quantity)!==q||exact(pres.unit)!==exact(r.unidad)||exact(p.category)!==exact(r.categoria)||r.proveedor||cost!==null&&(pres.current_cost===null||pres.current_cost===undefined||Number(pres.current_cost)!==cost)||newNet!==null&&(previous===null||Math.abs(previous-newNet)>0.00005));
plan.push({line:raw._fila,name:r.producto,label:r.presentacion,previous,gross:newNet===null?null:round2(newNet*rate),net:newNet,operation:!pres?(!p?"NUEVO PRODUCTO":"NUEVA PRESENTACIÓN"):changed?"ACTUALIZAR":"SIN CAMBIOS",payload:{codigo:r.codigo,producto:p?p.name:r.producto,marca:p?p.brand||"":r.marca,categoria:r.categoria,presentacion:pres?pres.label:r.presentacion,cantidad:String(q),unidad:r.unidad,proveedor:r.proveedor,costo:cost===null?"":String(cost),precio:newNet===null?"":newNet.toFixed(4)}});
}return {plan,errors,ignored:0};
}
const api={PRICE_HEADERS,PRICE_FIELDS,priceRows,pricePlan,productPlan};if(typeof module!=="undefined"&&module.exports)module.exports=api;if(scope)scope.NICOLE_BULK=api;
})(typeof window!=="undefined"?window:null);
