-- Importación atómica y validada de la plantilla de Nicole Encajes.
-- Disponible exclusivamente para la API administrativa de Jefferson (service_role).
create or replace function public.family_import_catalog(p_rows jsonb)
returns jsonb
language plpgsql security definer
set search_path=public
as $$
declare
  r jsonb;
  prod_id uuid;
  pres_id uuid;
  supp_id uuid;
  prod_name text;
  pres_name text;
  brand_name text;
  category_name text;
  unit_name text;
  supplier_name text;
  qty numeric;
  cost_value numeric;
  old_cost numeric;
  old_supplier uuid;
  shop_name text;
  price_value numeric;
  created_products integer := 0;
  created_presentations integer := 0;
  cost_updates integer := 0;
  price_updates integer := 0;
  new_suppliers integer := 0;
  row_number integer := 0;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) < 1
     or jsonb_array_length(p_rows) > 500 then
    raise exception 'El archivo debe contener entre 1 y 500 presentaciones.';
  end if;

  for r in select value from jsonb_array_elements(p_rows) loop
    row_number := row_number + 1;
    prod_name := btrim(coalesce(r->>'producto',''));
    pres_name := btrim(coalesce(r->>'presentacion',''));
    brand_name := left(btrim(coalesce(r->>'marca','')),100);
    category_name := left(btrim(coalesce(r->>'categoria','')),100);
    unit_name := btrim(coalesce(r->>'unidad',''));
    supplier_name := left(btrim(coalesce(r->>'proveedor','')),160);
    if length(prod_name) < 1 or length(prod_name) > 180 or
       length(pres_name) < 1 or length(pres_name) > 80 or
       length(unit_name) < 1 or length(unit_name) > 40 then
      raise exception 'Fila %: producto, presentación y unidad son obligatorios.',row_number;
    end if;
    if r->>'cantidad' is null or (r->>'cantidad') !~ '^[0-9]+(\.[0-9]+)?$' then
      raise exception 'Fila %: cantidad inválida.',row_number;
    end if;
    qty := (r->>'cantidad')::numeric;
    if qty <= 0 or qty > 999999999 then
      raise exception 'Fila %: cantidad fuera de rango.',row_number;
    end if;

    select id into prod_id from family_products
      where lower(btrim(name))=lower(prod_name)
      and lower(btrim(brand))=lower(brand_name)
      order by created_at asc limit 1;
    if prod_id is null then
      insert into family_products(name,brand,category,created_by)
        values(prod_name,brand_name,category_name,'jefferson')
        returning id into prod_id;
      created_products := created_products + 1;
    end if;

    select id into pres_id from family_presentations
      where product_id=prod_id and lower(btrim(label))=lower(pres_name)
      order by created_at asc limit 1;
    if pres_id is null then
      insert into family_presentations(product_id,label,quantity,unit)
        values(prod_id,pres_name,qty,unit_name) returning id into pres_id;
      created_presentations := created_presentations + 1;
    else
      update family_presentations set quantity=qty,unit=unit_name,updated_at=now()
        where id=pres_id;
    end if;

    supp_id := null;
    if supplier_name <> '' then
      select id into supp_id from family_suppliers
        where lower(btrim(name))=lower(supplier_name)
        order by created_at limit 1;
      if supp_id is null then
        insert into family_suppliers(name) values(supplier_name) returning id into supp_id;
        new_suppliers := new_suppliers + 1;
      end if;
    end if;

    -- Costo vacío significa "no modificar".
    if r->>'costo' is not null and r->>'costo' <> '' then
      if (r->>'costo') !~ '^[0-9]+(\.[0-9]+)?$' then
        raise exception 'Fila %: costo inválido.',row_number;
      end if;
      cost_value := (r->>'costo')::numeric;
      if cost_value > 999999999 then raise exception 'Fila %: costo fuera de rango.',row_number; end if;
      select current_cost,supplier_id into old_cost,old_supplier
        from family_presentations where id=pres_id;
      if old_cost is distinct from cost_value or (supplier_name<>'' and old_supplier is distinct from supp_id) then
        perform family_set_cost(pres_id,cost_value,
           case when supplier_name<>'' then supp_id else old_supplier end);
        cost_updates := cost_updates + 1;
      end if;
    end if;

    foreach shop_name in array array['edgar','gloria','jefferson'] loop
      if r ? ('precio_'||shop_name) and r->>('precio_'||shop_name) is not null
         and r->>('precio_'||shop_name) <> '' then
        if r->>('precio_'||shop_name) !~ '^[0-9]+(\.[0-9]{1,2})?$' then
          raise exception 'Fila %: precio % inválido.',row_number,shop_name;
        end if;
        price_value := (r->>('precio_'||shop_name))::numeric;
        if price_value > 999999999 then raise exception 'Fila %: precio fuera de rango.',row_number; end if;
        insert into family_prices(presentation_id,shop,price,updated_by)
          values(pres_id,shop_name,price_value,'jefferson')
          on conflict(presentation_id,shop) do update
          set price=excluded.price,updated_at=now(),updated_by='jefferson'
          where family_prices.price is distinct from excluded.price;
        if found then price_updates := price_updates + 1; end if;
      end if;
    end loop;
    prod_id := null;
    pres_id := null;
  end loop;

  insert into family_audit(actor,action,target_id,details)
  values('jefferson','import_excel','catalog',jsonb_build_object(
    'rows',row_number,'products',created_products,'presentations',created_presentations,
    'costs',cost_updates,'prices',price_updates,'suppliers',new_suppliers));
  return jsonb_build_object('rows',row_number,'products',created_products,
    'presentations',created_presentations,'costs',cost_updates,
    'prices',price_updates,'suppliers',new_suppliers);
end $$;

revoke all on function public.family_import_catalog(jsonb) from public,anon,authenticated;
grant execute on function public.family_import_catalog(jsonb) to service_role;
