/* Plantilla de borrador basada en el RIDE de referencia: A4 595 × 842 pt. */
"use strict";
(function(scope){
 const e=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 const fmt=v=>Number(v||0).toFixed(2);
 const pay={"01":"SIN UTILIZACION DEL SISTEMA FINANCIERO","16":"TARJETA DE DÉBITO","19":"TARJETA DE CRÉDITO","20":"OTROS CON UTILIZACION DEL SISTEMA FINANCIERO"};
 const rect=(x,y,w,h,rx=0)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="'+rx+'" fill="none" stroke="#000" stroke-width="1"/>';
 const line=(x,y,x2,y2)=>'<path d="M'+x+' '+y+' H'+x2+(y2===y?'':' V'+y2)+'" fill="none" stroke="#000" stroke-width="1"/>';
 const text=(x,y,v,size=8,anchor="start",color="#000")=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" text-anchor="'+anchor+'" fill="'+color+'">'+e(v)+'</text>';
 const date=v=>String(v||"").split("-").reverse().join("/");
 // Helvetica metrics in points, independent of browser font loading.
 const narrow=new Set(" !'.,:;|ijlI");
 const wide=new Set("MWmw@%&");
 function width(v,size){return [...String(v??"")].reduce((n,c)=>n+(narrow.has(c)?0.32:wide.has(c)?0.9:/[A-ZÁÉÍÓÚÜÑ]/.test(c)?0.72:0.59)*size,0);}
 function wrap(value,w,size=7){
  const str=String(value??"").replace(/\s+/g," ").trim(),lines=[];
  let line="";
  for(const word of str.split(" ")){
   const next=line?line+" "+word:word;
   if(width(next,size)<=w){line=next;continue;}
   if(line)lines.push(line);line="";
   for(const ch of word){if(line&&width(line+ch,size)>w){lines.push(line);line="";}line+=ch;}
  }
  if(line||!lines.length)lines.push(line);return lines;
 }
 const multi=(x,y,v,w,size=7,anchor="start")=>wrap(v,w,size).map((t,i)=>text(x,y+i*(size+1),t,size,anchor)).join("");
 function precise(v,min=2,max=6){
  const raw=String(v??"");if(!/^\d+(?:\.\d+)?$/.test(raw))throw Error("Valor numérico inválido en RIDE.");
  const [a,b=""]=raw.split(".");if(b.length>max)throw Error("Precisión no admitida en RIDE.");
  const f=b.replace(/0+$/,"").padEnd(min,"0");return f?a+"."+f:a;
 }
 function build(d,issuer){
  if(!d||!issuer||!Array.isArray(d.lines)||!d.lines.length)throw Error("Borrador incompleto");
  const b=d.buyer||{}, cols=[20,60,100,140,250,325,375,425,475,525,575];
  const headers=[["Cod.","Principal"],["Cod.","Auxiliar"],["Cantidad"],["Descripción"],["Detalle Adicional"],["Precio Unitario"],["Subsidio"],["Precio sin","Subsidio"],["Descuento"],["Precio Total"]];
  const buyerName=wrap(b.name,350),buyerAddress=wrap(b.address,480),buyerExtra=Math.max(0,buyerName.length-1)*8+Math.max(0,buyerAddress.length-2)*8;
  const buyerShift=Math.max(0,buyerName.length-1)*8;
  const phoneRows=wrap(b.phone,235,6).length,emailRows=wrap(b.email,235,6).length;
  const phoneH=Math.max(15,phoneRows*7+5),emailH=Math.max(15,emailRows*7+5);
  const paymentText=d.payment_code+" - "+(pay[d.payment_code]||"Por verificar");
  const paymentH=Math.max(15,wrap(paymentText,154,6).length*7+5);
  const footerHeight=Math.max(230,15+phoneH+emailH+4+15+paymentH+6);
  const firstY=493+buyerExtra, lastLimit=812-footerHeight, continuationLimit=800;
  if(firstY+25>lastLimit)throw Error("Los datos del comprador son demasiado extensos para este formato. Revisa nombre y dirección.");
  const rows=d.lines.map(r=>{
    const vals=[r.code,r.aux,precise(r.quantity),r.description,r.extra,precise(r.unit_net,0),fmt(0),fmt(0),fmt(r.discount),fmt(r.base)];
    const lineCount=Math.max(...vals.map((v,j)=>wrap(v,cols[j+1]-cols[j]-4).length));
    const h=Math.max(25,15+8*(lineCount-1)+5);
    if(h>lastLimit-firstY)throw Error("Una línea excede el espacio imprimible. Reduce el detalle del producto.");
    return {r,h,vals};
  });
  const groups=[];let cur=[],height=0;
  for(const item of rows){if(cur.length&&firstY+height+item.h>continuationLimit){groups.push(cur);cur=[];height=0;}cur.push(item);height+=item.h;}
  // Reserve the complete tax and payment summary on the last page.
  if(firstY+height>lastLimit){const tail=[];let tailHeight=0;while(cur.length&&firstY+tailHeight+cur[cur.length-1].h<=lastLimit){const item=cur.pop();tail.unshift(item);tailHeight+=item.h;}if(cur.length)groups.push(cur);cur=tail;}
  if(cur.length)groups.push(cur);
  return groups.map((items,page)=>{
   let s='<svg class="ride-sheet" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595 842" role="img" aria-label="Borrador de factura, página '+(page+1)+'" font-family="Helvetica, Arial, sans-serif"><rect width="595" height="842" fill="white"/>';
   s+='<image href="./edgar/facturacion/logo-ride.svg" x="20" y="20" width="230" height="123.05"/>'+rect(20,147,250,206,5)+rect(280,20,295,333,5);
   s+=text(28,155,issuer.legal_name)+text(28,184,issuer.trade_name)+text(28,213,"Dirección")+text(28,222,"Matriz:")+text(79,213,issuer.matrix_line1,7)+text(79,221,issuer.matrix_line2,7)+text(28,245,"Dirección")+text(28,254,"Sucursal:")+text(79,241,issuer.branch_line1,7)+text(79,249,issuer.branch_line2,7)+text(28,287,"OBLIGADO A LLEVAR CONTABILIDAD")+text(228,287,issuer.accounting);
   s+=text(291,39.15,"R.U.C.:",12)+text(356,39.85,issuer.ruc,14)+text(291,61.65,"FACTURA — BORRADOR",12)+text(291,84,"No.")+text(322,84,"SIN NUMERACIÓN FISCAL")+text(291,107,"NÚMERO DE AUTORIZACIÓN")+text(291,133,"PENDIENTE — NO EMITIDA")+text(291,157,"FECHA Y HORA DE")+text(291,166,"AUTORIZACIÓN:")+text(390,163,"Sin autorización")+text(291,189,"AMBIENTE:")+text(390,190,"BORRADOR")+text(291,218,"EMISIÓN:")+text(390,218,"NO EMITIDA")+text(291,254,"CLAVE DE ACCESO")+text(427,290,"SIN CLAVE DE ACCESO NI CÓDIGO DE BARRAS",9,"middle")+text(427,315,"SIN VALIDEZ TRIBUTARIA",12,"middle","#a12424");
   s+=rect(20,383,555,77+buyerExtra)+text(21,398,"Razón Social / Nombres y Apellidos:")+multi(219,397,b.name,350)+text(21,414+buyerShift,"Identificación")+text(92,414+buyerShift,b.identification||"Pendiente",7)+text(21,425+buyerShift,"Fecha")+text(92,424+buyerShift,date(d.issue_date),7)+text(179,425+buyerShift,"Placa / Matrícula:")+text(375,425+buyerShift,"Guía")+text(21,439+buyerShift,"Direccion:")+multi(92,439+buyerShift,b.address,480);
   for(let j=0;j<10;j++){s+=rect(cols[j],463+buyerExtra,cols[j+1]-cols[j],30);let c=(cols[j]+cols[j+1])/2;headers[j].forEach((v,k)=>{s+=text(c,(headers[j].length===1?480:476+k*8)+buyerExtra,v,7,"middle")})}
   let y=firstY;
   for(const {r,h,vals} of items){for(let j=0;j<10;j++){s+=rect(cols[j],y,cols[j+1]-cols[j],h);const align=j>=5?"end":j===3||j===4?"start":"middle";const x=align==="end"?cols[j+1]-2:align==="start"?cols[j]+2:(cols[j]+cols[j+1])/2;s+=multi(x,y+15,vals[j],cols[j+1]-cols[j]-4,7,align)}y+=h}
   if(page===groups.length-1){const sub15=d.lines.filter(l=>Number(l.rate)===15).reduce((n,l)=>n+Number(l.base),0);const sub0=d.lines.filter(l=>Number(l.rate)===0).reduce((n,l)=>n+Number(l.base),0);
    s+=rect(20,y+4,340,15)+text(190,y+14,"Información Adicional",7,"middle")+rect(20,y+19,340,phoneH+emailH)+text(23,y+26,"Telefono:",6)+multi(122,y+26,b.phone,235,6)+text(23,y+26+phoneH,"Email:",6)+multi(122,y+26+phoneH,b.email,235,6);
    const py=y+23+phoneH+emailH;s+=rect(20,py,160,15)+rect(180,py,100,15)+text(100,py+10,"Forma de pago",7,"middle")+text(230,py+10,"Valor",7,"middle")+rect(20,py+15,160,paymentH)+rect(180,py+15,100,paymentH)+multi(23,py+24,paymentText,154,6)+text(277,py+24,fmt(d.total),6,"end");
    const totals=[["SUBTOTAL 15%",sub15],...(sub0?[["SUBTOTAL 0%",sub0]]:[]),["SUBTOTAL NO OBJETO DE IVA",0],["SUBTOTAL EXENTO DE IVA",0],["SUBTOTAL SIN IMPUESTOS",d.subtotal],["TOTAL DESCUENTO",d.discount],["ICE",0],["IVA 15%",d.tax],["IRBPNR",0],["PROPINA",0],["VALOR TOTAL",d.total]];
    totals.forEach(([k,v],i)=>{const yy=y+15*i;s+=rect(375,yy,150,15)+rect(525,yy,50,15)+text(377,yy+10,k,7)+text(573,yy+10,fmt(v),7,"end")});let end=y+totals.length*15+4;s+=rect(375,end,200,46)+text(377,end+10,"VALOR TOTAL SIN SUBSIDIO",7)+text(573,end+10,"0.00",7,"end")+text(377,end+28,"AHORRO POR SUBSIDIO:",7)+text(377,end+36,"(Incluye IVA cuando corresponda)",7)+text(573,end+25,"0.00",7,"end");
   }else{s+=text(575,y+16,"Continúa en la página siguiente",8,"end")}
   s+=text(297.5,827,"BORRADOR — NO ES COMPROBANTE FISCAL",11,"middle","#a12424")+text(575,838,(page+1)+" / "+groups.length,7,"end")+"</svg>";return s;
  }).join("");
 }
 scope.NICOLE_RIDE=Object.freeze({build});
})(typeof window!=="undefined"?window:globalThis);
