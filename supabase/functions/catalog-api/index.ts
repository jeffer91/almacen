// Supabase Edge Function catalog-api. Deploy with --no-verify-jwt.
// Lectura pública (lista de precios) y fotos públicas para la familia.
// Todo lo demás (productos, precios, costos, proveedores) exige la clave privada de la app Electron de Jefferson.
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const db = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type,x-almacen-key",
  "access-control-allow-methods": "POST,OPTIONS",
  "content-type": "application/json;charset=utf-8",
  "cache-control": "no-store"
};
type Shop = "edgar" | "gloria" | "jefferson";
const shops: Shop[] = ["edgar", "gloria", "jefferson"];
function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers });
}
function fail(message: string, status = 400): Response { return response({ ok: false, error: message }, status); }
function message(error: any) { return error?.message || "No se pudo completar la operación"; }
function txt(value: unknown, limit = 180): string { return String(value ?? "").trim().slice(0, limit); }
function amount(value: unknown): number {
  const n = Number(value);
  if (value === "" || value === null || !Number.isFinite(n) || n < 0 || n > 999999999) throw new Error("Valor monetario inválido");
  return n;
}
function requiredId(value: unknown): string {
  const s = txt(value, 60);
  if (!/^[a-f0-9-]{36}$/i.test(s)) throw new Error("Identificador inválido");
  return s;
}
async function hash(secret: string): Promise<string> {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function getRole(request: Request): Promise<Shop | null> {
  const secret = request.headers.get("x-almacen-key") || "";
  if (!/^[a-f0-9]{64}$/i.test(secret)) return null;
  const { data, error } = await db.from("family_access_links").select("role")
    .eq("token_hash", await hash(secret.toLowerCase())).eq("enabled", true).maybeSingle();
  if (error || !data || !shops.includes(data.role)) return null;
  return data.role as Shop;
}
async function audit(role: Shop, action: string, id: string, details: Record<string,unknown> = {}) {
  const { error } = await db.from("family_audit").insert({ actor: role, action, target_id: id, details });
  if (error) console.warn("Auditoría:", error.message);
}
async function ownProduct(role: Shop, id: string) {
  const { data, error } = await db.from("family_products").select("created_by").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Producto no encontrado");
  if (role !== "jefferson" && data.created_by !== role) throw new Error("Solo su creador o Jefferson puede editar este producto");
}
async function ownPresentation(role: Shop, id: string) {
  const { data, error } = await db.from("family_presentations").select("product_id").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Presentación no encontrada");
  await ownProduct(role, data.product_id);
}
async function listAll(table: string, columns: string) {
  const rows: Record<string,unknown>[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await db.from(table).select(columns).range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) break;
    offset += 1000;
    if (offset > 20000) throw new Error("El catálogo es demasiado grande para una sola descarga");
  }
  return rows;
}
async function signPhotos(photos: Record<string,unknown>[]) {
  const paths = photos.map((p) => String(p.storage_path));
  for (let i = 0; i < paths.length; i += 100) {
    const { data, error } = await db.storage.from("family-photos").createSignedUrls(paths.slice(i, i + 100), 3600);
    if (error) console.warn("Firmar fotos:", error.message);
    for (let j = 0; j < (data || []).length; j++) photos[i + j].signed_url = data?.[j]?.signedUrl || null;
  }
  return photos;
}
async function bootstrap(role: Shop) {
  const [products, presentations, suppliers, prices, costs, photos] = await Promise.all([
    listAll("family_products", "*"), listAll("family_presentations", "*"),
    listAll("family_suppliers", "*"), listAll("family_prices", "*"),
    listAll("family_cost_history", "*"), listAll("family_photos", "*")
  ]);
  await signPhotos(photos);
  return response({ ok: true, role, products, presentations, suppliers, prices, costs, photos, server_time: new Date().toISOString() });
}
// Lista pública: sin costos, sin proveedores y solo productos activos.
async function publicCatalog() {
  const [products, presentations, prices, photos] = await Promise.all([
    listAll("family_products", "id,name,category,brand,active,updated_at"),
    listAll("family_presentations", "id,product_id,label,quantity,unit,updated_at"),
    listAll("family_prices", "presentation_id,shop,price,updated_at"),
    listAll("family_photos", "id,product_id,storage_path,color_label,is_primary,created_by,created_at")
  ]);
  const active = products.filter((p) => p.active !== false);
  const ids = new Set(active.map((p) => p.id));
  const visiblePhotos = photos.filter((p) => ids.has(p.product_id));
  await signPhotos(visiblePhotos);
  for (const p of visiblePhotos) delete p.storage_path;
  return response({ ok: true, role: "familia", products: active,
    presentations: presentations.filter((p) => ids.has(p.product_id)), prices,
    photos: visiblePhotos, server_time: new Date().toISOString() });
}
async function uploadPhoto(role: Shop, body: any, limitPerProduct = 0) {
  const product_id = requiredId(body.product_id);
  const { data: product, error: productError } = await db.from("family_products")
    .select("id,active").eq("id", product_id).maybeSingle();
  if (productError) throw productError;
  if (!product || product.active === false) return fail("Producto no encontrado", 404);
  const base64 = txt(body.data, 3000000);
  const mime = txt(body.mime, 30);
  if (!["image/jpeg","image/png","image/webp"].includes(mime)) return fail("Formato de imagen no permitido");
  if (!base64 || base64.length > 2700000) return fail("La fotografía es demasiado grande");
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  if (bytes.byteLength > 2097152) return fail("Máximo 2 MB por fotografía");
  const { count } = await db.from("family_photos").select("id", { count: "exact", head: true }).eq("product_id", product_id);
  if (limitPerProduct && (count || 0) >= limitPerProduct) return fail("Este producto ya tiene suficientes fotos");
  const extension = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
  const path = `${product_id}/${crypto.randomUUID()}.${extension}`;
  const { error: storageError } = await db.storage.from("family-photos").upload(path, bytes, { contentType: mime, upsert: false });
  if (storageError) throw storageError;
  const { data, error } = await db.from("family_photos").insert({
    product_id, storage_path: path, color_label: txt(body.color_label, 80),
    is_primary: !count, created_by: role
  }).select("id").single();
  if (error) {
    await db.storage.from("family-photos").remove([path]);
    throw error;
  }
  await audit(role, "uploadPhoto", data.id);
  return response({ ok: true, id: data.id });
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return fail("Método no permitido", 405);
  if (!supabaseUrl || !serviceKey) return fail("Falta configurar Supabase", 503);
  let body: any;
  try { body = await request.json(); } catch { return fail("Solicitud JSON inválida"); }
  const action = txt(body?.action, 50);
  const role = await getRole(request);
  if (!role) {
    // Acceso público de la familia: ver precios y subir fotos de productos.
    try {
      if (action === "catalog") return await publicCatalog();
      if (action === "uploadPhoto") {
        const by = txt(body.by, 20).toLowerCase();
        if (by !== "edgar" && by !== "gloria") return fail("Indica quién toma la foto");
        return await uploadPhoto(by as Shop, body, 12);
      }
    } catch (error) {
      console.error(action, error);
      return fail(message(error), 400);
    }
    return fail("Esta acción solo está disponible en la app de Jefferson", 401);
  }
  try {
    if (action === "catalog") return await publicCatalog();
    if (action === "bootstrap") return await bootstrap(role);

    if (action === "importExcel") {
      if (role !== "jefferson") return fail("Solo Jefferson puede importar Excel", 403);
      if (!Array.isArray(body.rows) || body.rows.length < 1 || body.rows.length > 500)
        return fail("El Excel debe contener entre 1 y 500 presentaciones");
      const rows = body.rows.map((r: any) => ({
        producto: txt(r.producto, 180), presentacion: txt(r.presentacion, 80),
        cantidad: r.cantidad, unidad: txt(r.unidad, 40),
        marca: txt(r.marca, 100), categoria: txt(r.categoria, 100),
        proveedor: txt(r.proveedor, 160), costo: r.costo,
        precio_edgar: r.precio_edgar, precio_gloria: r.precio_gloria,
        precio_jefferson: r.precio_jefferson
      }));
      const { data, error } = await db.rpc("family_import_catalog", { p_rows: rows });
      if (error) throw error;
      return response({ ok: true, summary: data });
    }

    if (action === "addProduct") {
      const name = txt(body.name);
      if (!name) return fail("Indica el nombre del producto");
      const { data, error } = await db.from("family_products")
        .insert({ name, category: txt(body.category, 100), brand: txt(body.brand, 100), created_by: role })
        .select("id").single();
      if (error) throw error;
      await audit(role, action, data.id);
      return response({ ok: true, id: data.id });
    }
    if (action === "editProduct") {
      const id = requiredId(body.id);
      await ownProduct(role, id);
      const name = txt(body.name);
      if (!name) return fail("Indica un nombre válido");
      const { error } = await db.from("family_products").update({
        name, category: txt(body.category, 100), brand: txt(body.brand, 100), updated_at: new Date().toISOString()
      }).eq("id", id);
      if (error) throw error;
      await audit(role, action, id);
      return response({ ok: true });
    }
    if (action === "addPresentation") {
      const product_id = requiredId(body.product_id);
      await ownProduct(role, product_id);
      const label = txt(body.label, 80);
      const quantity = Number(body.quantity);
      if (!label || !Number.isFinite(quantity) || quantity <= 0 || quantity > 999999999) return fail("Presentación o cantidad inválida");
      const { data, error } = await db.from("family_presentations").insert({
        product_id, label, quantity, unit: txt(body.unit, 40) || "unidad"
      }).select("id").single();
      if (error) throw error;
      await audit(role, action, data.id);
      return response({ ok: true, id: data.id });
    }
    if (action === "editPresentation") {
      const id = requiredId(body.id);
      await ownPresentation(role, id);
      const label = txt(body.label, 80);
      const quantity = Number(body.quantity);
      if (!label || !Number.isFinite(quantity) || quantity <= 0) return fail("Presentación o cantidad inválida");
      const { error } = await db.from("family_presentations").update({
        label, quantity, unit: txt(body.unit, 40) || "unidad", updated_at: new Date().toISOString()
      }).eq("id", id);
      if (error) throw error;
      await audit(role, action, id);
      return response({ ok: true });
    }
    if (action === "addSupplier") {
      if (role !== "jefferson") return fail("Solo Jefferson puede registrar proveedores", 403);
      const name = txt(body.name, 160);
      if (!name) return fail("Indica un proveedor");
      const { data, error } = await db.from("family_suppliers").insert({
        name, phone: txt(body.phone, 60)
      }).select("id").single();
      if (error) throw error;
      await audit(role, action, data.id);
      return response({ ok: true, id: data.id });
    }
    if (action === "setCost") {
      if (role !== "jefferson") return fail("Solo Jefferson puede registrar costos", 403);
      const id = requiredId(body.presentation_id);
      const cost = amount(body.cost);
      const supplier = body.supplier_id ? requiredId(body.supplier_id) : null;
      const { error } = await db.rpc("family_set_cost", {
        p_presentation_id: id, p_cost: cost, p_supplier_id: supplier
      });
      if (error) throw error;
      await audit(role, action, id, { cost, supplier_id: supplier });
      return response({ ok: true });
    }
    if (action === "setPrice") {
      const id = requiredId(body.presentation_id);
      const shop = txt(body.shop) as Shop;
      if (!shops.includes(shop)) return fail("Almacén inválido");
      if (role !== "jefferson" && role !== shop) return fail("No puedes modificar los precios de otro almacén", 403);
      const price = amount(body.price);
      const { error } = await db.from("family_prices").upsert({
        presentation_id: id, shop, price, updated_by: role, updated_at: new Date().toISOString()
      }, { onConflict: "presentation_id,shop" });
      if (error) throw error;
      await audit(role, action, id, { shop, price });
      return response({ ok: true });
    }
    if (action === "resetPrice") {
      const id = requiredId(body.presentation_id);
      const shop = txt(body.shop) as Shop;
      if (!shops.includes(shop) || (role !== "jefferson" && role !== shop)) return fail("Acceso denegado", 403);
      const { error } = await db.from("family_prices").delete().eq("presentation_id", id).eq("shop", shop);
      if (error) throw error;
      await audit(role, action, id, { shop });
      return response({ ok: true });
    }
    if (action === "uploadPhoto") return await uploadPhoto(role, body);
    if (action === "setPrimaryPhoto") {
      const product_id = requiredId(body.product_id);
      const photo_id = requiredId(body.photo_id);
      const { data: photo, error: photoError } = await db.from("family_photos")
        .select("id").eq("id", photo_id).eq("product_id", product_id).maybeSingle();
      if (photoError) throw photoError;
      if (!photo) return fail("Fotografía no encontrada");
      const { error: resetError } = await db.from("family_photos").update({ is_primary: false }).eq("product_id", product_id).eq("is_primary", true);
      if (resetError) throw resetError;
      const { error } = await db.from("family_photos").update({ is_primary: true }).eq("id", photo_id);
      if (error) throw error;
      await audit(role, action, photo_id);
      return response({ ok: true });
    }
    if (action === "deletePhoto") {
      if (role !== "jefferson") return fail("Solo Jefferson puede eliminar fotografías", 403);
      const photo_id = requiredId(body.photo_id);
      const { data: photo, error: photoError } = await db.from("family_photos")
        .select("id,product_id,storage_path,is_primary").eq("id", photo_id).maybeSingle();
      if (photoError) throw photoError;
      if (!photo) return fail("Fotografía no encontrada", 404);
      const { error: storageError } = await db.storage.from("family-photos").remove([photo.storage_path]);
      if (storageError) throw storageError;
      const { error } = await db.from("family_photos").delete().eq("id", photo_id);
      if (error) throw error;
      if (photo.is_primary) {
        const { data: next } = await db.from("family_photos").select("id").eq("product_id", photo.product_id)
          .order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (next) await db.from("family_photos").update({ is_primary: true }).eq("id", next.id);
      }
      await audit(role, action, photo_id, { product_id: photo.product_id });
      return response({ ok: true });
    }
    if (action === "archiveProduct") {
      if (role !== "jefferson") return fail("Solo Jefferson puede retirar productos", 403);
      const id = requiredId(body.id);
      const { error } = await db.from("family_products").update({ active: false, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) throw error;
      await audit(role, action, id);
      return response({ ok: true });
    }
    return fail("Operación desconocida", 404);
  } catch (error) {
    console.error(action, error);
    return fail(message(error), 400);
  }
});
