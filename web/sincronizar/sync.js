/* Nicole Encajes · módulo de sincronización de acceso público. */
"use strict";
(() => {
  const $=id=>document.getElementById(id);
  const core=window.NICOLE_SYNC;
  const url=String(window.ALMACEN_API_URL||"").trim().replace(/\/$/,"");
  let current=null,planned=null,baseline=null;
  const localDate=()=>{
    const parts=new Intl.DateTimeFormat("en-US",{
      year:"numeric",month:"2-digit",day:"2-digit",timeZone:"America/Guayaquil"
    }).formatToParts(new Date());
    const get=type=>parts.find(x=>x.type===type)?.value||"";
    return get("year")+"-"+get("month")+"-"+get("day");
  };
  const money=n=>new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"}).format(Number(n)||0);
  const note=(id,value,success=false)=>{
    $(id).textContent=value||"";
    $(id).className=success?"good":"error";
  };
  async function api(action,fields={}){
    if(!url)throw Error("Falta configurar la API de Supabase");
    const headers={"Content-Type":"application/json"};
    const protectedAction=new Set(["importExcel","importPricesExcel","importCommercialExcel","sheetStatus","sheetSearch","sheetProductGroups","sheetProductDetails","refreshSheetStagingManual","refreshSheetStaging","readSheetChanges","configureSheetBridge","probeSheetBridge"]).has(action);
    if(protectedAction)headers["x-almacen-key"]=await window.NICOLE_ADMIN.getToken();
    const res=await fetch(url,{method:"POST",headers,cache:"no-store",body:JSON.stringify({action,...fields})});
    const result=await res.json().catch(()=>({}));
    if(!res.ok||!result.ok){
      if(protectedAction && (res.status===401||res.status===403))window.NICOLE_ADMIN.clear();
      throw Error(result.error||"No fue posible conectar con Supabase");
    }
    return result;
  }
  async function refresh(){
    current=await api("syncSnapshot");
    $("productCount").textContent=String(current.products?.length||0);
    $("presentationCount").textContent=String(current.presentations?.length||0);
    return current;
  }
  function disabledPreview(){
    planned=null;baseline=null;$("results").hidden=true;$("apply").disabled=true;
  }
  $("sheetText").addEventListener("input",disabledPreview);
  $("clear").addEventListener("click",()=>{
    $("sheetText").value="";disabledPreview();note("previewError","");note("applyError","");
  });
  function renderPlan(result){
    $("previewRows").replaceChildren();
    for(const row of result.plan) {
      const tr=document.createElement("tr");
      const p=document.createElement("td");
      const bold=document.createElement("strong");bold.textContent=row.producto;p.append(bold);
      const small=document.createElement("span");small.className="small";small.textContent=row.codigo;p.append(small);
      const change=document.createElement("td"), badge=document.createElement("span");
      badge.className="status "+(row.operation==="CREAR"?"crear":row.operation==="ACTUALIZAR"?"actualizar":"igual");
      badge.textContent=row.operation;change.append(badge);
      const price=document.createElement("td");
      price.textContent=row.gross===null?"Sin actualizar":money(row.gross);
      if(row.oldGross!==null && row.gross!==null && row.oldGross!==row.gross){
        const old=document.createElement("small");old.className="small";old.textContent="Antes: "+money(row.oldGross);
        price.append(document.createElement("br"),old);
      }
      const detail=document.createElement("td");
      detail.textContent=row.presentacion+" · "+row.cantidad+" "+row.unidad+
        (row.costo===null?"":" · Costo "+money(row.costo));
      tr.append(p,change,price,detail);
      $("previewRows").append(tr);
    }
  }
  $("preview").addEventListener("click",async()=>{
    $("preview").disabled=true;note("previewError","");note("applyError","");
    disabledPreview();
    try{
      const data=await refresh();
      const parsed=core.parsePending($("sheetText").value,data.settings?.iva_rate??15);
      const plan=core.planRows(parsed,data);
      planned=plan;baseline=core.signature(data);
      $("results").hidden=false;
      renderPlan(plan);
      const created=plan.plan.filter(r=>r.operation==="CREAR").length;
      const changed=plan.plan.filter(r=>r.operation==="ACTUALIZAR").length;
      const same=plan.plan.filter(r=>r.operation==="SIN CAMBIOS").length;
      $("previewSummary").textContent="Autorizadas: "+plan.plan.length+
        " · Nuevos: "+created+" · Actualizaciones: "+changed+
        " · Sin cambios: "+same+" · Omitidas (NO): "+plan.ignored;
      $("apply").disabled=plan.errors.length>0||(created+changed)===0;
      if(plan.errors.length)note("previewError",plan.errors.join("\n"));
      else if(!plan.plan.length)note("previewError","Ninguna fila tiene Aplicar = SI. Marca SI en Google Sheets antes de volver a copiar.");
    }catch(e){note("previewError",e.message)}
    finally{$("preview").disabled=false;}
  });
  $("apply").addEventListener("click",async()=>{
    if(!planned||planned.errors.length||$("apply").disabled)return;
    const rows=core.importRows(planned.plan);
    if(!rows.length)return;
    if(!confirm("Se aplicarán "+rows.length+" cambios a Supabase. ¿Confirmas que los datos y precios fueron revisados?"))return;
    $("apply").disabled=true;note("applyError","");
    try{
      const latest=await api("syncSnapshot");
      if(core.signature(latest)!==baseline){
        disabledPreview();
        throw Error("Supabase cambió después de la vista previa. No se escribió nada. Vuelve a revisar las diferencias.");
      }
      const result=await api("importExcel",{rows});
      await refresh();
      disabledPreview();
      $("sheetText").value="";
      note("previewError","");
      note("backupStatus","Actualización confirmada: "+JSON.stringify(result.summary)+". Ya puedes generar un nuevo respaldo.",true);
      window.scrollTo({top:0,behavior:"smooth"});
    }catch(e){note("applyError",e.message)}
  });
  async function backUp(kind,copy){
    const status=$("backupStatus");
    status.textContent="Consultando datos actuales de Supabase...";
    for(const id of ["copyProducts","downloadProducts","copySales","downloadSales"]) $(id).disabled=true;
    try{
      let rows;
      if(kind==="productos"){
        const data=await refresh();
        rows=core.backupProducts(data,localDate());
      }else{
        const data=await api("exportSalesBackup");
        rows=core.backupSales(data.sales,localDate());
      }
      const text=core.tsv(rows);
      if(copy){
        if(!navigator.clipboard?.writeText)throw Error("Este navegador no permite copiar. Usa el botón Descargar.");
        await navigator.clipboard.writeText(text);
        status.textContent="Copiadas "+(rows.length-1)+" filas. Abre "+(kind==="productos"?"RESPALDO_PRODUCTOS":"RESPALDO_VENTAS")+
          " en Google Sheets, borra primero los datos anteriores y pega desde A1. La hoja privada no se modifica automáticamente.";
      }else{
        const blob=new Blob(["\ufeff"+text],{type:"text/tab-separated-values;charset=utf-8"});
        const href=URL.createObjectURL(blob);
        const link=document.createElement("a");
        link.href=href;link.download="Nicole_Encajes_Respaldo_"+kind+"_"+localDate()+".tsv";
        document.body.append(link);link.click();link.remove();
        setTimeout(()=>URL.revokeObjectURL(href),1000);
        status.textContent="Respaldo descargado ("+(rows.length-1)+" filas). Para reflejarlo en Google Sheets, importa el archivo en la pestaña correspondiente.";
      }
      status.className="good";
    }catch(e){status.textContent=e.message;status.className="error";}
    finally{for(const id of ["copyProducts","downloadProducts","copySales","downloadSales"]) $(id).disabled=false;}
  }
  $("copyProducts").addEventListener("click",()=>backUp("productos",true));
  $("downloadProducts").addEventListener("click",()=>backUp("productos",false));
  $("copySales").addEventListener("click",()=>backUp("ventas",true));
  $("downloadSales").addEventListener("click",()=>backUp("ventas",false));

  let reviewPage=0,reviewBusy=false,reviewGeneration=0;
  const refMoney=v=>typeof v==="number"&&Number.isFinite(v)?money(v):"—";
  async function showSheetStatus(){
    const info=$("sheet-info");info.textContent="Consultando Supabase…";
    const data=await api("sheetStatus");
    const last=data.last;
    info.textContent=data.total+" registros de referencia · "+data.categories.length+" categorías · "+(data.bridgeConfigured?"Puente configurado (probar para verificar)":"Google pendiente de autorizar")+(last?" · Última sincronización: "+new Date(last.started_at).toLocaleString("es-EC"):"");
    const select=$("sheet-category"),old=select.value;
    select.replaceChildren(new Option("Todas",""));data.categories.forEach(x=>select.add(new Option(x.name,x.name)));
    select.value=data.categories.some(x=>x.name===old)?old:"";
    $("sheet-review").hidden=false;reviewPage=0;await searchSheet();
  }

  let currentDraft=null;
  function rowDetails(x,withDraft=true){
    const v=x.raw_values||[], box=document.createElement("div");
    const heading=document.createElement("p");heading.textContent=[x.product_name,v[5],v[4]?"Proveedor "+v[4]:"",x.review_status].filter(Boolean).join(" · ");box.append(heading);
    for(const [label,i] of [["Nombre original",3],["Cantidad original",5],["Unidad",7],["Costo/base",15],["Neto original",9],["PxM original",10],["pxm original",11],["Tarifa adicional",20],["2026 (1)",37],["2026 (2)",38],["2025",39],["Actual",40],["Observaciones",17],["Origen",23],["Código original",35]]){
      if(v[i]!==""&&v[i]!=null){const p=document.createElement("p");p.textContent=label+": "+v[i];box.append(p)}
    }
    if(withDraft&&x.review_status!=="Sin precio válido"){const b=document.createElement("button");b.type="button";b.textContent="Preparar ficha comercial";b.onclick=()=>openDraft(x);box.append(b)}
    return box;
  }
  function openDraft(x){
    currentDraft=x;const v=x.raw_values||[];
    $("draft-source").textContent="Referencia: "+x.product_name+" · "+x.review_status+" · Neto: "+String(v[9]||"—")+" · PxM: "+String(v[10]||"—")+" · pxm: "+String(v[11]||"—");
    $("draft-name").value=x.product_name;$("draft-brand").value="";
    const cats=$("draft-category");cats.replaceChildren(...Array.from($("sheet-category").options).filter(o=>o.value).map(o=>new Option(o.text,o.value)));cats.value=x.category;
    $("draft-label").value=String(v[5]||"").slice(0,80);$("draft-quantity").value=typeof v[6]==="number"&&v[6]>0?v[6]:"";
    $("draft-unit").value=String(v[7]||"");$("draft-supplier").value="";
    $("draft-cost").value="";$("draft-price").value="";$("draft-result").textContent="";
    $("reference-draft").showModal();
  }
  $("draft-cancel").onclick=()=>$("reference-draft").close();
  $("reference-draft-form").onsubmit=async e=>{
    e.preventDefault();if(!currentDraft)return;
    $("draft-save").disabled=true;$("draft-result").textContent="Validando contra Supabase…";
    try{
      const fresh=await api("syncSnapshot"),raw={_fila:currentDraft.sheet_row,codigo:"",producto:$("draft-name").value,marca:$("draft-brand").value,categoria:$("draft-category").value,presentacion:$("draft-label").value,cantidad:$("draft-quantity").value,unidad:$("draft-unit").value,proveedor:$("draft-supplier").value,costo:$("draft-cost").value,precio:$("draft-price").value,pxm:"",precio_metro:""};
      if(!raw.costo&&!raw.precio)throw Error("Ingresa un costo confirmado o un precio confirmado.");
      const result=window.NICOLE_BULK.productPlan([raw],fresh,core);
      if(result.errors.length)throw Error(result.errors.join(" "));
      const plan=result.plan[0];if(!plan||plan.operation==="SIN CAMBIOS")throw Error("No hay cambios comerciales para guardar.");
      if(!plan.payload.codigo)plan.payload.codigo="REF-"+currentDraft.source_key;
      if(plan.payload.codigo.length>40)throw Error("Código de referencia fuera de límite.");
      if(!confirm(plan.operation+": "+plan.name+" / "+plan.label+" · Costo "+refMoney(plan.cost)+" · Precio "+refMoney(plan.price)+". ¿Confirmas los datos?"))return;
      const check=await api("syncSnapshot");if(core.signature(check)!==core.signature(fresh))throw Error("Los datos cambiaron. Revisa de nuevo.");
      await api("importCommercialExcel",{mode:"products",rows:[plan.payload]});
      $("reference-draft").close();await showSheetStatus();$("sheet-info").textContent+=" · Ficha comercial guardada.";
      await refresh();
    }catch(e){$("draft-result").textContent=e.message}finally{$("draft-save").disabled=false}
  };
  async function loadGroupDetails(x,box,page=0){
    box.textContent="Cargando presentaciones…";
    try{
      const d=await api("sheetProductDetails",{reference_id:x.reference_id,page});
      box.replaceChildren();for(const r of d.rows)box.append(rowDetails(r));
      if(page>0){const b=document.createElement("button");b.type="button";b.textContent="Anteriores";b.onclick=()=>loadGroupDetails(x,box,page-1);box.append(b)}
      if((page+1)*50<d.total){const b=document.createElement("button");b.type="button";b.textContent="Más presentaciones";b.onclick=()=>loadGroupDetails(x,box,page+1);box.append(b)}
    }catch(e){box.textContent=e.message;}
  }
  async function searchSheet(){
    const gen=++reviewGeneration,grouped=$("sheet-view").value==="products";
    const data=await api(grouped?"sheetProductGroups":"sheetSearch",{query:$("sheet-query").value,category:$("sheet-category").value,page:reviewPage});
    if(gen!==reviewGeneration)return;
    const table=$("sheet-rows");table.replaceChildren();
    $("sheet-table-head").replaceChildren(...(grouped?["Producto","Categoría","Registros","Preliminares","Estado"]:["Producto","Categoría","Costo ref.","Precio ref.","Estado"]).map(value=>{const th=document.createElement("th");th.textContent=value;return th}));
    for(const x of data.rows){
      const tr=document.createElement("tr"),v=x.raw_values||[];
      const values=grouped?[x.product_name,x.category,x.presentation_records,x.preliminary_records,x.conflicts?x.conflicts+" conflictos":x.no_price_records===x.presentation_records?"Sin precio":"Referencia"]: [x.product_name,x.category,refMoney(v[12]),refMoney(v[13]),x.review_status];
      for(const value of values){const td=document.createElement("td");td.textContent=value;tr.append(td)}
      const details=document.createElement("details"),summary=document.createElement("summary");summary.textContent=grouped?"Ver presentaciones":"Ver datos de referencia";details.append(summary);
      if(grouped){const box=document.createElement("div");details.append(box);let loaded=false;details.addEventListener("toggle",()=>{if(details.open&&!loaded){loaded=true;loadGroupDetails(x,box)}})}
      else details.append(rowDetails(x));
      tr.cells[0].append(details);table.append(tr);
    }
    $("sheet-result").textContent=data.total+(grouped?" grupos de referencia":" registros")+" · página "+(data.page+1);
    $("sheet-prev").disabled=data.page===0;$("sheet-next").disabled=(data.page+1)*50>=data.total;
  }
  function reviewError(e){$("sheet-info").textContent=e.message;}
  const bridgeMessage=v=>$("bridge-result").textContent=v;
  $("bridge-save").onclick=async()=>{
    const webhook=$("bridge-url").value.trim(),secret=$("bridge-secret").value.trim();
    if(!webhook||secret.length<32){bridgeMessage("Completa la URL y el secreto privado.");return;}
    $("bridge-save").disabled=true;bridgeMessage("Comprobando acceso a la hoja privada…");
    try{
      const r=await api("configureSheetBridge",{webhook,secret});
      $("bridge-secret").value="";bridgeMessage("Conexión verificada: "+r.rows+" registros y "+r.categories+" categorías.");
    }catch(e){$("bridge-secret").value="";bridgeMessage(e.message)}finally{$("bridge-save").disabled=false}
  };
  $("bridge-test").onclick=async()=>{
    $("bridge-test").disabled=true;bridgeMessage("Comprobando Google Sheets…");
    try{const r=await api("probeSheetBridge");bridgeMessage("Conexión verificada: "+r.rows+" registros y "+r.categories+" categorías.");}
    catch(e){bridgeMessage(e.message)}finally{$("bridge-test").disabled=false}
  };
  if(location.hash==="#google-bridge")$("google-bridge").open=true;
  $("sheet-status").onclick=()=>showSheetStatus().catch(reviewError);
  $("sheet-search").onclick=()=>{reviewPage=0;searchSheet().catch(reviewError)};
  $("sheet-category").onchange=()=>{reviewPage=0;searchSheet().catch(reviewError)};
  $("sheet-view").onchange=()=>{reviewPage=0;searchSheet().catch(reviewError)};
  $("sheet-prev").onclick=()=>{reviewPage=Math.max(0,reviewPage-1);searchSheet().catch(reviewError)};
  $("sheet-next").onclick=()=>{reviewPage++;searchSheet().catch(reviewError)};
  $("sheet-direct").onclick=async()=>{
    if(reviewBusy)return;
    if(!confirm("¿Sincronizar la hoja privada completa con Supabase? No se modifican los precios oficiales."))return;
    reviewBusy=true;$("sheet-direct").disabled=true;$("sheet-stage").disabled=true;
    try{
      $("sheet-info").textContent="Leyendo Google Sheets…";
      const r=await api("refreshSheetStaging");
      await showSheetStatus();
      $("sheet-info").textContent+=" · Nuevos: "+r.summary.new+" · Actualizados: "+r.summary.changed+" · Sin cambios: "+r.summary.unchanged;
    }catch(e){reviewError(e)}finally{reviewBusy=false;$("sheet-direct").disabled=false;$("sheet-stage").disabled=false}
  };
  $("sheet-read-changes").onclick=async()=>{
    $("sheet-read-changes").disabled=true;note("previewError","");
    try{
      const r=await api("readSheetChanges");
      const quote=v=>'"'+String(v??"").replace(/"/g,'""')+'"';
      $("sheetText").value=r.values.map(row=>Array.from({length:12},(_,i)=>quote(row[i])).join("\t")).join("\n");
      disabledPreview();$("preview").click();
    }catch(e){note("previewError",e.message)}finally{$("sheet-read-changes").disabled=false}
  };
  $("sheet-stage").onclick=async()=>{
    if(reviewBusy)return;
    try{
      const rows=core.parseDelimited($("sheet-source").value,"\t"),categories=core.parseDelimited($("sheet-categories").value,"\t");
      if(rows.length<2||categories.length<2)throw Error("Pega las dos tablas completas con encabezados.");
      if(!confirm("¿Actualizar "+(rows.length-1)+" registros de referencia en Supabase? No se modifican precios comerciales."))return;
      reviewBusy=true;$("sheet-stage").disabled=true;
      const r=await api("refreshSheetStagingManual",{rows,categories});
      $("sheet-source").value="";$("sheet-categories").value="";
      await showSheetStatus();$("sheet-info").textContent+=" · Nuevos: "+r.summary.new+" · Actualizados: "+r.summary.changed+" · Sin cambios: "+r.summary.unchanged;
    }catch(e){reviewError(e)}finally{reviewBusy=false;$("sheet-stage").disabled=false;}
  };

  refresh().catch(e=>note("backupStatus",e.message));
  $("sheetText").placeholder=core.HEADERS.join("\t")+"\n...";
})();
