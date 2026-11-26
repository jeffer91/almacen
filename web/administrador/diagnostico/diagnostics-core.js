"use strict";
(function(root,factory){const api=factory();if(typeof module==="object"&&module.exports)module.exports=api;else root.NICOLE_DIAGNOSTICS=api;})(typeof globalThis!=="undefined"?globalThis:this,()=>{
 const count=v=>Number.isInteger(v)&&v>=0?v:null;
 const number=v=>count(v)===null?"No comprobado":String(v);
 const yes=v=>v===true?"Sí":v===false?"No":"No comprobado";
 function checks(d){
  if(!d||!Number.isFinite(Date.parse(d.checked_at)))throw Error("Respuesta de diagnóstico inválida");
  const s=d.security||{},c=d.catalog||{},u=d.customers||{},v=d.sales||{},o=d.orders||{},g=d.sync||{},f=d.fiscal||{},sig=f.signing||{},l=d.limits||{};
  const row=(name,state,detail)=>({name,state,detail});
  const zero=(...values)=>values.some(x=>count(x)===null)?"unknown":values.some(x=>x>0)?"critical":"ok";
  const dataHealth=(...values)=>values.some(x=>count(x)===null)?"unknown":values.some(x=>x>0)?"warning":"ok";
  const bool=(x)=>x===true?"ok":x===false?"warning":"unknown";
  const security=typeof s.legacy_pairing_allowed!=="boolean"||count(s.catalog_session_checks)===null?"unknown":s.legacy_pairing_allowed||s.catalog_session_checks!==4?"critical":zero(s.public_table_access,s.long_sessions);
  const expiry=Date.parse(sig.valid_until),checked=Date.parse(d.checked_at);
  const cert=sig.certificate_registered===false?"warning":sig.certificate_registered!==true||!Number.isFinite(expiry)?"unknown":expiry<=checked?"critical":expiry-checked<30*86400000?"warning":"ok";
  return [row("Base de datos","ok","Consulta de Supabase completada; no equivale a una auditoría de disponibilidad."),
   row("Permisos y sesiones",security,number(s.public_table_access)+" tablas/vistas con permisos directos públicos; "+number(s.catalog_session_checks)+"/4 controles de sesión; acceso antiguo: "+yes(s.legacy_pairing_allowed)+"."),
   row("Exposición comercial",s.public_costs_policy==="public_reading_retained"?"warning":"unknown","La consulta pública de costos se conserva; falta revisar la política de acceso."),
   row("Productos y precios",dataHealth(c.conflicts,c.review,c.missing_cost),number(c.catalog_rows)+" registros; "+number(c.conflicts)+" conflictos; "+number(c.review)+" por revisar; "+number(c.missing_cost)+" presentaciones sin costo. Los grupos pueden coincidir."),
   row("Clientes",dataHealth(u.missing_identification),number(u.active)+" activos; "+number(u.missing_identification)+" sin identificación."),
   row("Integridad de ventas",zero(v.invalid_totals,v.headers_without_lines),number(v.purchases)+" compras; "+number(v.invalid_totals)+" diferencias matemáticas; "+number(v.headers_without_lines)+" compras sin líneas."),
   row("Ventas históricas",dataHealth(v.legacy_lines),number(v.legacy_lines)+" líneas sin vínculo a una compra moderna."),
   row("Pedidos y abonos",zero(o.invalid_totals,o.overpaid),number(o.total)+" pedidos; "+number(o.invalid_totals)+" diferencias; "+number(o.overpaid)+" sobrepagos. Sin registros no se verifica el flujo completo."),
   row("IVA de catálogo",zero(c.invalid_vat),number(c.fiscal_codes)+" códigos; "+number(c.invalid_vat)+" con tarifa distinta de 15 %."),
   row("Google Sheets",bool(g.bridge_configured),g.bridge_configured===true?"Puente configurado en base de datos; conexión efectiva no probada aquí.":"Puente no configurado o no comprobado."),
   row("Última importación",!Number.isFinite(Date.parse(g.last_import))?"unknown":checked-Date.parse(g.last_import)>86400000?"warning":"ok",g.last_import||"Sin registro de importación."),
   row("Certificado de firma",cert,sig.certificate_registered===true?"Vencimiento: "+(sig.valid_until||"sin fecha registrada"):"Certificado no registrado o no comprobado."),
   row("Firmador privado",bool(sig.signer_ready),"Estado registrado; no se ejecuta una firma real desde este panel."),
   row("Servicio del SRI",bool(sig.sri_ready),"Estado registrado; no se envían comprobantes ni se consulta autorización real."),
   row("Facturación productiva",f.production_enabled===false?"warning":f.production_enabled===true?"unknown":"unknown",f.production_enabled===false?"Bloqueada por requisitos pendientes.":"No certificada por este diagnóstico. Requiere comprobación del servicio fiscal."),
   row("Integridad de borradores",zero(f.invalid_totals),number(f.drafts)+" borradores; "+number(f.invalid_totals)+" diferencias de totales."),
   row("Restauración de respaldos",l.backup_restore_verified===true?"ok":"unknown","Sin evidencia de una restauración integral verificada."),
   row("Identidad individual en auditoría",l.individual_actor_attribution===true?"ok":"warning","El PIN compartido no identifica inequívocamente a cada persona.")];
 }
 return {checks};
});