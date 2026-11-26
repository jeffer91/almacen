/**
 * Nicole Encajes — Google Sheets receptor privado.
 * Pegar en Apps Script de la hoja destino; desplegar Aplicación web como propietario.
 * Propiedad privada del script: SYNC_SECRET (mismo valor que en Supabase).
 */
const SPREADSHEET_ID = "1cr8mVW4ab6SFY1OJE90TCtHi2i_TnrM8Q8O1PwqawVE";
const API_URL = "https://oppaviqjlyrnkpxjsfvo.supabase.co/functions/v1/catalog-api";
const REST_URL = "https://oppaviqjlyrnkpxjsfvo.supabase.co/rest/v1/rpc/family_option_list";
const PUBLISHABLE_KEY = "sb_publishable_f9qfhMi8W_s8-mHaYb1caA_KmVfhPAG";
const TARGET_SHEET = "RESPALDO_EDGAR";
const HEADERS = ["Tipo registro","ID registro Supabase","ID producto Supabase","SKU","Producto","Marca","Categoría",
  "Presentación","Proveedor","Cantidad","Unidad","Costo USD","Precio SIN IVA USD","Precio CON IVA USD",
  "Presentación original","Revisión","Actualizado en Supabase","Fecha respaldo"];
function reply_(data){return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);}
function fetchJson_(url,payload,headers) {
  const response=UrlFetchApp.fetch(url,{method:"post",contentType:"application/json",
    headers:headers||{},payload:JSON.stringify(payload),muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw Error("No se pudo leer la información vigente de Supabase.");
  const body=JSON.parse(response.getContentText());
  if(body.ok===false)throw Error("Supabase devolvió un error.");
  return body;
}
function clean_(x) {
  if(x===null||x===undefined)return "";
  if(typeof x==="number")return x;
  const str=String(x).replace(/[\t\r\n]/g," ");
  return /^[=+@-]/.test(str)?"'"+str:str;
}
function number_(v){return v===null||v===undefined||v===""?"":Number(v);}
function key_(s){return String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLowerCase().replace(/\s+/g," ");}
function buildSnapshot_(device) {
  const catalog=fetchJson_(API_URL,{action:"catalog"});
  const variants=fetchJson_(REST_URL,{device},{apikey:PUBLISHABLE_KEY});
  const products=(catalog.products||[]).filter(p=>p.active!==false);
  const presentations=catalog.presentations||[];
  const prices=catalog.prices||[];
  const opts=variants.options||[];
  const suppliers=variants.assigned||{};
  const rate=1+Number(catalog.iva_rate??15)/100;
  if(!Number.isFinite(rate)||rate<=0||rate>2)throw Error("IVA inválido");
  const now=Utilities.formatDate(new Date(),"America/Guayaquil","yyyy-MM-dd HH:mm:ss");
  const rows=[HEADERS.slice()];
  const byName=new Map(products.map(p=>[key_(p.name)+"|"+key_(p.brand),p]));
  for(const product of products) {
    const list=presentations.filter(x=>x.product_id===product.id);
    if(!list.length){
      rows.push(["PRODUCTO",product.id,product.id,"",product.name,product.brand||"",product.category||"",
        "","","","","","","","","",product.updated_at||"",now]);
    }
    for(const item of list) {
      const price=prices.find(x=>x.presentation_id===item.id&&x.shop==="jefferson");
      const net=price?Number(price.price):null;
      rows.push(["PRESENTACIÓN",item.id,product.id,item.sku||"",product.name,product.brand||"",product.category||"",
        item.label,suppliers[item.id]||"",number_(item.quantity),item.unit||"",
        number_(item.current_cost),net===null?"":net,net===null?"":Math.round(net*rate*100)/100,
        "","",item.updated_at||product.updated_at||"",now]);
    }
  }
  for(const opt of opts) {
    const product=byName.get(key_(opt.product)+"|"+key_(opt.brand));
    const gross=number_(opt.gross);
    rows.push(["OPCIÓN EDGAR",opt.id,product?.id||"","",opt.product,opt.brand||"",
      product?.category||"",opt.label,opt.supplier||"",number_(opt.quantity),opt.unit||"",
      number_(opt.cost),gross===""?"":Math.round(gross/rate*10000)/10000,
      gross,opt.source_label||"",opt.revision??1,"",now]);
  }
  return rows.map(row=>row.map(clean_));
}
function doPost(e) {
  const lock=LockService.getScriptLock();
  try {
    const request=JSON.parse(e?.postData?.contents||"{}");
    const expected=PropertiesService.getScriptProperties().getProperty("SYNC_SECRET")||"";
    if(expected.length<32 || typeof request.secret!=="string" || request.secret!==expected)
      return reply_({ok:false,error:"Acceso denegado"});
    // Lectura de la hoja privada: exclusivamente por el puente autenticado del servidor.
    if(request.action==="probe"){
      const book=SpreadsheetApp.openById(SPREADSHEET_ID);
      const source=book.getSheetByName("PRECIOS_LOTE_251126"), categories=book.getSheetByName("CATEGORIAS");
      if(!source||!categories)throw Error("Faltan pestañas maestras");
      return reply_({ok:true,spreadsheet_id:book.getId(),rows:source.getLastRow()-1,categories:categories.getLastRow()-1});
    }
    if(request.action==="readMaster" || request.action==="readChanges"){
      const book=SpreadsheetApp.openById(SPREADSHEET_ID);
      const read=(name,width)=>{
        const sheet=book.getSheetByName(name);
        if(!sheet || sheet.getLastRow()<1 || sheet.getLastRow()>20001)throw Error("Pestaña ausente o fuera de límite");
        return sheet.getRange(1,1,sheet.getLastRow(),width).getValues().map(row=>row.map(value=>{
          if(!(value instanceof Date))return value;
          const p=Utilities.formatDate(value,book.getSpreadsheetTimeZone(),"yyyy-MM-dd'T'HH:mm:ss.SSS");
          return (Date.parse(p+"Z")-Date.UTC(1899,11,30))/86400000;
        }));
      };
      if(request.action==="readChanges")return reply_({ok:true,rows:read("CAMBIOS_PENDIENTES",12)});
      return reply_({ok:true,rows:read("PRECIOS_LOTE_251126",43),categories:read("CATEGORIAS",2)});
    }
    if(!/^[a-f0-9]{64}$/.test(String(request.device||"")))
      return reply_({ok:false,error:"Dispositivo inválido"});
    if(!lock.tryLock(30000))return reply_({ok:false,error:"Ya hay una sincronización en curso"});
    const rows=buildSnapshot_(request.device);
    const book=SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet=book.getSheetByName(TARGET_SHEET);
    if(!sheet)throw Error("Falta la pestaña RESPALDO_EDGAR");
    if(sheet.getMaxRows()<rows.length)sheet.insertRowsAfter(sheet.getMaxRows(),rows.length-sheet.getMaxRows());
    const previous=sheet.getLastRow();
    // Escribir la nueva instantánea antes de limpiar las filas sobrantes del respaldo anterior.
    sheet.getRange(1,1,rows.length,HEADERS.length).setValues(rows);
    if(previous>rows.length)
      sheet.getRange(rows.length+1,1,previous-rows.length,HEADERS.length).clearContent();
    sheet.getRange(1,12,Math.max(rows.length,1),2).setNumberFormat("0.0000");
    sheet.getRange(1,14,Math.max(rows.length,1),1).setNumberFormat("0.00");
    SpreadsheetApp.flush();
    PropertiesService.getScriptProperties().setProperty("LAST_SYNC_AT",new Date().toISOString());
    return reply_({ok:true,rows:rows.length-1});
  }catch(error) {
    console.error(error);
    return reply_({ok:false,error:"No se pudo actualizar la hoja"});
  }finally{try{lock.releaseLock()}catch(_){}}
}

/** Ejecutar desde la hoja vinculada; el secreto nunca se escribe en celdas ni en registros. */
function onOpen(){SpreadsheetApp.getUi().createMenu("Almacén").addItem("Preparar conexión privada","prepararConexion").addItem("Activar sincronización cada 15 minutos","activarImportacion").addItem("Importar ahora","importarPreciosAlmacen").addToUi();}
function prepararConexion(){
  const props=PropertiesService.getScriptProperties();
  let secret=props.getProperty("SYNC_SECRET");
  if(!secret||secret.length<32){
    secret=Utilities.getUuid().replace(/-/g,"")+Utilities.getUuid().replace(/-/g,"");
    props.setProperty("SYNC_SECRET",secret);
  }
  const esc=v=>String(v||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
  const url=ScriptApp.getService().getUrl()||"";
  const html=HtmlService.createHtmlOutput('<h3>Conexión privada con Almacén</h3><p>Implementa este script como aplicación web, ejecutar como propietario, acceso Cualquier persona. Copia la URL /exec de la implementación.</p><p>URL actual:</p><textarea readonly rows="2" style="width:95%">'+esc(url)+'</textarea><p>Secreto privado (cópialo directamente al formulario de Almacén, no al chat):</p><textarea readonly rows="3" style="width:95%">'+esc(secret)+'</textarea><p><a target="_blank" rel="noopener noreferrer" href="https://jeffer91.github.io/almacen/sincronizar/#google-bridge">Abrir configuración en Almacén</a></p><p>La hoja conserva sus permisos privados.</p>').setWidth(510).setHeight(380);
  SpreadsheetApp.getUi().showModalDialog(html,"Autorizar conexión");
}

/** Sincronización de las hojas fuente XLS_: no modifica la hoja ni el catálogo oficial. */
function importarPreciosAlmacen(){
 const lock=LockService.getScriptLock();if(!lock.tryLock(30000))throw Error("Otra importación está en curso");
 try{
  const props=PropertiesService.getScriptProperties(),secret=props.getProperty("SYNC_SECRET");
  if(!secret||secret.length<32)throw Error("Primero configura la conexión privada con Almacén");
  const book=SpreadsheetApp.openById(SPREADSHEET_ID);
  const mapping=[["XLS_Encaje","Encaje",22,97],["XLS_Cintas","Cintas",21,80],["XLS_Humval","Humval",11,159],["XLS_Ideal","Ideal",14,68],["XLS_EPeru","EPerü",6,39],["XLS_Varios","Varios",10,961],["XLS_Navidenos","Navideños",14,58],["XLS_Pasa","Pasa",15,185],["XLS_Flecos","Flecos",11,67],["XLS_Ventas","Ventas",5,50],["XLS_Precios","Precios Produc.",5,37]];
  const rows=[],headers={};
  const rawValue=v=>v instanceof Date?(Date.parse(Utilities.formatDate(v,book.getSpreadsheetTimeZone(),"yyyy-MM-dd'T'HH:mm:ss.SSS")+"Z")-Date.UTC(1899,11,30))/86400000:v;
  for(const [tab,name,width,minimum] of mapping){
   const sheet=book.getSheetByName(tab);if(!sheet||sheet.getLastRow()<3||sheet.getLastRow()>20002)throw Error("Hoja incompleta: "+tab);
   const values=sheet.getRange(1,1,sheet.getLastRow(),width+1).getValues().map(r=>r.map(rawValue));
   if(values[1][0]!=="Fila Excel")throw Error("Encabezado inválido: "+tab);
   headers[name]=Object.fromEntries(values[1].slice(1).map((v,i)=>[String.fromCharCode(65+i),v]));
   const seen=new Set();let count=0;
   for(const row of values.slice(2)){
    if(!row.slice(1).some(v=>v!==""&&v!=null)&&!row[0])continue;
    const id=Number(row[0]);if(!Number.isInteger(id)||id<1||id>65536||seen.has(id))throw Error("Identificador de fila inválido: "+tab);
    if(!row.slice(1).some(v=>v!==""&&v!=null))throw Error("Fila vacía: "+tab);
    seen.add(id);count++;
    rows.push({sheet_name:name,sheet_row:id,display_name:String(row[1]??""),cells:Object.fromEntries(row.slice(1).flatMap((v,i)=>v===""||v==null?[]:[[String.fromCharCode(65+i),v]]))});
   }
   if(count<minimum)throw Error("Faltan registros: "+tab);
  }
  const response=UrlFetchApp.fetch(API_URL,{method:"post",contentType:"application/json",payload:JSON.stringify({action:"pushLiveSheets",secret,headers,rows}),muteHttpExceptions:true});
  const data=JSON.parse(response.getContentText());
  if(response.getResponseCode()!==200||!data.ok)throw Error(data.error||"Importación no confirmada");
  props.setProperty("LAST_LIVE_IMPORT_AT",new Date().toISOString());
  console.log("Importación confirmada: "+data.total_rows+" filas; "+data.changed_rows+" cambios.");
  return data;
 }finally{lock.releaseLock();}
}
function activarImportacion(){
 const data=importarPreciosAlmacen(); // verifica la conexión antes de crear un activador
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==="importarPreciosAlmacen").forEach(t=>ScriptApp.deleteTrigger(t));
 ScriptApp.newTrigger("importarPreciosAlmacen").timeBased().everyMinutes(15).create();
 SpreadsheetApp.getUi().alert("Importación confirmada: "+data.total_rows+" filas. Activador instalado.");
}
