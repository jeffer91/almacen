// Nicole Encajes: puente seguro Supabase → Google Apps Script, sin credenciales Google en la web.
import {createClient} from "jsr:@supabase/supabase-js@2";
const url=Deno.env.get("SUPABASE_URL")||"";
const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const db=createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
const headers={"content-type":"application/json;charset=utf-8","cache-control":"no-store",
  "access-control-allow-origin":"https://jeffer91.github.io",
  "access-control-allow-methods":"POST,OPTIONS","access-control-allow-headers":"content-type"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{headers,status});
Deno.serve(async(request:Request)=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="POST")return reply({ok:false,error:"Método no permitido"},405);
  try{
    const body=await request.json();
    const token=String(body?.p_token||"");
    if(!/^[0-9a-f]{64}$/.test(token))return reply({ok:false,error:"Inicia sesión en el panel comercial"},401);
    const {data:access,error:accessError}=await db.rpc("edgar_pin_validate",{p_token:token});
    if(accessError||access!==true)return reply({ok:false,error:"Sesión comercial no válida"},401);
    const {data:bridge,error:bridgeError}=await db.from("family_sheet_bridge").select("webhook,secret").eq("id",1).maybeSingle();
    if(bridgeError)throw bridgeError;
    const webhook=bridge?.webhook||Deno.env.get("EDGAR_SHEETS_WEBHOOK_URL")||"";
    const secret=bridge?.secret||Deno.env.get("EDGAR_SHEETS_SYNC_SECRET")||"";
    if(!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(webhook) || secret.length<32)
      return reply({ok:false,code:"GOOGLE_NOT_CONNECTED",error:"Google Sheets no está autorizado para sincronización automática.",needs_setup:true},503);
    const {data:last}=await db.from("family_audit").select("at").eq("actor","edgar")
      .eq("action","syncGoogleSheets").order("at",{ascending:false}).limit(1).maybeSingle();
    if(last?.at && Date.now()-Date.parse(last.at)<25000)
      return reply({ok:false,error:"Sincronización reciente. Revisa Google Sheets y vuelve a intentar después."},429);
    const resp=await fetch(webhook,{method:"POST",headers:{"content-type":"application/json"},
      body:JSON.stringify({secret,device:"0".repeat(64)}),redirect:"follow",signal:AbortSignal.timeout(45000)});
    const data=await resp.json().catch(()=>null);
    if(!resp.ok || !data?.ok || !Number.isInteger(data?.rows))
      return reply({ok:false,error:"Google Sheets no confirmó el respaldo. Supabase no se modificó."},502);
    const {error:auditError}=await db.from("family_audit").insert({actor:"edgar",action:"syncGoogleSheets",
      target_id:"RESPALDO_EDGAR",details:{rows:data.rows,synced_at:new Date().toISOString()}});
    if(auditError)console.warn("No se registró auditoría del respaldo");
    return reply({ok:true,rows:data.rows,synced_at:new Date().toISOString()});
  }catch(error){console.error("syncSheets",error);return reply({ok:false,error:"No se pudo sincronizar con Google Sheets; Supabase conserva los datos."},500)}
});
