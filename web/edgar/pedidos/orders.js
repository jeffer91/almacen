"use strict";
(()=>{
 const $=id=>document.getElementById(id), money=v=>"$"+Number(v||0).toFixed(2), round=v=>Math.round((v+Number.EPSILON)*100)/100;
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const labels={pending:"Pendiente",preparing:"En preparación",ready:"Listo para entregar",delivered:"Entregado",cancelled:"Cancelado"};
 let offset=0,total=0,rows=[],lines=[],catalog=[],detail=null,version=0,searchTimer,customerTimer,productTimer,customerVersion=0,productVersion=0,busy=false,createId=null,payId=null,paySignature="";
 async function rpc(name,params){
  const token=window.NICOLE_EDGAR_SESSION?.getToken();if(!token)throw Error("Sesión no disponible. Recarga la página.");
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
  try{const res=await fetch(new URL("/rest/v1/rpc/"+name,window.ALMACEN_API_URL),{method:"POST",headers:{apikey:window.ALMACEN_PUBLIC_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_token:token,...params}),cache:"no-store",signal:ctrl.signal});
   const data=await res.json().catch(()=>null);if(!res.ok)throw Error(data?.message==="SESSION_INVALID"?"Sesión vencida. Recarga la página.":data?.message||"No se pudo completar la operación.");return data;
  }finally{clearTimeout(timer)}
 }
 function setBusy(v){busy=v;for(const id of ["o-save","o-cancel","o-close","o-update","o-pay"])$(id).disabled=v; if(!v&&detail)applyDetailControls()}
 async function load(){
  const rev=++version;$("o-status").textContent="Consultando pedidos…";$("o-list").innerHTML="";
  try{const r=await rpc("edgar_order_list",{p_query:$("o-search").value,p_status:$("o-filter").value,p_offset:offset});if(rev!==version)return;rows=r.items;total=Number(r.total);if(offset>=total&&offset>0){offset=Math.max(0,Math.floor((total-1)/50)*50);return load()}
   $("o-list").innerHTML=rows.map(o=>'<tr><th scope="row">#'+esc(o.number)+'</th><td>'+esc(o.customer_name)+'</td><td>'+esc(o.delivery_date||"—")+'</td><td>'+esc(labels[o.status])+'</td><td>'+money(o.total)+'</td><td>'+money(o.paid)+'</td><td>'+money(Number(o.total)-Number(o.paid))+'</td><td><button type="button" data-id="'+esc(o.id)+'">Ver / gestionar</button></td></tr>').join("");
   $("o-status").textContent=total?total+" pedido(s) encontrado(s).":"No hay pedidos."; $("o-page").textContent=total?(offset+1)+"–"+Math.min(offset+rows.length,total)+" de "+total:"0 pedidos";$("o-prev").disabled=offset===0;$("o-next").disabled=offset+50>=total;
  }catch(e){if(rev===version){$("o-status").textContent=e.message;$("o-page").textContent="";$("o-prev").disabled=true;$("o-next").disabled=true}}
 }
 async function customers(){
  const rev=++customerVersion,select=$("o-customer"),old=select.value;select.disabled=true;
  try{const r=await rpc("edgar_customer_list",{p_query:$("o-csearch").value,p_offset:0,p_limit:100,p_include_archived:false});if(rev!==customerVersion)return;
   select.innerHTML='<option value="">Seleccionar cliente</option>'+r.items.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.name+(c.identification?" · "+c.identification:""))+'</option>').join("");if(r.items.some(c=>c.id===old))select.value=old;
   if(!r.items.length)$("o-form-status").textContent="No hay clientes activos. Registra uno primero.";else $("o-form-status").textContent=r.total>100?"Escribe el nombre para encontrar más clientes.":"";
  }catch(e){if(rev===customerVersion)$("o-form-status").textContent=e.message}
  finally{if(rev===customerVersion)select.disabled=false}
 }
 async function products(){
  const rev=++productVersion,select=$("o-product");select.disabled=true;$("o-picker-status").textContent="Consultando catálogo…";
  try{const r=await rpc("edgar_order_catalog",{p_query:$("o-psearch").value});if(rev!==productVersion)return;catalog=r;
   select.innerHTML='<option value="">Seleccionar producto</option>'+catalog.map((c,i)=>'<option value="'+i+'">'+esc(c.product_name+" · "+c.presentation+(c.unit_price==null?" · sin precio":" · "+money(c.unit_price)))+'</option>').join("");select.value="";chooseProduct();$("o-picker-status").textContent=catalog.length?"Selecciona la presentación. Puedes ajustar el precio acordado.":"No hay coincidencias.";
  }catch(e){if(rev===productVersion)$("o-picker-status").textContent=e.message}
  finally{if(rev===productVersion)select.disabled=false}
 }
 function selected(){const v=$("o-product").value;return v===""?null:catalog[Number(v)]}
 function chooseProduct(){const c=selected();$("o-unit").innerHTML='<option value="presentation">Presentación</option>'+(c?.meter_price!=null?'<option value="metro">Metro</option>':'');choosePrice()}
 function choosePrice(){const c=selected(),v=$("o-unit").value==="metro"?c?.meter_price:c?.unit_price;$("o-price").value=v==null?"":String(v)}
 const sum=()=>round(lines.reduce((s,i)=>s+round(i.quantity*i.unit_price),0));
 function renderLines(){
  $("o-lines").innerHTML=lines.map((i,n)=>'<tr><td>'+esc(i.product_name+" · "+i.presentation)+'</td><td>'+esc(i.unit_label)+'</td><td>'+esc(i.quantity)+'</td><td>'+money(i.unit_price)+'</td><td>'+money(round(i.quantity*i.unit_price))+'</td><td><button type="button" data-remove="'+n+'">Quitar</button></td></tr>').join("");
  $("o-total").textContent="Total: "+money(sum())+" · Saldo: "+money(Math.max(0,sum()-Number($("o-deposit").value||0)));
 }
 function openNew(){if(busy)return;lines=[];createId=crypto.randomUUID();$("o-form").reset();$("o-form-status").textContent="";renderLines();$("o-create").showModal();customers();products()}
 function add(){const c=selected(),q=Number($("o-qty").value),v=$("o-price").value,p=Number(v),u=$("o-unit").value;
  if(!c||!Number.isFinite(q)||q<=0||q>100000||v===""||!Number.isFinite(p)||p<0||p>1000000){$("o-picker-status").textContent="Selecciona un producto, cantidad y precio válidos.";return}
  if(lines.length>=100){$("o-picker-status").textContent="Máximo 100 líneas por pedido.";return}
  lines.push({source:c.source,catalog_id:c.catalog_id,product_name:c.product_name,presentation:c.presentation,unit_label:u==="metro"?"metro":c.sale_unit,sale_unit:u,quantity:q,unit_price:p});renderLines();$("o-picker-status").textContent="Producto agregado.";
 }
 function applyDetailControls(){const closed=["cancelled","delivered"].includes(detail.status);for(const id of ["o-edit-status","o-edit-delivery","o-edit-notes","o-update"])$(id).disabled=closed||busy;const payable=detail.status!=="cancelled"&&Number(detail.total)>Number(detail.paid);for(const id of ["o-pay-amount","o-pay-note","o-pay"])$(id).disabled=!payable||busy}
 function renderDetail(o){
  detail=o;$("o-detail-title").textContent="Pedido #"+o.number;$("o-detail-summary").textContent=o.customer_name+" · "+labels[o.status]+" · Total "+money(o.total)+" · Abonos "+money(o.paid)+" · Saldo "+money(Number(o.total)-Number(o.paid));
  $("o-detail-lines").innerHTML=o.items.map(i=>'<tr><td>'+esc(i.product_name+" · "+i.presentation)+'</td><td>'+esc(i.sale_unit)+'</td><td>'+esc(i.quantity)+'</td><td>'+money(i.unit_price)+'</td><td>'+money(i.line_total)+'</td></tr>').join("");
  $("o-payments").innerHTML=o.payments.length?o.payments.map(p=>'<p>'+money(p.amount)+' · '+esc(p.note||"Abono")+' · '+esc(new Date(p.created_at).toLocaleDateString("es-EC"))+'</p>').join(""):"<p>Sin abonos.</p>";
  $("o-edit-status").value=o.status;$("o-edit-delivery").value=o.delivery_date||"";$("o-edit-notes").value=o.notes||"";$("o-pay-amount").max=String(round(Number(o.total)-Number(o.paid)));applyDetailControls();
 }
 $("o-new").onclick=openNew;$("o-cancel").onclick=()=>{if(!busy)$("o-create").close()};$("o-close").onclick=()=>{if(!busy)$("o-detail").close()};
 for(const id of ["o-create","o-detail"])$(id).addEventListener("cancel",e=>{if(busy)e.preventDefault()});
 $("o-csearch").oninput=()=>{clearTimeout(customerTimer);customerVersion++;customerTimer=setTimeout(customers,300)};
 $("o-psearch").oninput=()=>{clearTimeout(productTimer);productVersion++;productTimer=setTimeout(products,300)};
 $("o-product").onchange=chooseProduct;$("o-unit").onchange=choosePrice;$("o-add").onclick=add;$("o-deposit").oninput=renderLines;
 $("o-lines").onclick=e=>{const b=e.target.closest("[data-remove]");if(b&&!busy){lines.splice(Number(b.dataset.remove),1);renderLines()}};
 $("o-form").onsubmit=async e=>{e.preventDefault();if(busy)return;const deposit=Number($("o-deposit").value||0);if(!lines.length||!$("o-customer").value||deposit<0||deposit>sum()){$("o-form-status").textContent="Selecciona cliente, productos y abono válido.";return}setBusy(true);$("o-form-status").textContent="Guardando pedido…";
  try{await rpc("edgar_order_create",{p_order:{id:createId,customer_id:$("o-customer").value,delivery_date:$("o-delivery").value,notes:$("o-notes").value,deposit,items:lines}});$("o-create").close();offset=0;await load();$("o-status").textContent="Pedido guardado. "+$("o-status").textContent}
  catch(e){$("o-form-status").textContent=e.message}finally{setBusy(false)}
 };
 $("o-list").onclick=async e=>{const b=e.target.closest("[data-id]");if(!b||busy)return;b.disabled=true;try{detail=await rpc("edgar_order_detail",{p_id:b.dataset.id});payId=null;paySignature="";$("o-pay-form").reset();$("o-detail-status").textContent="";renderDetail(detail);$("o-detail").showModal()}catch(e){$("o-status").textContent=e.message}finally{b.disabled=false}};
 $("o-update-form").onsubmit=async e=>{e.preventDefault();if(busy||!detail)return;const s=$("o-edit-status").value;if(["cancelled","delivered"].includes(s)&&!confirm("¿Confirmar estado "+labels[s]+"? El pedido quedará cerrado."))return;setBusy(true);try{renderDetail(await rpc("edgar_order_update",{p_id:detail.id,p_updated_at:detail.updated_at,p_status:s,p_delivery:$("o-edit-delivery").value||null,p_notes:$("o-edit-notes").value}));$("o-detail-status").textContent="Cambios guardados.";await load()}catch(e){$("o-detail-status").textContent=e.message}finally{setBusy(false)}};
 $("o-pay-form").onsubmit=async e=>{e.preventDefault();if(busy||!detail)return;const amount=Number($("o-pay-amount").value),note=$("o-pay-note").value;if(!(amount>0)||amount>round(Number(detail.total)-Number(detail.paid))){$("o-detail-status").textContent="El abono debe ser mayor a cero y no superar el saldo.";return}const sig=JSON.stringify([detail.id,amount,note]);if(!payId||sig!==paySignature){payId=crypto.randomUUID();paySignature=sig}setBusy(true);try{renderDetail(await rpc("edgar_order_pay",{p_id:detail.id,p_payment_id:payId,p_updated_at:detail.updated_at,p_amount:amount,p_note:note}));payId=null;paySignature="";$("o-pay-form").reset();$("o-detail-status").textContent="Abono registrado.";await load()}catch(e){$("o-detail-status").textContent=e.message}finally{setBusy(false)}};
 $("o-search").oninput=()=>{clearTimeout(searchTimer);offset=0;version++;searchTimer=setTimeout(load,300)};
 $("o-filter").onchange=()=>{offset=0;load()};$("o-refresh").onclick=load;$("o-prev").onclick=()=>{offset=Math.max(0,offset-50);load()};$("o-next").onclick=()=>{if(offset+50<total){offset+=50;load()}};load();
})();
