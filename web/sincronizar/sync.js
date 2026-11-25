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
    const protectedAction=new Set(["importExcel","importPricesExcel","importCommercialExcel","sheetStatus","sheetSearch","refreshSheetStagingManual"]).has(action);
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
    info.textContent=data.total+" registros de referencia · "+data.categories.length+" categorías"+(last?" · Última sincronización: "+new Date(last.started_at).toLocaleString("es-EC"):"");
    const select=$("sheet-category"),old=select.value;
    select.replaceChildren(new Option("Todas",""));data.categories.forEach(x=>select.add(new Option(x.name,x.name)));
    select.value=data.categories.some(x=>x.name===old)?old:"";
    $("sheet-review").hidden=false;reviewPage=0;await searchSheet();
  }
  async function searchSheet(){
    const gen=++reviewGeneration;
    const data=await api("sheetSearch",{query:$("sheet-query").value,category:$("sheet-category").value,page:reviewPage});
    if(gen!==reviewGeneration)return;
    $("sheet-rows").replaceChildren();
    for(const x of data.rows){const tr=document.createElement("tr");const values=[x.product_name,x.category,refMoney(x.raw_values?.[12]),refMoney(x.raw_values?.[13]),x.review_status+(x.decision&&x.decision!=="Pendiente"?" · "+x.decision:"")];for(const v of values){const td=document.createElement("td");td.textContent=v;tr.append(td)}$("sheet-rows").append(tr)}
    $("sheet-result").textContent=data.total+" resultados · página "+(data.page+1);
    $("sheet-prev").disabled=data.page===0;$("sheet-next").disabled=(data.page+1)*50>=data.total;
  }
  function reviewError(e){$("sheet-info").textContent=e.message;}
  $("sheet-status").onclick=()=>showSheetStatus().catch(reviewError);
  $("sheet-search").onclick=()=>{reviewPage=0;searchSheet().catch(reviewError)};
  $("sheet-category").onchange=()=>{reviewPage=0;searchSheet().catch(reviewError)};
  $("sheet-prev").onclick=()=>{reviewPage=Math.max(0,reviewPage-1);searchSheet().catch(reviewError)};
  $("sheet-next").onclick=()=>{reviewPage++;searchSheet().catch(reviewError)};
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
