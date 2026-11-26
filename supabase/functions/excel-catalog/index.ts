// Nicole Encajes: lectura pública de Excel original, sin acceso directo a tablas.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST,OPTIONS",
  "access-control-allow-headers": "content-type,x-almacen-key,apikey,authorization",
  "content-type": "application/json;charset=utf-8",
  "cache-control": "no-store"
};
function send(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers });
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return send({ ok: false, error: "Método no permitido" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === "smartRows") {
      const offset=Number(body.offset??0);
      if(!Number.isInteger(offset)||offset<0||offset>100000)return send({ok:false,error:"Paginación inválida"},400);
      const {data,error}=await db.from("family_smart_catalog")
        .select("source_id,source_kind,canonical_name,category,variety,provider,size_value,size_unit,presentation,cost,tariffs,search_text,conflict,needs_review")
        .order("source_id").range(offset,offset+499);
      if(error)throw error;
      return send({ok:true,rows:data??[]});
    }
    if (body?.action === "sheets") {
      const { data, error } = await db.from("family_excel_catalog_sheets")
        .select("sheet_name,sheet_order,title,header_row,headers,max_column,row_count")
        .order("sheet_order", { ascending: true });
      if (error) throw error;
      return send({ ok: true, sheets: data ?? [] });
    }
    if (body?.action === "rows" || body?.action === "salesRows") {
      const offset = Number(body.offset);
      const asked = Number(body.limit);
      if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
        return send({ ok: false, error: "Paginación inválida" }, 400);
      const limit = Number.isInteger(asked) ? Math.min(500, Math.max(1, asked)) : 500;
      let table="family_excel_catalog_rows";
      if(body.action==="salesRows"){
        const {count,error}=await db.from("family_excel_live_rows").select("sheet_row",{count:"exact",head:true});
        if(error)throw error;
        if(count && count>0)table="family_excel_live_rows";
      }
      const { data, error } = await db.from(table)
        .select("sheet_name,sheet_row,display_name,cells")
        .order("sheet_name", { ascending: true })
        .order("sheet_row", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return send({ ok: true, rows: data ?? [] });
    }
    return send({ ok: false, error: "Acción no reconocida" }, 400);
  } catch (e) {
    console.error("excel-catalog:", e);
    return send({ ok: false, error: "No fue posible consultar el catálogo." }, 500);
  }
});
