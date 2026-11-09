-- Nicole Encajes · Fase 1 de administración:
-- código (SKU) por presentación, datos de la tienda, PIN con sesiones e importación por SKU con precio sin IVA.
-- El PIN NO se guarda en este archivo (repositorio público): se carga aparte como hash con sal.

alter table public.family_presentations add column if not exists sku text
  check (sku is null or length(btrim(sku)) between 1 and 40);
create unique index if not exists family_presentations_sku_uidx
  on public.family_presentations (lower(btrim(sku))) where sku is not null;

create table if not exists public.family_settings (
  key text primary key check (length(key) between 1 and 60),
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.family_settings(key, value)
values ('store', jsonb_build_object('name','Nicole Encajes','ruc','','phone','','address','','email','','iva_rate',15,'quote_valid_days',8))
on conflict (key) do nothing;

create table if not exists public.family_admin_auth (
  id smallint primary key default 1 check (id = 1),
  pin_salt text not null,
  pin_hash text not null,
  failed_attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.family_admin_sessions (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_used_at timestamptz not null default now()
);
create index if not exists family_admin_sessions_expiry_idx on public.family_admin_sessions (expires_at);

alter table public.family_settings enable row level security;
alter table public.family_admin_auth enable row level security;
alter table public.family_admin_sessions enable row level security;
revoke all on public.family_settings, public.family_admin_auth, public.family_admin_sessions from anon, authenticated;

-- Importación por lote. Columnas: codigo, producto, marca, categoria, presentacion, cantidad, unidad,
-- proveedor, costo, precio (sin IVA). Busca primero por código; si no hay, por producto+marca+presentación.
-- Celdas vacías de costo o precio = "no modificar".
create or replace function public.family_import_catalog_v2(p_rows jsonb)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  r jsonb;
  prod_id uuid; pres_id uuid; supp_id uuid;
  code text; prod_name text; pres_name text; brand_name text; category_name text; unit_name text; supplier_name text;
  qty numeric; cost_value numeric; price_value numeric; old_cost numeric; old_supplier uuid;
  created_products int := 0; created_presentations int := 0; updated_presentations int := 0;
  cost_updates int := 0; price_updates int := 0; new_suppliers int := 0; n int := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1
     or jsonb_array_length(p_rows) > 500 then
    raise exception 'El archivo debe contener entre 1 y 500 presentaciones.';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    n := n + 1;
    code := nullif(left(btrim(coalesce(r->>'codigo','')), 40), '');
    prod_name := btrim(coalesce(r->>'producto',''));
    pres_name := btrim(coalesce(r->>'presentacion',''));
    brand_name := left(btrim(coalesce(r->>'marca','')), 100);
    category_name := left(btrim(coalesce(r->>'categoria','')), 100);
    unit_name := btrim(coalesce(nullif(r->>'unidad',''), 'unidad'));
    supplier_name := left(btrim(coalesce(r->>'proveedor','')), 160);
    if length(prod_name) not between 1 and 180 or length(pres_name) not between 1 and 80 or length(unit_name) > 40 then
      raise exception 'Fila %: producto y presentación son obligatorios.', n;
    end if;
    if coalesce(r->>'cantidad','') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Fila %: cantidad inválida.', n; end if;
    qty := (r->>'cantidad')::numeric;
    if qty <= 0 or qty > 999999999 then raise exception 'Fila %: cantidad fuera de rango.', n; end if;

    pres_id := null; prod_id := null;
    if code is not null then
      select p.id, p.product_id into pres_id, prod_id from family_presentations p
        where lower(btrim(p.sku)) = lower(code) limit 1;
    end if;

    if pres_id is not null then
      update family_products set name = prod_name, brand = brand_name,
        category = case when category_name <> '' then category_name else category end,
        active = true, updated_at = now() where id = prod_id;
      update family_presentations set label = pres_name, quantity = qty, unit = unit_name, updated_at = now()
        where id = pres_id;
      updated_presentations := updated_presentations + 1;
    else
      select id into prod_id from family_products
        where lower(btrim(name)) = lower(prod_name) and lower(btrim(brand)) = lower(brand_name)
        order by created_at limit 1;
      if prod_id is null then
        insert into family_products(name, brand, category, created_by)
          values (prod_name, brand_name, category_name, 'jefferson') returning id into prod_id;
        created_products := created_products + 1;
      elsif category_name <> '' then
        update family_products set category = category_name, active = true, updated_at = now() where id = prod_id;
      end if;
      select id into pres_id from family_presentations
        where product_id = prod_id and lower(btrim(label)) = lower(pres_name)
          and (code is null or sku is null)
        order by created_at limit 1;
      if pres_id is null then
        insert into family_presentations(product_id, label, quantity, unit, sku)
          values (prod_id, pres_name, qty, unit_name, code) returning id into pres_id;
        created_presentations := created_presentations + 1;
      else
        update family_presentations set quantity = qty, unit = unit_name, sku = coalesce(code, sku), updated_at = now()
          where id = pres_id;
        updated_presentations := updated_presentations + 1;
      end if;
    end if;

    supp_id := null;
    if supplier_name <> '' then
      select id into supp_id from family_suppliers where lower(btrim(name)) = lower(supplier_name) order by created_at limit 1;
      if supp_id is null then
        insert into family_suppliers(name) values (supplier_name) returning id into supp_id;
        new_suppliers := new_suppliers + 1;
      end if;
    end if;

    if coalesce(r->>'costo','') <> '' then
      if (r->>'costo') !~ '^[0-9]+(\.[0-9]+)?$' then raise exception 'Fila %: costo inválido.', n; end if;
      cost_value := (r->>'costo')::numeric;
      if cost_value > 999999999 then raise exception 'Fila %: costo fuera de rango.', n; end if;
      select current_cost, supplier_id into old_cost, old_supplier from family_presentations where id = pres_id;
      if old_cost is distinct from cost_value or (supp_id is not null and old_supplier is distinct from supp_id) then
        perform family_set_cost(pres_id, cost_value, coalesce(supp_id, old_supplier));
        cost_updates := cost_updates + 1;
      end if;
    elsif supp_id is not null then
      update family_presentations set supplier_id = supp_id where id = pres_id;
    end if;

    if coalesce(r->>'precio','') <> '' then
      if (r->>'precio') !~ '^[0-9]+(\.[0-9]{1,4})?$' then raise exception 'Fila %: precio inválido.', n; end if;
      price_value := round((r->>'precio')::numeric, 4);
      if price_value > 999999999 then raise exception 'Fila %: precio fuera de rango.', n; end if;
      insert into family_prices(presentation_id, shop, price, updated_by)
        values (pres_id, 'jefferson', price_value, 'jefferson')
        on conflict (presentation_id, shop) do update
        set price = excluded.price, updated_at = now(), updated_by = 'jefferson'
        where family_prices.price is distinct from excluded.price;
      if found then price_updates := price_updates + 1; end if;
    end if;
  end loop;

  insert into family_audit(actor, action, target_id, details)
  values ('jefferson', 'import_excel_v2', 'catalog', jsonb_build_object('rows', n, 'products', created_products,
    'presentations', created_presentations, 'updated', updated_presentations, 'costs', cost_updates,
    'prices', price_updates, 'suppliers', new_suppliers));
  return jsonb_build_object('rows', n, 'products', created_products, 'presentations', created_presentations,
    'updated', updated_presentations, 'costs', cost_updates, 'prices', price_updates, 'suppliers', new_suppliers);
end $$;
revoke all on function public.family_import_catalog_v2(jsonb) from public, anon, authenticated;
grant execute on function public.family_import_catalog_v2(jsonb) to service_role;
