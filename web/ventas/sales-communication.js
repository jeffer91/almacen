"use strict";
(()=>{
 const $=id=>document.getElementById(id),money=n=>new Intl.NumberFormat("es-EC",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number(n));
 let customer=null,customers=[],version=0,timer,current=null,receiptFile=null,receiptUrl=null,working=false;
 async function rpc(name,fields={}){
  const token=window.NICOLE_EDGAR_SESSION?.getToken();if(!token)throw Error("Inicia sesión nuevamente");
  const response=await fetch(new URL("/rest/v1/rpc/"+name,window.ALMACEN_API_URL),{method:"POST",headers:{apikey:window.ALMACEN_PUBLIC_KEY,"content-type":"application/json"},body:JSON.stringify({p_token:token,...fields}),cache:"no-store"});
  const data=await response.json().catch(()=>null);if(!response.ok)throw Error(data?.message==="SESSION_INVALID"?"Sesión vencida. Recarga la página.":data?.message||"Operación no completada");return data;
 }
 function select(c){version++;clearTimeout(timer);customer=c||null;$("customerAlias").value=c?.name?.slice(0,70)||"";$("customerAlias").readOnly=!!c;$("saleCustomerPhone").textContent=c?.phone||"Sin WhatsApp";$("saleCustomerResults").replaceChildren();$("saleCustomerResults").hidden=true;}
 async function search(){
  const rev=++version,q=$("saleCustomerSearch").value.trim();if(!q){$("saleCustomerResults").hidden=true;return;}
  try{const data=await rpc("edgar_customer_list",{p_query:q,p_offset:0,p_limit:30,p_include_archived:false});if(rev!==version)return;customers=data.items||[];const box=$("saleCustomerResults");box.replaceChildren();for(const c of customers){const b=document.createElement("button");b.type="button";b.textContent=[c.name,c.identification,c.phone].filter(Boolean).join(" · ");b.onclick=()=>{select(c);$("saleCustomerSearch").value="";};box.append(b);}if(!customers.length)box.textContent="No hay coincidencias";box.hidden=false;}catch(e){if(rev===version)$("saleCustomerStatus").textContent=e.message;}
 }
 function phone(raw){let n=String(raw||"").trim();if(!n||!(/^\+?[\d\s().-]+$/.test(n)))return "";const international=n.startsWith("+");n=n.replace(/\D/g,"");if(/^09\d{8}$/.test(n))return "593"+n.slice(1);if(/^9\d{8}$/.test(n))return "593"+n;if(/^5939\d{8}$/.test(n))return n;return international&&/^[1-9]\d{7,14}$/.test(n)?n:"";}
 function wrap(ctx,text,width){const out=[];let line="";for(const word of String(text||"").split(/\s+/)){if(ctx.measureText(word).width>width){if(line)out.push(line);line="";let chunk="";for(const ch of word){if(chunk&&ctx.measureText(chunk+ch).width>width){out.push(chunk);chunk="";}chunk+=ch;}line=chunk;}else if(line&&ctx.measureText(line+" "+word).width>width){out.push(line);line=word;}else line+=(line?" ":"")+word;}if(line)out.push(line);return out.length?out:[""];}
 async function image(s){
  if(!s.items?.length)throw Error("La compra no tiene artículos activos");
  const canvas=document.createElement("canvas"),ctx=canvas.getContext("2d");canvas.width=900;
  const layout=s.items.map(item=>{ctx.font="bold 24px Arial";const title=wrap(ctx,item.description,425);ctx.font="20px Arial";const detail=wrap(ctx,[item.detail,item.unit].filter(Boolean).join(" · "),425);return {item,title,detail,h:Math.max(65,26*title.length+23*detail.length+20)};});
  ctx.font="25px Arial";const buyer=wrap(ctx,s.buyer.name,800);const header=230+buyer.length*30;
  canvas.height=header+layout.reduce((n,x)=>n+x.h,0)+190;
  ctx.fillStyle="#fff";ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle="#30215e";ctx.fillRect(0,0,900,115);
  const put=(t,x,y,font="24px Arial",color="#30215e",align="left")=>{ctx.font=font;ctx.fillStyle=color;ctx.textAlign=align;ctx.fillText(String(t),x,y);};
  put("NICOLE ENCAJES",450,51,"bold 39px Arial","#fff","center");put("Detalle de compra",450,87,"25px Arial","#fff","center");
  put("Compra "+s.id.slice(0,8).toUpperCase()+"  ·  "+s.sale_date,40,153,"23px Arial");
  buyer.forEach((line,i)=>put(line,40,190+i*30,"bold 25px Arial"));
  let y=header-50;ctx.fillStyle="#eee9f8";ctx.fillRect(35,y,830,42);
  put("Producto",48,y+28,"bold 22px Arial");put("Cant.",555,y+28,"bold 20px Arial","#30215e","right");put("P. unit.",700,y+28,"bold 20px Arial","#30215e","right");put("Importe",850,y+28,"bold 20px Arial","#30215e","right");y+=50;
  for(const x of layout){let yy=y+25;for(const line of x.title){put(line,48,yy,"bold 24px Arial");yy+=26;}for(const line of x.detail){put(line,48,yy,"20px Arial","#61566d");yy+=23;}put(Number(x.item.quantity),555,y+27,"22px Arial","#30215e","right");put(new Intl.NumberFormat("es-EC",{minimumFractionDigits:2,maximumFractionDigits:4}).format(Number(x.item.unit_price)),700,y+27,"22px Arial","#30215e","right");put(money(x.item.total),850,y+27,"bold 22px Arial","#30215e","right");y+=x.h;ctx.fillStyle="#e2dce9";ctx.fillRect(35,y-5,830,1);}
  ctx.fillStyle="#eee9f8";ctx.fillRect(35,y+10,830,70);put("TOTAL",55,y+55,"bold 31px Arial");put(money(s.total),845,y+55,"bold 36px Arial","#30215e","right");
  put("¡Gracias por tu compra!",450,y+116,"bold 25px Arial","#30215e","center");put("Detalle comercial sin validez tributaria",450,y+150,"20px Arial","#61566d","center");put("nicoleencajes.com",450,y+178,"20px Arial","#61566d","center");
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error("No se pudo generar la imagen")),"image/png"));return new File([blob],"Nicole-Encajes-"+s.id.slice(0,8)+".png",{type:"image/png"});
 }
 function invoiceLink(id){return new URL("./edgar/facturacion/?draft="+encodeURIComponent(id),document.baseURI).href;}
 async function show(id,mode="receipt"){
  if(working)return;working=true;
  try{
   current=await rpc("edgar_sale_detail",{p_id:id});if(!current.items.length)throw Error("Compra sin artículos activos");
   if(mode==="invoice"&&current.draft_id){location.href=invoiceLink(current.draft_id);return;}
   $("saleActionTitle").textContent=mode==="invoice"?"Crear borrador fiscal":"Detalle de compra";
   $("saleActionStatus").textContent="";$("saleReceiptPane").hidden=mode==="invoice";$("saleInvoicePane").hidden=mode!=="invoice";
   if(mode==="invoice"){
    if(!current.customer_id){throw Error("La compra debe estar asociada a un cliente identificado. Completa sus datos en Clientes antes de facturar.");}
    const config=await rpc("edgar_sale_fiscal_defaults",{p_id:id});
    if(config.mixed_payment)throw Error("Esta compra tiene formas de pago mixtas; el borrador actual admite una sola.");
    const defaults=new Map(config.items.map(x=>[x.id,x]));
    const tbody=$("saleFiscalRows");tbody.replaceChildren();let missing=0;
    for(const item of current.items){
      const settings=defaults.get(item.id);if(!settings?.code)throw Error("Código de producto no disponible");
      const tr=tbody.insertRow();tr.dataset.id=item.id;tr.insertCell().textContent=item.description;tr.insertCell().textContent=money(item.total);
      const code=document.createElement("span");code.className="sale-product-code";code.textContent=settings.code;tr.insertCell().append(code);
      const rate=document.createElement("select");rate.required=true;rate.setAttribute("aria-label","IVA "+item.description);
      for(const [v,label] of [["","Confirmar una vez"],["0","0 %"],["15","15 %"]])rate.add(new Option(label,v));
      if(settings.rate!=null){rate.value=String(settings.rate);rate.disabled=true;}else missing++;
      tr.insertCell().append(rate);
    }
    const pay=$("saleFiscalPay");pay.value=config.payment_code||"";pay.disabled=!!config.payment_code;
    $("saleFiscalConfirm").checked=false;
    $("saleActionStatus").textContent=missing?missing+" producto(s) sin tarifa confirmada. Selecciona el IVA correcto una sola vez; se recordará al guardar el borrador.":"Códigos e IVA recuperados automáticamente.";

   }else{
    receiptFile=await image(current);if(receiptUrl)URL.revokeObjectURL(receiptUrl);receiptUrl=URL.createObjectURL(receiptFile);$("saleReceiptImage").src=receiptUrl;$("saleDownload").href=receiptUrl;$("saleDownload").download=receiptFile.name;
    const n=phone(current.buyer.phone),link=$("saleWhatsapp");link.hidden=!n;if(n)link.href="https://wa.me/"+n+"?text="+encodeURIComponent("Hola, "+current.buyer.name+". Te compartimos el detalle de tu compra en Nicole Encajes. Total: "+money(current.total)+".");
    let shareable=false;try{shareable=!!(navigator.share&&navigator.canShare?.({files:[receiptFile]}));}catch{}$("saleShare").hidden=!shareable;
    $("saleActionStatus").textContent=n?"Descarga o comparte la imagen. WhatsApp Web abre el chat; adjunta el PNG y confirma el envío.":"No hay teléfono válido guardado en la compra. Puedes descargar la imagen.";
   }
   $("saleActionDialog").showModal();
  }finally{working=false;}
 }
 function init(){
  $("saleCustomerSearch").addEventListener("input",()=>{clearTimeout(timer);version++;timer=setTimeout(search,250);});
  $("saleCustomerClear").onclick=()=>{version++;select(null);$("saleCustomerSearch").value="";};
  $("saleCustomerNew").onclick=()=>{$("saleCustomerForm").reset();$("saleCustomerNote").textContent="";$("saleCustomerDialog").showModal();};
  $("saleCustomerCancel").onclick=()=>{$("saleCustomerDialog").close();};
  $("saleCustomerForm").onsubmit=async e=>{e.preventDefault();const b=$("saleCustomerSave");b.disabled=true;try{const d=Object.fromEntries(new FormData(e.target));const c=await rpc("edgar_customer_save",{p_customer:d});select(c);$("saleCustomerDialog").close();}catch(err){$("saleCustomerNote").textContent=err.message;}finally{b.disabled=false;}};
  $("saleActionClose").onclick=()=>{$("saleActionDialog").close();};
  $("saleShare").onclick=async()=>{try{await navigator.share({files:[receiptFile],title:"Detalle de compra Nicole Encajes"});$("saleActionStatus").textContent="Imagen compartida desde el dispositivo; confirma el destinatario y envío en WhatsApp.";}catch(e){if(e.name!=="AbortError")$("saleActionStatus").textContent="No se pudo compartir. Descarga el PNG y adjúntalo en WhatsApp.";}};
  $("saleFiscalForm").onsubmit=async e=>{e.preventDefault();if(working||!current)return;working=true;$("saleFiscalSave").disabled=true;try{const fiscal=[...$("saleFiscalRows").rows].map(tr=>({id:tr.dataset.id,rate:tr.querySelector("select").value===""?null:Number(tr.querySelector("select").value)}));const d=await rpc("edgar_sale_invoice_draft",{p_id:current.id,p_payment:$("saleFiscalPay").value,p_fiscal:fiscal});location.href=invoiceLink(d.id);}catch(err){$("saleActionStatus").textContent=err.message;}finally{working=false;$("saleFiscalSave").disabled=false;}};
 }
 window.NICOLE_SALE_COMM={init,rpc,customer:()=>customer,clear:()=>{select(null);$("saleCustomerSearch").value="";},show,phone};
})();