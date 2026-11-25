/* XML de laboratorio exclusivamente: no se reserva secuencial fiscal ni se envía al SRI. */
"use strict";
(function(scope){
 const clean=v=>String(v??"").trim().replace(/\s+/g," ");
 const esc=v=>clean(v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&apos;"}[c]));
 const tag=(k,v)=>"<"+k+">"+esc(v)+"</"+k+">";
 const group=(k,v)=>"<"+k+">"+v+"</"+k+">";
 const optional=(k,v)=>clean(v)?tag(k,v):"";
 const required=(v,label,max=300)=>{v=clean(v);if(!v||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ud800-\udfff]/u.test(v))throw Error("Revisa "+label+".");return v};
 function scaled(v,n,label){const s=String(v??"");if(!/^\d+(?:\.\d+)?$/.test(s))throw Error("Revisa "+label+".");const [a,b=""]=s.split(".");if(b.length>n||a.length>12)throw Error("Precisión inválida: "+label);return BigInt(a)*10n**BigInt(n)+BigInt(b.padEnd(n,"0")||"0")}
 const dec=(v,n)=>{const s=v.toString().padStart(n+1,"0");return n?s.slice(0,-n)+"."+s.slice(-n):s};
 const rounded=(num,den)=>(num+den/2n)/den;
 function dateParts(value){const s=String(value||"");if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error("Fecha inválida.");const d=new Date(s+"T00:00:00Z");if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error("Fecha inválida.");return s.split("-").reverse()}
 function checkDigit(s){if(!/^\d{48}$/.test(s))throw Error("La base de la clave debe contener 48 dígitos.");let sum=0,f=2;for(let i=s.length-1;i>=0;i--){sum+=Number(s[i])*f;f=f===7?2:f+1}const x=11-sum%11;return String(x===11?0:x===10?1:x)}
 function testKey(date,ruc,estab,point,seq,code){if(!/^\d{13}$/.test(ruc)||!/^\d{3}$/.test(estab)||!/^\d{3}$/.test(point)||!/^\d{9}$/.test(seq)||!/^\d{8}$/.test(code)||seq==="000000000")throw Error("Datos de numeración de prueba inválidos.");const s=dateParts(date).join("")+"01"+ruc+"1"+estab+point+seq+code+"1";return s+checkDigit(s)}
 function build(d,issuer,opts={}){
  if(!d||!issuer||!Array.isArray(d.lines)||!d.lines.length||d.lines.length>100)throw Error("Borrador incompleto.");
  const b=d.buyer||{}, types={ruc:"04",cedula:"05",passport:"06"};
  const type=types[b.identification_type],ident=required(b.identification,"identificación del cliente",20);
  if(!type||(type==="04"&&!/^\d{13}$/.test(ident))||(type==="05"&&!/^\d{10}$/.test(ident))||(type==="06"&&!/^[A-Za-z0-9-]{1,20}$/.test(ident)))throw Error("Completa la identificación del cliente. Consumidor final no está habilitado en esta etapa.");
  const name=required(b.name,"nombre del comprador"),ruc=required(issuer.ruc,"RUC del emisor",13),legal=required(issuer.legal_name,"razón social del emisor"),matrix=required([issuer.matrix_line1,issuer.matrix_line2].filter(Boolean).join(" "),"dirección matriz"),branch=required([issuer.branch_line1,issuer.branch_line2].filter(Boolean).join(" "),"dirección establecimiento");
  if(!["SI","NO"].includes(issuer.accounting))throw Error("Obligación contable sin configurar.");
  const estab="002",point="001",seq=String(opts.sequence||"000000001"),code=String(opts.code||"12345678");
  const key=testKey(d.issue_date,ruc,estab,point,seq,code);
  const payment=String(d.payment_code);if(!["01","16","19","20"].includes(payment))throw Error("Forma de pago no habilitada en pruebas.");
  let subtotal=0n,discount=0n,tax=0n;const buckets=new Map();
  const details=d.lines.map((l,i)=>{
   const n="línea "+(i+1),q=scaled(l.quantity,6,n+" cantidad"),u=scaled(l.unit_net,6,n+" precio"),ds=scaled(l.discount,2,n+" descuento"),r=Number(l.rate);
   if(q<=0n||![0,15].includes(r))throw Error("Cantidad o tarifa no admitida: "+n);
   const base=rounded(q*u,10000000000n)-ds;if(base<0n)throw Error("Descuento superior al importe: "+n);
   const vat=rounded(base*BigInt(r),100n);
   if(base!==scaled(l.base,2,n+" subtotal")||vat!==scaled(l.tax,2,n+" IVA"))throw Error("Importes guardados inconsistentes: "+n);
   subtotal+=base;discount+=ds;tax+=vat;const bucket=buckets.get(r)||{base:0n,tax:0n};bucket.base+=base;bucket.tax+=vat;buckets.set(r,bucket);
   const pct=r===15?"4":"0",product=required(l.code,"código principal "+n,25),desc=required(l.description,"descripción "+n);
   if(clean(l.aux).length>25||clean(l.extra).length>300)throw Error("Detalle excede longitud: "+n);
   return group("detalle",tag("codigoPrincipal",product)+optional("codigoAuxiliar",l.aux)+tag("descripcion",desc)+tag("cantidad",dec(q,6))+tag("precioUnitario",dec(u,6))+tag("descuento",dec(ds,2))+tag("precioTotalSinImpuesto",dec(base,2))+(clean(l.extra)?group("detallesAdicionales",'<detAdicional nombre="Detalle" valor="'+esc(l.extra)+'"/>'):"")+group("impuestos",group("impuesto",tag("codigo","2")+tag("codigoPorcentaje",pct)+tag("tarifa",r.toFixed(2))+tag("baseImponible",dec(base,2))+tag("valor",dec(vat,2)))));
  }).join("");
  const total=subtotal+tax;if(subtotal!==scaled(d.subtotal,2,"subtotal")||discount!==scaled(d.discount,2,"descuento")||tax!==scaled(d.tax,2,"IVA")||total!==scaled(d.total,2,"total"))throw Error("Los totales del borrador no coinciden.");
  const taxTotals=[...buckets].sort((a,b)=>a[0]-b[0]).map(([r,v])=>group("totalImpuesto",tag("codigo","2")+tag("codigoPorcentaje",r===15?"4":"0")+tag("baseImponible",dec(v.base,2))+tag("valor",dec(v.tax,2)))).join("");
  const additional=[["Telefono",b.phone],["Email",b.email],["Estado","PRUEBA LOCAL SIN FIRMA - NO TRANSMITIR"]];if(opts.providerRuc){if(!/^\d{13}$/.test(opts.providerRuc))throw Error("RUC proveedor inválido.");additional.push(["RUC Proveedor",opts.providerRuc])}
  const info=additional.filter(x=>clean(x[1])).map(([k,v])=>'<campoAdicional nombre="'+esc(k)+'">'+esc(required(v,k))+"</campoAdicional>").join("");
  const xml='<?xml version="1.0" encoding="UTF-8"?>\n<!-- PRUEBA LOCAL SIN VALIDEZ TRIBUTARIA. NO TRANSMITIR. -->\n<factura id="comprobante" version="1.1.0">'+group("infoTributaria",tag("ambiente","1")+tag("tipoEmision","1")+tag("razonSocial",legal)+optional("nombreComercial",issuer.trade_name)+tag("ruc",ruc)+tag("claveAcceso",key)+tag("codDoc","01")+tag("estab",estab)+tag("ptoEmi",point)+tag("secuencial",seq)+tag("dirMatriz",matrix))+group("infoFactura",tag("fechaEmision",dateParts(d.issue_date).join("/"))+tag("dirEstablecimiento",branch)+tag("obligadoContabilidad",issuer.accounting)+tag("tipoIdentificacionComprador",type)+tag("razonSocialComprador",name)+tag("identificacionComprador",ident)+optional("direccionComprador",b.address)+tag("totalSinImpuestos",dec(subtotal,2))+tag("totalDescuento",dec(discount,2))+group("totalConImpuestos",taxTotals)+tag("propina","0.00")+tag("importeTotal",dec(total,2))+tag("moneda","DOLAR")+group("pagos",group("pago",tag("formaPago",payment)+tag("total",dec(total,2)))))+group("detalles",details)+group("infoAdicional",info)+"</factura>";
  return {xml,key,sequence:seq,environment:"1",version:"1.1.0"};
 }
 scope.NICOLE_XML=Object.freeze({build,checkDigit,testKey});
})(typeof window!=="undefined"?window:globalThis);
