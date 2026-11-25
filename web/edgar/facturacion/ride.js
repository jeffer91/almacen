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
 function wrap(value,width,size=7){const str=String(value??"");const max=Math.max(1,Math.floor(width/(size*.60)));const lines=[];let s=str;while(s.length>max){let at=s.lastIndexOf(" ",max);if(at<1)at=max;lines.push(s.slice(0,at));s=s.slice(at).trimStart()}lines.push(s);return lines}
 const multi=(x,y,v,w,size=7,anchor="start")=>wrap(v,w,size).map((t,i)=>text(x,y+i*(size+1),t,size,anchor)).join("");
 function build(d,issuer){
  if(!d||!issuer||!Array.isArray(d.lines)||!d.lines.length)throw Error("Borrador incompleto");
  const b=d.buyer||{}, cols=[20,60,100,140,250,325,375,425,475,525,575];
  const headers=[["Cod.","Principal"],["Cod.","Auxiliar"],["Cantidad"],["Descripción"],["Detalle Adicional"],["Precio Unitario"],["Subsidio"],["Precio sin","Subsidio"],["Descuento"],["Precio Total"]];
  const groups=[];let cur=[],height=0;for(const r of d.lines){const h=Math.max(25,8+8*Math.max(wrap(r.description,106).length,wrap(r.extra,71).length,wrap(r.code,36).length,wrap(r.aux,36).length));if(cur.length&&height+h>90){groups.push(cur);cur=[];height=0}cur.push({r,h});height+=h}if(cur.length)groups.push(cur);
  return groups.map((items,page)=>{
   let s='<svg class="ride-sheet" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 595 842" role="img" aria-label="Borrador de factura, página '+(page+1)+'" font-family="Helvetica, Arial, sans-serif"><rect width="595" height="842" fill="white"/>';
   s+='<image href="./edgar/facturacion/logo-ride.svg" x="20" y="20" width="230" height="123.05"/>'+rect(20,147,250,206,5)+rect(280,20,295,333,5);
   s+=text(28,155,issuer.legal_name)+text(28,184,issuer.trade_name)+text(28,213,"Dirección")+text(28,222,"Matriz:")+text(79,213,issuer.matrix_line1,7)+text(79,221,issuer.matrix_line2,7)+text(28,245,"Dirección")+text(28,254,"Sucursal:")+text(79,241,issuer.branch_line1,7)+text(79,249,issuer.branch_line2,7)+text(28,287,"OBLIGADO A LLEVAR CONTABILIDAD")+text(228,287,issuer.accounting);
   s+=text(291,38,"R.U.C.:",12)+text(356,38,issuer.ruc,14)+text(291,60,"FACTURA — BORRADOR",12)+text(291,84,"No.")+text(322,84,"SIN NUMERACIÓN FISCAL")+text(291,107,"NÚMERO DE AUTORIZACIÓN")+text(291,133,"PENDIENTE — NO EMITIDA")+text(291,157,"FECHA Y HORA DE")+text(291,166,"AUTORIZACIÓN:")+text(390,163,"Sin autorización")+text(291,189,"AMBIENTE:")+text(390,190,"BORRADOR")+text(291,218,"EMISIÓN:")+text(390,218,"NO EMITIDA")+text(291,254,"CLAVE DE ACCESO")+text(427,290,"SIN CLAVE DE ACCESO NI CÓDIGO DE BARRAS",9,"middle")+text(427,315,"SIN VALIDEZ TRIBUTARIA",12,"middle","#a12424");
   s+=rect(20,383,555,77)+text(21,398,"Razón Social / Nombres y Apellidos:")+multi(219,397,b.name,350)+text(21,414,"Identificación")+text(92,414,b.identification||"Pendiente",7)+text(21,425,"Fecha")+text(92,424,date(d.issue_date),7)+text(179,425,"Placa / Matrícula:")+text(375,425,"Guía")+text(21,439,"Direccion:")+multi(92,439,b.address,480);
   for(let j=0;j<10;j++){s+=rect(cols[j],463,cols[j+1]-cols[j],30);let c=(cols[j]+cols[j+1])/2;headers[j].forEach((v,k)=>{s+=text(c,headers[j].length===1?480:476+k*8,v,7,"middle")})}
   let y=493;
   for(const {r,h} of items){const vals=[r.code,r.aux,fmt(r.quantity),r.description,r.extra,String(Number(r.unit_net)),fmt(0),fmt(0),fmt(r.discount),fmt(r.base)];for(let j=0;j<10;j++){s+=rect(cols[j],y,cols[j+1]-cols[j],h);const align=j>=5?"end":j===3||j===4?"start":"middle";const x=align==="end"?cols[j+1]-2:align==="start"?cols[j]+2:(cols[j]+cols[j+1])/2;s+=multi(x,y+15,vals[j],cols[j+1]-cols[j]-4,7,align)}y+=h}
   if(page===groups.length-1){const sub15=d.lines.filter(l=>Number(l.rate)===15).reduce((n,l)=>n+Number(l.base),0);const sub0=d.lines.filter(l=>Number(l.rate)===0).reduce((n,l)=>n+Number(l.base),0);
    s+=rect(20,y+4,340,15)+text(190,y+14,"Información Adicional",7,"middle")+rect(20,y+19,340,30)+text(23,y+26,"Telefono:",6)+multi(122,y+26,b.phone,235,6)+text(23,y+41,"Email:",6)+multi(122,y+41,b.email,235,6);
    s+=rect(20,y+53,160,15)+rect(180,y+53,100,15)+text(100,y+63,"Forma de pago",7,"middle")+text(230,y+63,"Valor",7,"middle")+rect(20,y+68,160,15)+rect(180,y+68,100,15)+text(23,y+77,d.payment_code+" - "+(pay[d.payment_code]||"Por verificar"),6)+text(277,y+77,fmt(d.total),6,"end");
    const totals=[["SUBTOTAL 15%",sub15],...(sub0?[["SUBTOTAL 0%",sub0]]:[]),["SUBTOTAL NO OBJETO DE IVA",0],["SUBTOTAL EXENTO DE IVA",0],["SUBTOTAL SIN IMPUESTOS",d.subtotal],["TOTAL DESCUENTO",d.discount],["ICE",0],["IVA 15%",d.tax],["IRBPNR",0],["PROPINA",0],["VALOR TOTAL",d.total]];
    totals.forEach(([k,v],i)=>{const yy=y+15*i;s+=rect(375,yy,150,15)+rect(525,yy,50,15)+text(377,yy+10,k,7)+text(573,yy+10,fmt(v),7,"end")});let end=y+totals.length*15+4;s+=rect(375,end,200,46)+text(377,end+10,"VALOR TOTAL SIN SUBSIDIO",7)+text(573,end+10,"0.00",7,"end")+text(377,end+28,"AHORRO POR SUBSIDIO:",7)+text(377,end+36,"(Incluye IVA cuando corresponda)",7)+text(573,end+25,"0.00",7,"end");
   }else{s+=text(575,y+16,"Continúa en la página siguiente",8,"end")}
   s+=text(297.5,827,"BORRADOR — NO ES COMPROBANTE FISCAL",11,"middle","#a12424")+text(575,838,(page+1)+" / "+groups.length,7,"end")+"</svg>";return s;
  }).join("");
 }
 scope.NICOLE_RIDE=Object.freeze({build});
})(typeof window!=="undefined"?window:globalThis);
