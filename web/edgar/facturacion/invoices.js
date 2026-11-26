"use strict";
(()=>{
 const $=id=>document.getElementById(id),fmt=v=>new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"}).format(Number(v||0));
 const states={draft:"Borrador",pending:"Pendiente",submitted:"Transmitida",authorized:"Autorizada",rejected:"Rechazada",cancellation_requested:"Anulación solicitada",cancelled:"Anulada"};
 const adjustmentStates={requested:"Solicitada",submitted:"Transmitida",authorized:"Autorizada",rejected:"Rechazada"};
 let offset=0,total=0,revision=0,timer,report=null,previewed=null,issuer=null;
 async function rpc(name,params={}){
  const token=window.NICOLE_EDGAR_SESSION?.getToken();if(!token)throw Error("Sesión no disponible. Recarga la página.");
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),15000);
  try{const r=await fetch(new URL("/rest/v1/rpc/"+name,window.ALMACEN_API_URL),{method:"POST",headers:{apikey:window.ALMACEN_PUBLIC_KEY,"Content-Type":"application/json"},body:JSON.stringify({p_token:token,...params}),cache:"no-store",signal:ctrl.signal});const d=await r.json().catch(()=>null);if(!r.ok)throw Error(d?.message==="SESSION_INVALID"?"Sesión vencida. Recarga la página.":d?.message||"No se pudo completar la operación.");return d}finally{clearTimeout(timer)}
 }
 const say=(id,s)=>{$(id).textContent=s;};
 function panel(name){
  for(const el of document.querySelectorAll("[id^='panel-']"))el.hidden=el.id!=="panel-"+name;
  for(const b of document.querySelectorAll("[data-panel]"))b.setAttribute("aria-pressed",String(b.dataset.panel===name));
  $("i-preview").hidden=true;
 }
 function cell(tr,value){const td=tr.insertCell();td.textContent=value??"—";return td;}
 function empty(tbody,cols,label){const tr=tbody.insertRow(),td=cell(tr,label);td.colSpan=cols;}
 function kpis(id,items){const el=$(id);el.replaceChildren();for(const [label,value] of items){const box=document.createElement("div");box.className="inv-kpi";const title=document.createElement("small");title.textContent=label;const number=document.createElement("strong");number.textContent=value;box.append(title,number);el.append(box);}}
 function action(td,label,callback){const b=document.createElement("button");b.type="button";b.textContent=label;b.onclick=async()=>{b.disabled=true;try{await callback()}catch(e){say("i-status",e.message)}finally{b.disabled=false}};td.append(b);}
 function render(data){
  total=Number(data.total);report=data;
  const s=data.summary||{};
  kpis("i-kpis",[["Autorizadas vigentes",s.authorized||0],["Total autorizado",fmt(s.total)],["Borradores",s.drafts||0],["Pendientes / transmitidas",s.pending||0],["Rechazadas",s.rejected||0],["Anuladas",s.cancelled||0]]);
  kpis("i-report",[["Subtotal autorizado",fmt(s.subtotal)],["IVA autorizado",fmt(s.tax)],["Total autorizado",fmt(s.total)],["Notas de crédito autorizadas asociadas",fmt(data.credit_total)]]);
  $("i-export").disabled=false;
  const list=$("i-list");list.replaceChildren();
  for(const x of data.items||[]){
   const tr=list.insertRow();cell(tr,x.fiscal_number||"Borrador "+x.id.slice(0,8));cell(tr,x.issue_date);cell(tr,x.customer);cell(tr,fmt(x.subtotal));cell(tr,fmt(x.tax));cell(tr,fmt(x.total));
   const st=cell(tr,states[x.status]||"Estado desconocido");st.dataset.state=x.status;
   const td=tr.insertCell();action(td,x.status==="draft"?"Ver borrador":"Ver datos",async()=>{if(x.status!=="draft"){await openDocument(x.id);return;}await openDraft(x.id);});
   if(x.sale_id){const a=document.createElement("a");a.href="./edgar/ventas/?date="+encodeURIComponent(x.issue_date);a.textContent="Ventas del día";td.append(" ",a);}
   if(x.access_key){const a=document.createElement("a");a.href="https://www.sri.gob.ec/";a.target="_blank";a.rel="noopener noreferrer";a.textContent="Portal SRI";td.append(" ",a);}
  }
  if(!list.rows.length)empty(list,8,"No hay documentos para los filtros seleccionados.");
  for(const [id,kind,n] of [["i-cancellations","cancellation",4],["i-credits","credit_note",5]]){
   const tbody=$(id);tbody.replaceChildren();
   for(const a of (data.adjustments||[]).filter(x=>x.kind===kind)){const tr=tbody.insertRow();cell(tr,a.fiscal_number);cell(tr,String(a.created_at).slice(0,10));cell(tr,a.reason);if(kind==="credit_note")cell(tr,a.amount==null?"—":fmt(a.amount));cell(tr,adjustmentStates[a.status]||a.status);}
   if(!tbody.rows.length)empty(tbody,n,"No hay operaciones registradas.");
  }
  const sign=data.signing||{};
  say("i-signing-state","Proveedor: "+(sign.provider||"Security Data")+" · Firmador: "+(sign.signer_ready?"configurado":"no configurado")+" · SRI: "+(sign.sri_ready?"configurado":"sin conexión de emisión")+" · Vencimiento: "+(sign.valid_until?new Date(sign.valid_until).toLocaleDateString("es-EC"):"sin certificado registrado"));
  say("i-page",total?(offset+1)+"–"+Math.min(offset+50,total)+" de "+total:"0");$("i-prev").disabled=offset===0;$("i-next").disabled=offset+50>=total;
 }
 async function loadReadiness(rev){
  const labels={signer_ready:"Servicio privado de firma",certificate_current:"Vigencia del certificado",certificate_trust_verified:"Cadena de confianza",certificate_revocation_verified:"Estado de revocación",issuer_identity_verified:"Identidad del emisor",official_schema_verified:"XSD oficial verificado",provider_rule_verified:"Requisitos del proveedor",sequence_verified:"Secuencial fiscal conciliado",sri_ready:"Conexión con el SRI",certification_authorized:"Autorización en certificación",ride_verified:"PDF definitivo verificado",delivery_verified:"Entrega del comprobante",owner_release_approved:"Aprobación del titular"};
  try{
   const r=await rpc("edgar_invoice_readiness");if(rev!==revision)return;
   kpis("i-release-checks",Object.entries(labels).map(([key,label])=>[label,r[key]===true?"Verificado":"Pendiente"]));
   say("i-release-banner",r.production_enabled===true?"Requisitos de liberación registrados. La emisión requiere el servicio privado conectado.":"Modo borrador — sin validez tributaria. Emisión productiva bloqueada hasta superar todas las verificaciones.");
  }catch(e){if(rev!==revision)return;kpis("i-release-checks",[["Estado","No comprobado"]]);say("i-release-banner","No se pudo verificar el estado de producción. No emitir documentos fiscales.");}
 }
 async function load(){
  const rev=++revision;report=null;$("i-export").disabled=true;say("i-status","Consultando documentos…");
  try{const data=await rpc("edgar_invoice_management",{p_from:$("i-from").value,p_to:$("i-to").value,p_query:$("i-search").value,p_status:$("i-state").value,p_offset:offset});if(rev!==revision)return;render(data);say("i-status",total+" documento(s) encontrados.");await loadReadiness(rev);}catch(e){if(rev===revision)say("i-status",e.message);}
 }
 async function openDocument(id){
  const doc=await rpc("edgar_invoice_document_get",{p_draft_id:id});
  say("i-document-number",doc.fiscal_number||"Sin número fiscal");
  say("i-document-state",states[doc.status]||"Estado desconocido");
  say("i-document-key",doc.access_key||"No disponible");
  say("i-document-auth",doc.authorization_at?new Date(doc.authorization_at).toLocaleString("es-EC"):"No disponible");
  say("i-document-cancel",doc.cancelled_at?new Date(doc.cancelled_at).toLocaleString("es-EC"):"No disponible");
  const events=$("i-document-events");events.replaceChildren();
  for(const event of doc.events||[]){const li=document.createElement("li");li.textContent=event.event_type+" · "+new Date(event.occurred_at).toLocaleString("es-EC");events.append(li);}
  if(!events.children.length){const li=document.createElement("li");li.textContent="Sin eventos registrados.";events.append(li);}
  const b=$("i-document-xml");b.disabled=!doc.authorized_xml;b.onclick=()=>{if(doc.authorized_xml)download(doc.authorized_xml,"application/xml;charset=utf-8","Factura-"+(doc.access_key||id)+".xml");};
  $("i-document-dialog").showModal();
 }
 $("i-document-close").onclick=()=>{$("i-document-dialog").close();$("i-document-xml").onclick=null;};
 async function openDraft(id){
  const d=await rpc("edgar_invoice_draft_get",{p_id:id});if(!issuer)issuer=await rpc("edgar_invoice_issuer");
  previewed=null;$("i-preview").hidden=true;$("i-ride").replaceChildren();
  window.NICOLE_XML.build(d,issuer); // validate arithmetic, identification and XML fields before displaying the RIDE
  const markup=window.NICOLE_RIDE.build(d,issuer);$("i-ride").innerHTML=markup;previewed=d;say("i-xml-status","Validación interna superada. Documento de prueba sin autorización.");$("i-preview").hidden=false;$("i-preview").scrollIntoView({block:"start"});
 }
 $("i-close-preview").onclick=()=>{$("i-preview").hidden=true;};
 $("i-print").onclick=()=>{if(previewed&&!$("i-preview").hidden)window.print();};
 $("i-xml").onclick=async()=>{if(!previewed)return;const btn=$("i-xml");btn.disabled=true;try{
   const d=await rpc("edgar_invoice_draft_get",{p_id:previewed.id});if(d.updated_at!==previewed.updated_at)throw Error("El borrador cambió. Vuelve a abrir la vista previa.");
   if(!issuer)issuer=await rpc("edgar_invoice_issuer");window.NICOLE_XML.build(d,issuer);
   const n=await rpc("edgar_invoice_test_number",{p_id:d.id,p_updated_at:d.updated_at});if(n?.environment!=="1"||n.scope!=="laboratory_only")throw Error("Numeración de laboratorio inválida.");
   const result=window.NICOLE_XML.build(d,issuer,{sequence:n.sequence,code:n.code});
   if(new DOMParser().parseFromString(result.xml,"application/xml").querySelector("parsererror"))throw Error("XML mal formado.");
   download(result.xml,"application/xml;charset=utf-8","PRUEBA_LOCAL_NO_TRANSMITIR_"+result.sequence+".xml");
   say("i-xml-status","XML de laboratorio sin firma ni autorización. No transmitir.");
  }catch(e){say("i-xml-status",e.message)}finally{btn.disabled=false}};
 function download(content,type,name){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement("a");a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);}
 $("i-export").onclick=()=>{if(!report)return;const s=report.summary;const rows=[["Desde",$("i-from").value],["Hasta",$("i-to").value],["Busqueda",$("i-search").value],["Subtotal autorizado",s.subtotal],["IVA autorizado",s.tax],["Total autorizado",s.total],["Notas de credito autorizadas asociadas",report.credit_total],["Borradores",s.drafts],["Anuladas",s.cancelled]];const safe=v=>'"'+String(v??"").replace(/^[=+\-@\t\r]/,"'$&").replace(/"/g,'""')+'"';download("\uFEFF"+rows.map(x=>x.map(safe).join(";")).join("\r\n"),"text/csv;charset=utf-8","Nicole-Encajes-resumen-facturas.csv");};
 for(const b of document.querySelectorAll("[data-panel],[data-open]"))b.onclick=()=>panel(b.dataset.panel||b.dataset.open);
 const today=new Intl.DateTimeFormat("sv-SE",{timeZone:"America/Guayaquil",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
 $("i-from").value=today.slice(0,7)+"-01";$("i-to").value=today;
 $("i-refresh").onclick=()=>{offset=0;load();};$("i-prev").onclick=()=>{offset=Math.max(0,offset-50);load();};$("i-next").onclick=()=>{if(offset+50<total){offset+=50;load();}};
 for(const id of ["i-from","i-to","i-state"])$(id).onchange=()=>{offset=0;load();};
 $("i-search").oninput=()=>{offset=0;revision++;report=null;$("i-export").disabled=true;clearTimeout(timer);timer=setTimeout(load,250);};
 load();
 const linked=new URLSearchParams(location.search).get("draft");if(linked&&/^[a-f0-9-]{36}$/i.test(linked)){panel("history");openDraft(linked).catch(e=>say("i-status",e.message));}
})();