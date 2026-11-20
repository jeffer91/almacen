/* Nicole Encajes · módulo de sincronización aprobado con PIN. */
"use strict";
(() => {
  const $=id=>document.getElementById(id);
  const core=window.NICOLE_SYNC;
  const url=String(window.ALMACEN_API_URL||"").trim().replace(/\/$/,"");
  let token=null,current=null,planned=null,baseline=null;
  const localDate=()=>{
    const parts=new Intl.DateTimeFormat("en-US",{
      year:"numeric",month:"2-digit",day:"2-digit",timeZone:"America/Guayaquil"
    }).formatToParts(new Date());
    const get=type=>parts.find(x=>x.type===type)?.value||"";
    return get("year")+"-"+get("month")+"-"+get("day");
  };
  const money=n=>new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD"}).format(Number(n)||0);
  const show=valid=>{
    $("loginSection").hidden=valid;
    $("syncSection").hidden=!valid;
    $("logout").hidden=!valid;
  };
  const note=(id,value,success=false)=>{
    $(id).textContent=value||"";
    $(id).className=success?"good":"error";
  };
  async function api(action,fields={}){
    if(!url)throw Error("Falta configurar la API de Supabase");
    const headers={"Content-Type":"application/json"};
    if(token) headers["x-almacen-key"]=token;
    const res=await fetch(url,{method:"POST",headers,cache:"no-store",body:JSON.stringify({action,...fields})});
    const result=await res.json().catch(()=>({}));
    if(!res.ok||!result.ok){
      if(res.status===401 && action!=="login") {
        token=null;current=null;planned=null;baseline=null;show(false);
      }
      throw Error(result.error||"No fue posible conectar con Supabase");
    }
    return result;
  }
  async function refresh(){
    current=await api("bootstrap");
    $("productCount").textContent=String(current.products?.length||0);
    $("presentationCount").textContent=String(current.presentations?.length||0);
    return current;
  }
  function disabledPreview(){
    planned=null;baseline=null;$("results").hidden=true;$("apply").disabled=true;
  }
  $("loginForm").addEventListener("submit",async(event)=>{
    event.preventDefault();
    $("loginButton").disabled=true;note("loginError","");
    try {
      const login=await api("login",{pin:$("pin").value});
      token=login.token;$("loginForm").reset();
      await refresh();
      show(true);
    }catch(e){note("loginError",e.message);token=null;}
    finally{$("loginButton").disabled=false;}
  });
  $("logout").addEventListener("click",async()=>{
    try{if(token)await api("logout");}catch{/* Siempre cerrar sesión local. */}
    token=null;current=null;disabledPreview();$("sheetText").value="";show(false);
  });
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
    if(!token||!planned||planned.errors.length||$("apply").disabled)return;
    const rows=core.importRows(planned.plan);
    if(!rows.length)return;
    if(!confirm("Se aplicarán "+rows.length+" cambios a Supabase. ¿Confirmas que los datos y precios fueron revisados?"))return;
    $("apply").disabled=true;note("applyError","");
    try{
      const latest=await api("bootstrap");
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
  $("sheetText").placeholder=core.HEADERS.join("\t")+"\n...";
})();
