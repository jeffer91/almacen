"use strict";
(()=>{
 const $=id=>document.getElementById(id), fmt=v=>"$"+Number(v||0).toFixed(2), round=v=>Math.round((v+Number.EPSILON)*100)/100, esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 let draft=null,lines=[],catalog=[],issuer=null,orderId=null,offset=0,total=0,busy=false,version=0;const revisions={},timers={};
 async function rpc(name,params={}){
  const token=window.NICOLE_EDGAR_SESSION?.getToken();if(!token)throw Error("Sesión no disponible. Recarga la página.");
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
  try{const r=await fetch(new URL("/rest/v1/rpc/"+name,window.ALMACEN_API_URL),{method:"POST",headers:{apikey:window.ALMACEN_PUBLIC_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_token:token,...params}),cache:"no-store",signal:ctrl.signal});const d=await r.json().catch(()=>null);if(!r.ok)throw Error(d?.message==="SESSION_INVALID"?"Sesión vencida. Recarga la página.":d?.message||"No se pudo completar la operación.");return d}finally{clearTimeout(timer)}
 }
 function say(id,s){$(id).textContent=s}
 function setBusy(v){busy=v;for(const id of ["i-save","i-new","i-cancel","i-import","i-add"])$(id).disabled=v}
 function today(){return new Intl.DateTimeFormat("en-CA",{timeZone:"America/Guayaquil",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
 function debounce(key,fn){clearTimeout(timers[key]);revisions[key]=(revisions[key]||0)+1;timers[key]=setTimeout(fn,300)}
 async function load(){
  const rev=++version;say("i-status","Consultando borradores…");
  try{const r=await rpc("edgar_invoice_draft_list",{p_query:$("i-search").value,p_offset:offset});if(rev!==version)return;total=Number(r.total);if(offset>=total&&offset){offset=Math.max(0,Math.floor((total-1)/50)*50);return load()}
   $("i-list").innerHTML=r.items.map(x=>'<tr><td>'+esc(x.customer)+'</td><td>'+esc(x.issue_date)+'</td><td>'+fmt(x.total)+'</td><td>Borrador</td><td><button data-edit="'+esc(x.id)+'" type="button">Editar</button> <button data-preview="'+esc(x.id)+'" type="button">Vista previa</button></td></tr>').join("");
   say("i-status",total?total+" borrador(es).":"No hay borradores.");say("i-page",total?(offset+1)+"–"+Math.min(offset+50,total)+" de "+total:"0");$("i-prev").disabled=offset===0;$("i-next").disabled=offset+50>=total;
  }catch(e){if(rev===version)say("i-status",e.message)}
 }
 async function customers(keep){
  const rev=revisions.c=(revisions.c||0)+1,select=$("i-customer"),old=keep||select.value;select.disabled=true;
  try{const r=await rpc("edgar_customer_list",{p_query:$("i-csearch").value,p_offset:0,p_limit:100,p_include_archived:false});if(rev!==revisions.c)return;let opts=r.items;if(draft?.buyer&&old===draft.customer_id&&!opts.some(c=>c.id===old))opts=[...opts,{id:old,name:draft.buyer.name,identification:draft.buyer.identification}];select.innerHTML='<option value="">Seleccionar</option>'+opts.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name+(c.identification?" · "+c.identification:""))+'</option>').join("");if(opts.some(c=>c.id===old))select.value=old;if(!opts.length)say("i-form-status","Registra un cliente activo primero.")}
  catch(e){if(rev===revisions.c)say("i-form-status",e.message)}finally{if(rev===revisions.c)select.disabled=false}
 }
 async function products(){
  const rev=revisions.p=(revisions.p||0)+1,select=$("i-product");select.disabled=true;
  try{const r=await rpc("edgar_order_catalog",{p_query:$("i-psearch").value});if(rev!==revisions.p)return;catalog=r;select.innerHTML='<option value="">Seleccionar</option>'+r.map((p,i)=>'<option value="'+i+'">'+esc(p.product_name+" · "+p.presentation)+'</option>').join("");select.value="";say("i-picker-status",r.length?"Selecciona un producto. Revisa código, precio sin IVA y tarifa.":"No hay coincidencias.")}
  catch(e){if(rev===revisions.p)say("i-picker-status",e.message)}finally{if(rev===revisions.p)select.disabled=false}
 }
 async function orders(){
  const rev=revisions.o=(revisions.o||0)+1,select=$("i-order");select.disabled=true;
  try{const r=await rpc("edgar_order_list",{p_query:$("i-osearch").value,p_status:"",p_offset:0});if(rev!==revisions.o)return;select.innerHTML='<option value="">Seleccionar</option>'+r.items.filter(o=>o.status!=="cancelled").map(o=>'<option value="'+esc(o.id)+'">#'+esc(o.number)+" · "+esc(o.customer_name)+" · "+fmt(o.total)+'</option>').join("");}
  catch(e){if(rev===revisions.o)say("i-form-status",e.message)}finally{if(rev===revisions.o)select.disabled=false}
 }
 const selected=()=> $("i-product").value===""?null:catalog[Number($("i-product").value)];
 function suggest(){const p=selected();$("i-code").value="";$("i-aux").value="";$("i-extra").value=p?.presentation||"";$("i-description").value=p?.product_name||"";$("i-net").value=p?.unit_price==null?"":String(Math.round(Number(p.unit_price)/(1+Number($("i-rate").value)/100)*1e6)/1e6)}
 const calc=l=>{const base=round(Number(l.quantity)*Number(l.unit_net))-Number(l.discount);return{base:round(base),tax:round(base*Number(l.rate)/100)}};
 function renderLines(){let st=0,tx=0; $("i-lines").innerHTML=lines.map((l,i)=>{const c=calc(l);st+=c.base;tx+=c.tax;return '<tr><td>'+esc(l.description)+'</td><td>'+esc(l.quantity)+'</td><td>'+esc(l.unit_net)+'</td><td>'+fmt(l.discount)+'</td><td>'+esc(l.rate)+' %</td><td>'+fmt(c.base)+'</td><td><button type="button" data-line="'+i+'">Quitar</button></td></tr>'}).join("");say("i-totals","Subtotal "+fmt(st)+" · IVA "+fmt(tx)+" · Total "+fmt(st+tx))}
 function add(){if(busy)return;const p=selected(),qty=Number($("i-qty").value),net=Number($("i-net").value),disc=Number($("i-discount").value||0),desc=$("i-description").value.trim();if(!p||!desc||!(qty>0)||qty>100000||$("i-net").value===""||!Number.isFinite(net)||net<0||net>1000000||disc<0||disc>round(qty*net)||lines.length>=100){say("i-picker-status","Revisa producto, cantidad, precio, descuento y descripción.");return}lines.push({source:p.source,catalog_id:p.catalog_id,code:$("i-code").value.trim(),aux:$("i-aux").value.trim(),description:desc,extra:$("i-extra").value.trim(),quantity:qty,unit_net:net,discount:disc,rate:Number($("i-rate").value)});renderLines();say("i-picker-status","Línea agregada.")}
 async function edit(d=null){
  if(busy)return;draft=d||{id:crypto.randomUUID()};lines=d?d.lines.map(l=>({...l})):[];orderId=d?.order_id||null;$("i-form").reset();$("i-date").value=d?.issue_date||today();$("i-payment").value=d?.payment_code||"01";$("i-editor").hidden=false;$("i-preview").hidden=true;say("i-title",d?"Editar borrador":"Nuevo borrador");say("i-form-status","");renderLines();await Promise.all([customers(d?.customer_id),products(),orders()]);$("i-editor").scrollIntoView({block:"start"})
 }
 async function importOrder(){
  if(busy||!$("i-order").value)return;if(lines.length&&!confirm("Reemplazar las líneas del borrador por las del pedido?"))return;setBusy(true);
  try{const o=await rpc("edgar_order_detail",{p_id:$("i-order").value});orderId=o.id;draft={...draft,customer_id:o.customer_id,buyer:{name:o.customer_name}};await customers(o.customer_id);lines=o.items.map(l=>({source:l.source,catalog_id:l.catalog_id,code:"",aux:"",description:l.product_name,extra:l.presentation+" · "+l.sale_unit,quantity:Number(l.quantity),unit_net:Math.round(Number(l.unit_price)/1.15*1e6)/1e6,discount:0,rate:15}));renderLines();say("i-form-status","Pedido cargado. Verifica códigos, tarifa y precios sin IVA; se asumió 15 % para la conversión preliminar.")}
  catch(e){say("i-form-status",e.message)}finally{setBusy(false)}
 }
 async function preview(d){
  if(!issuer)issuer=await rpc("edgar_invoice_issuer");$("i-ride").innerHTML=window.NICOLE_RIDE.build(d,issuer);$("i-preview").hidden=false;$("i-preview").scrollIntoView({block:"start"})
 }
 $("i-new").onclick=()=>edit();$("i-cancel").onclick=()=>{if(!busy)$("i-editor").hidden=true};$("i-close-preview").onclick=()=>{$("i-preview").hidden=true};$("i-print").onclick=()=>window.print();
 $("i-csearch").oninput=()=>debounce("c",()=>customers());$("i-psearch").oninput=()=>debounce("p",products);$("i-osearch").oninput=()=>debounce("o",orders);$("i-product").onchange=suggest;$("i-rate").onchange=suggest;$("i-add").onclick=add;$("i-import").onclick=importOrder;
 $("i-lines").onclick=e=>{const b=e.target.closest("[data-line]");if(b&&!busy){lines.splice(Number(b.dataset.line),1);renderLines()}};
 $("i-form").onsubmit=async e=>{e.preventDefault();if(busy||!draft)return;if(!lines.length||!$("i-customer").value){say("i-form-status","Selecciona cliente y agrega productos.");return}setBusy(true);try{const d=await rpc("edgar_invoice_draft_save",{p_draft:{id:draft.id,updated_at:draft.updated_at,customer_id:$("i-customer").value,issue_date:$("i-date").value,payment_code:$("i-payment").value,order_id:orderId,lines}});draft=d;lines=d.lines;renderLines();say("i-form-status","Borrador guardado. No se ha emitido factura.");offset=0;await load();await preview(d)}catch(e){say("i-form-status",e.message)}finally{setBusy(false)}};
 $("i-list").onclick=async e=>{const b=e.target.closest("[data-edit],[data-preview]");if(!b||busy)return;b.disabled=true;try{const d=await rpc("edgar_invoice_draft_get",{p_id:b.dataset.edit||b.dataset.preview});if(b.dataset.edit)await edit(d);else await preview(d)}catch(e){say("i-status",e.message)}finally{b.disabled=false}};
 $("i-search").oninput=()=>{offset=0;version++;debounce("s",load)};$("i-refresh").onclick=load;$("i-prev").onclick=()=>{offset=Math.max(0,offset-50);load()};$("i-next").onclick=()=>{if(offset+50<total){offset+=50;load()}};load();
})();
