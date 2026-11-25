/* Edgar · gestión de clientes. Todos los RPC validan la sesión en el servidor. */
"use strict";
(()=>{
 const $=id=>document.getElementById(id), form=$("customer-form"), dialog=$("customer-dialog"), fields=form.elements, list=$("customer-rows"), status=$("customer-status"), note=$("customer-form-status");
 const PAGE=50, labels={none:"Sin identificación",cedula:"Cédula",ruc:"RUC",passport:"Pasaporte"};
 let offset=0,total=0,items=[],version=0,debounce,editing=null,saving=false;
 const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 async function rpc(name,fields){
  const token=window.NICOLE_EDGAR_SESSION?.getToken();
  if(!token)throw Error("Sesión no disponible. Recarga la página.");
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{
   const response=await fetch(new URL("/rest/v1/rpc/"+name,window.ALMACEN_API_URL),{method:"POST",headers:{apikey:window.ALMACEN_PUBLIC_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_token:token,...fields}),cache:"no-store",signal:controller.signal});
   const data=await response.json().catch(()=>null);
   if(!response.ok){if(data?.message==="SESSION_INVALID"||response.status===401||response.status===403)throw Error("Sesión vencida. Recarga la página para ingresar otra vez.");throw Error(data?.message||"No se pudo completar la operación.")}
   return data;
  }finally{clearTimeout(timer)}
 }
 function render(){
  list.innerHTML=items.map(c=>'<tr><th scope="row">'+esc(c.name)+(c.address?'<small>'+esc(c.address)+'</small>':'')+'</th><td>'+esc(c.identification?labels[c.identification_type]+' '+c.identification:"—")+'</td><td>'+esc(c.phone||"—")+'</td><td>'+esc(c.email||"—")+'</td><td>'+ (c.active?"Activo":"Archivado")+'</td><td><div class="customer-actions"><button type="button" data-action="edit" data-id="'+esc(c.id)+'">Editar</button><button type="button" data-action="archive" data-id="'+esc(c.id)+'">'+(c.active?"Archivar":"Restaurar")+'</button></div></td></tr>').join("");
  status.textContent=total?total+" cliente"+(total===1?"":"s")+" encontrado"+(total===1?"":"s")+".":"No hay clientes para mostrar.";
  $("customer-page").textContent=total?(offset+1)+"–"+Math.min(offset+items.length,total)+" de "+total:"0 clientes";
  $("customer-prev").disabled=offset<=0;$("customer-next").disabled=offset+PAGE>=total;
 }
 async function load(){
  const request=++version;status.textContent="Consultando clientes…";list.innerHTML="";$("customer-prev").disabled=true;$("customer-next").disabled=true;
  try{
   const result=await rpc("edgar_customer_list",{p_query:$("customer-search").value.trim(),p_offset:offset,p_limit:PAGE,p_include_archived:$("customer-archived").checked});
   if(request!==version)return;
   if(!Array.isArray(result?.items)||!Number.isFinite(Number(result.total)))throw Error("Respuesta de clientes inválida.");
   items=result.items;total=Number(result.total);
   if(offset>=total&&offset>0){offset=Math.max(0,Math.floor((total-1)/PAGE)*PAGE);return load()}
   render();
  }catch(e){if(request===version){items=[];list.innerHTML="";status.textContent=e.message||"No se pudo consultar";$("customer-page").textContent="";}}
 }
 function idType(){
  const type=fields.identification_type.value, input=fields.identification;
  input.disabled=type==="none";input.required=type!=="none";
  input.inputMode=type==="cedula"||type==="ruc"?"numeric":"text";
  input.pattern=type==="cedula"?"[0-9]{10}":type==="ruc"?"[0-9]{13}":type==="passport"?"[A-Za-z0-9\\-]{1,30}":".*";
  input.title=type==="cedula"?"10 dígitos":type==="ruc"?"13 dígitos":type==="passport"?"Letras, números y guiones":"";
  if(type==="none")input.value="";
 }
 function open(c){
  if(saving)return;editing=c||null;form.reset();note.textContent="";
  for(const k of ["name","identification_type","identification","phone","email","address","notes"])if(c)fields[k].value=c[k]??"";
  idType();$("customer-title").textContent=c?"Editar cliente":"Nuevo cliente";dialog.showModal();fields.name.focus();
 }
 fields.identification_type.addEventListener("change",idType);
 $("customer-new").addEventListener("click",()=>open(null));
 $("customer-cancel").addEventListener("click",()=>{if(!saving)dialog.close()});
 dialog.addEventListener("cancel",e=>{if(saving)e.preventDefault()});
 form.addEventListener("submit",async e=>{
  e.preventDefault();if(saving)return;
  saving=true;$("customer-save").disabled=true;$("customer-cancel").disabled=true;note.textContent="Guardando…";
  try{
   const customer={};for(const k of ["name","identification_type","identification","phone","email","address","notes"])customer[k]=fields[k].value.trim();
   if(editing){customer.id=editing.id;customer.updated_at=editing.updated_at}
   await rpc("edgar_customer_save",{p_customer:customer});dialog.close();offset=0;await load();status.textContent="Cliente guardado. "+status.textContent;
  }catch(e){note.textContent=e.message||"No se pudo guardar"}
  finally{saving=false;$("customer-save").disabled=false;$("customer-cancel").disabled=false}
 });
 list.addEventListener("click",async e=>{
  const button=e.target.closest("[data-action]");if(!button)return;
  const c=items.find(x=>x.id===button.dataset.id);if(!c)return;
  if(button.dataset.action==="edit"){open(c);return}
  if(button.dataset.action!=="archive"||!confirm((c.active?"Archivar":"Restaurar")+" a "+c.name+"?"))return;
  button.disabled=true;try{await rpc("edgar_customer_set_active",{p_id:c.id,p_active:!c.active,p_updated_at:c.updated_at});await load()}catch(e){status.textContent=e.message;button.disabled=false}
 });
 $("customer-search").addEventListener("input",()=>{clearTimeout(debounce);offset=0;version++;debounce=setTimeout(load,300)});
 $("customer-archived").addEventListener("change",()=>{offset=0;load()});
 $("customer-refresh").addEventListener("click",()=>load());
 $("customer-prev").addEventListener("click",()=>{offset=Math.max(0,offset-PAGE);load()});
 $("customer-next").addEventListener("click",()=>{if(offset+PAGE<total){offset+=PAGE;load()}});
 load();
})();
