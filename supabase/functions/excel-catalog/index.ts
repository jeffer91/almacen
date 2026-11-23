// Nicole Encajes: lectura de Excel original bajo sesión administrativa.
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
async function authorized(req: Request): Promise<boolean> {
  const token = String(req.headers.get("x-almacen-key") || "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const bytes = new TextEncoder().encode(token);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  const hash = [...digest].map(v => v.toString(16).padStart(2, "0")).join("");
  const { data, error } = await db.from("family_admin_sessions").select("token_hash")
    .eq("token_hash", hash).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (req.method !== "POST") return send({ ok: false, error: "Método no permitido" }, 405);
  try {
    if (!(await authorized(req))) return send({ ok: false, error: "Sesión administrativa requerida" }, 401);
    const body = await req.json().catch(() => ({}));
    if (body?.action === "sheets") {
      const { data, error } = await db.from("family_excel_catalog_sheets")
        .select("sheet_name,sheet_order,title,header_row,headers,max_column,row_count")
        .order("sheet_order", { ascending: true });
      if (error) throw error;
      return send({ ok: true, sheets: data ?? [] });
    }
    if (body?.action === "rows") {
      const offset = Number(body.offset);
      const asked = Number(body.limit);
      if (!Number.isInteger(offset) || offset < 0 || offset > 100000)
        return send({ ok: false, error: "Paginación inválida" }, 400);
      const limit = Number.isInteger(asked) ? Math.min(500, Math.max(1, asked)) : 500;
      const { data, error } = await db.from("family_excel_catalog_rows")
        .select("sheet_name,sheet_row,display_name,cells,batch_no")
        .order("sheet_name", { ascending: true })
        .order("sheet_row", { ascending: true })
        .range(offset, offset + limit - 1);
      if (error) throw error;
      return send({ ok: true, rows: data ?? [] });
    }
    return send({ ok: false, error: "Acción no reconocida" }, 400);
  } catch (e) {
    console.error("excel-catalog:", e);
    return send({ ok: false, error: "No fue posible consultar el catálogo privado." }, 500);
  }
});
