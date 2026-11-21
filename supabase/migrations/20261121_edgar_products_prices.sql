-- Edgar: alta de productos reales y actualización de precios en el catálogo oficial.
-- El dispositivo debe haberse activado con una invitación de un solo uso.
create or replace function public.family_edgar_add_product(device text, entry jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  p_name text := btrim(coalesce(entry->>'product',''));
  p_brand text := btrim(coalesce(entry->>'brand',''));
  p_category text := btrim(coalesce(entry->>'category',''));
  p_label text := btrim(coalesce(entry->>'label',''));
  p_unit text := btrim(coalesce(nullif(entry->>'unit',''),'unidad'));
  p_supplier text := btrim(regexp_replace(coalesce(entry->>'supplier',''),'[[:space:]]+',' ','g'));
  p_qty numeric; p_cost numeric; p_gross numeric; p_iva numeric;
  product_id uuid; presentation_id uuid; supplier_id uuid;
begin
  if device is null or device !~ '^[0-9a-f]{64}$' or not exists (
    select 1 from public.family_editor_keys where not invitation
      and fingerprint=encode(sha256(convert_to(device,'UTF8')),'hex')
  ) then raise insufficient_privilege using message='Activa primero el navegador de Edgar.'; end if;
  if length(p_name) not between 1 and 180 or length(p_brand)>160 or
     length(p_category) not between 1 and 100 or length(p_label) not between 1 and 80
     or length(p_unit) not between 1 and 40 or length(p_supplier)>160 then
    raise exception 'Completa el nombre, la categoría y la presentación con textos válidos.';
  end if;
  if coalesce(entry->>'quantity','') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$'
     or coalesce(entry->>'gross','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$'
     or (entry->>'cost' is not null and coalesce(entry->>'cost','') !~ '^[0-9]{1,9}(\.[0-9]{1,4})?$') then
    raise exception 'Revisa cantidad, costo y precio (con IVA).';
  end if;
  p_qty := (entry->>'quantity')::numeric;
  p_cost := (entry->>'cost')::numeric;
  p_gross := (entry->>'gross')::numeric;
  if p_qty <= 0 then raise exception 'La cantidad debe ser positiva.'; end if;
  -- Evita duplicados incluso si dos dispositivos crean el mismo nombre a la vez.
  perform pg_advisory_xact_lock(hashtextextended(lower(p_name)||'|'||lower(p_brand),0));
  if exists (select 1 from public.family_products where lower(btrim(name))=lower(p_name)
       and lower(btrim(brand))=lower(p_brand) and active) then
    raise exception 'Este producto ya existe. Selecciónalo y usa Agregar opción.';
  end if;
  insert into public.family_products(name,brand,category,created_by)
    values(p_name,p_brand,p_category,'edgar') returning id into product_id;
  if p_supplier<>'' then
    select id into supplier_id from public.family_suppliers
      where lower(btrim(name))=lower(p_supplier) order by created_at limit 1;
    if supplier_id is null then
      insert into public.family_suppliers(name) values(p_supplier) returning id into supplier_id;
    end if;
  end if;
  insert into public.family_presentations(product_id,label,quantity,unit,supplier_id,current_cost,cost_recorded_at)
    values(product_id,p_label,p_qty,p_unit,supplier_id,p_cost,
      case when p_cost is not null then now() end) returning id into presentation_id;
  if p_cost is not null then
    insert into public.family_cost_history(presentation_id,supplier_id,cost,recorded_by)
      values(presentation_id,supplier_id,p_cost,'edgar');
  end if;
  select coalesce((value->>'iva_rate')::numeric,15) into p_iva
    from public.family_settings where key='store';
  p_iva:=coalesce(p_iva,15);
  if p_iva < 0 or p_iva > 100 then raise exception 'IVA de la tienda inválido.'; end if;
  insert into public.family_prices(presentation_id,shop,price,updated_by)
    values(presentation_id,'jefferson',round(p_gross/(1+p_iva/100),4),'edgar');
  insert into public.family_audit(actor,action,target_id,details)
    values('edgar','create_product',product_id::text,jsonb_build_object('presentation_id',presentation_id));
  return product_id;
end $$;

create or replace function public.family_edgar_update_presentation(device text, entry jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  p_id uuid;
  p_label text := btrim(coalesce(entry->>'label',''));
  p_unit text := btrim(coalesce(nullif(entry->>'unit',''),'unidad'));
  p_supplier text := btrim(regexp_replace(coalesce(entry->>'supplier',''),'[[:space:]]+',' ','g'));
  p_qty numeric; p_cost numeric; p_gross numeric; p_iva numeric;
  supplier_id uuid; existing_cost numeric; existing_supplier uuid; p_product uuid;
begin
  if device is null or device !~ '^[0-9a-f]{64}$' or not exists (
    select 1 from public.family_editor_keys where not invitation
      and fingerprint=encode(sha256(convert_to(device,'UTF8')),'hex')
  ) then raise insufficient_privilege using message='Activa primero el navegador de Edgar.'; end if;
  if coalesce(entry->>'presentation_id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or coalesce(entry->>'updated_at','')='' then
    raise exception 'Recarga el producto antes de modificarlo.';
  end if;
  p_id := (entry->>'presentation_id')::uuid;
  if length(p_label) not between 1 and 80 or length(p_unit) not between 1 and 40 or length(p_supplier)>160 then
    raise exception 'Revisa la presentación, la unidad y el proveedor.';
  end if;
  if coalesce(entry->>'quantity','') !~ '^[0-9]{1,9}(\.[0-9]{1,3})?$'
     or (entry->>'cost' is not null and coalesce(entry->>'cost','') !~ '^[0-9]{1,9}(\.[0-9]{1,4})?$')
     or (entry->>'gross' is not null and coalesce(entry->>'gross','') !~ '^[0-9]{1,9}(\.[0-9]{1,2})?$') then
    raise exception 'Cantidad, costo o precio inválidos.';
  end if;
  p_qty:=(entry->>'quantity')::numeric;
  p_cost:=(entry->>'cost')::numeric;
  p_gross:=(entry->>'gross')::numeric;
  if p_qty<=0 then raise exception 'La cantidad debe ser positiva.'; end if;
  select product_id,current_cost,supplier_id into p_product,existing_cost,existing_supplier
    from public.family_presentations where id=p_id for update;
  if p_product is null then raise exception 'Presentación no encontrada.'; end if;
  if exists(select 1 from public.family_presentations where product_id=p_product and id<>p_id
    and lower(btrim(label))=lower(p_label)) then
    raise exception 'Ya existe esta presentación. Utiliza Agregar opción para otro proveedor.';
  end if;
  if p_supplier<>'' then
    select id into supplier_id from public.family_suppliers
      where lower(btrim(name))=lower(p_supplier) order by created_at limit 1;
    if supplier_id is null then insert into public.family_suppliers(name) values(p_supplier) returning id into supplier_id; end if;
  end if;
  update public.family_presentations
    set label=p_label, quantity=p_qty, unit=p_unit, supplier_id=supplier_id,
      current_cost=coalesce(p_cost,current_cost),
      cost_recorded_at=case when p_cost is not null and p_cost is distinct from existing_cost then now() else cost_recorded_at end,
      updated_at=clock_timestamp()
    where id=p_id and updated_at=(entry->>'updated_at')::timestamptz;
  if not found then raise exception 'Otra persona cambió esta fila. Recarga antes de guardar.'; end if;
  if p_cost is not null and (p_cost is distinct from existing_cost or supplier_id is distinct from existing_supplier) then
    insert into public.family_cost_history(presentation_id,supplier_id,cost,recorded_by)
      values(p_id,supplier_id,p_cost,'edgar');
  end if;
  if p_gross is not null then
    select coalesce((value->>'iva_rate')::numeric,15) into p_iva
      from public.family_settings where key='store';
    p_iva:=coalesce(p_iva,15);
    if p_iva < 0 or p_iva > 100 then raise exception 'IVA de la tienda inválido.'; end if;
    insert into public.family_prices(presentation_id,shop,price,updated_by)
      values(p_id,'jefferson',round(p_gross/(1+p_iva/100),4),'edgar')
      on conflict(presentation_id,shop) do update
      set price=excluded.price, updated_by='edgar',updated_at=clock_timestamp();
  end if;
  insert into public.family_audit(actor,action,target_id,details)
    values('edgar','update_presentation',p_id::text,
      jsonb_build_object('price_with_iva',p_gross,'cost',p_cost,'supplier',p_supplier));
  return p_id;
end $$;

revoke all on function public.family_edgar_add_product(text,jsonb),
  public.family_edgar_update_presentation(text,jsonb) from public,anon,authenticated;
grant execute on function public.family_edgar_add_product(text,jsonb),
  public.family_edgar_update_presentation(text,jsonb) to anon,authenticated;