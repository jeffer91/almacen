CREATE OR REPLACE FUNCTION public.edgar_pin_login(p_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cfg edgar_private.pin_config%rowtype; token text; expiration timestamptz;
begin
 select * into cfg from edgar_private.pin_config where id=true for update;
 if not found then return jsonb_build_object('ok',false,'error','Acceso no configurado'); end if;
 if cfg.locked_until > clock_timestamp() then return jsonb_build_object('ok',false,'error','Demasiados intentos. Intenta en 15 minutos.'); end if;
 if p_pin is null or p_pin !~ '^[0-9]{4}$' or extensions.crypt(p_pin,cfg.pin_hash) is distinct from cfg.pin_hash then
   if cfg.last_failure is null or cfg.last_failure < clock_timestamp()-interval '15 minutes' then cfg.failures:=0; end if;
   update edgar_private.pin_config set failures=cfg.failures+1,last_failure=clock_timestamp(),locked_until=case when cfg.failures+1>=5 then clock_timestamp()+interval '15 minutes' else null end where id=true;
   return jsonb_build_object('ok',false,'error','PIN incorrecto');
 end if;
 update edgar_private.pin_config set failures=0,locked_until=null,last_failure=null where id=true;
 delete from edgar_private.sessions where expires_at<=clock_timestamp();
 token:=encode(extensions.gen_random_bytes(32),'hex'); expiration:=clock_timestamp()+interval '30 days';
 insert into edgar_private.sessions(token_hash,expires_at) values(encode(extensions.digest(token,'sha256'),'hex'),expiration);
 return jsonb_build_object('ok',true,'token',token,'expires_at',expiration);
end $function$;

CREATE OR REPLACE FUNCTION public.family_edgar_add_product(device text, entry jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
  if public.edgar_pin_validate(device) is distinct from true then raise insufficient_privilege using message='Sesión comercial no válida. Inicia sesión nuevamente.'; end if;
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
end $function$;

CREATE OR REPLACE FUNCTION public.family_edgar_update_presentation(device text, entry jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  p_id uuid;
  p_label text := btrim(coalesce(entry->>'label',''));
  p_unit text := btrim(coalesce(nullif(entry->>'unit',''),'unidad'));
  p_supplier text := btrim(regexp_replace(coalesce(entry->>'supplier',''),'[[:space:]]+',' ','g'));
  p_qty numeric; p_cost numeric; p_gross numeric; p_iva numeric;
  v_supplier_id uuid; existing_cost numeric; existing_supplier uuid; p_product uuid;
begin
  if public.edgar_pin_validate(device) is distinct from true then raise insufficient_privilege using message='Sesión comercial no válida. Inicia sesión nuevamente.'; end if;
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
    select id into v_supplier_id from public.family_suppliers
      where lower(btrim(name))=lower(p_supplier) order by created_at limit 1;
    if v_supplier_id is null then insert into public.family_suppliers(name) values(p_supplier) returning id into v_supplier_id; end if;
  end if;
  update public.family_presentations
    set label=p_label, quantity=p_qty, unit=p_unit, supplier_id=v_supplier_id,
      current_cost=coalesce(p_cost,current_cost),
      cost_recorded_at=case when p_cost is not null and p_cost is distinct from existing_cost then now() else cost_recorded_at end,
      updated_at=clock_timestamp()
    where id=p_id and updated_at=(entry->>'updated_at')::timestamptz;
  if not found then raise exception 'Otra persona cambió esta fila. Recarga antes de guardar.'; end if;
  if p_cost is not null and (p_cost is distinct from existing_cost or v_supplier_id is distinct from existing_supplier) then
    insert into public.family_cost_history(presentation_id,supplier_id,cost,recorded_by)
      values(p_id,v_supplier_id,p_cost,'edgar');
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
end $function$;

CREATE OR REPLACE FUNCTION public.family_option_list(device text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  select jsonb_build_object('options',coalesce((select jsonb_agg(to_jsonb(o) order by label,supplier,id) from family_catalog_options o),'[]'),
    'assigned',coalesce((select jsonb_object_agg(p.id,s.name) from family_presentations p join family_suppliers s on p.supplier_id=s.id
      join family_products f on f.id=p.product_id where f.active),'{}'),
    'suppliers',case when public.edgar_pin_validate(device)
    then (select coalesce(jsonb_agg(name order by name),'[]') from (select name from family_suppliers where active union select supplier from family_catalog_options where supplier<>'') names) end)
$function$;

CREATE OR REPLACE FUNCTION public.family_save_option(device text, entry jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  r family_catalog_options;
begin
  if public.edgar_pin_validate(device) is distinct from true then
    raise insufficient_privilege using message='Sesión comercial no válida. Inicia sesión nuevamente.';
  end if;
  r := jsonb_populate_record(null::family_catalog_options,entry);
  r.product:=trim(r.product); r.label:=trim(r.label); r.supplier:=trim(regexp_replace(r.supplier,'[[:space:]]+',' ','g'));
  if length(r.product) not between 1 and 180 or length(r.label) not between 1 and 100 or length(r.supplier)>160
     or length(r.brand)>160 or length(r.unit)>80 or length(r.source_label)>160 then raise exception 'Revisa el producto y la presentación.'; end if;
  if r.id is null then
    insert into family_catalog_options(product,brand,source_label,label,supplier,quantity,unit,cost,gross)
      values(r.product,r.brand,r.source_label,r.label,r.supplier,r.quantity,r.unit,r.cost,r.gross) returning id into r.id;
  else
    update family_catalog_options set label=r.label,supplier=r.supplier,quantity=r.quantity,unit=r.unit,cost=r.cost,gross=r.gross,revision=revision+1
      where id=r.id and revision=r.revision;
    if not found then raise exception 'Otra persona actualizó esta fila. Vuelve a cargarla.'; end if;
  end if;
  insert into public.family_audit(actor,action,target_id,details) values('edgar','save_catalog_option',r.id::text,jsonb_build_object('label',r.label,'quantity',r.quantity,'gross',r.gross,'cost',r.cost));
  return r.id;
exception when unique_violation then raise exception 'La opción ya existe. Recarga la tabla y edita la fila existente.';
end $function$;
-- Legacy pairing no longer grants commercial access.
revoke execute on function public.family_pair_editor(text,text) from public,anon,authenticated;
-- Retire previously issued long-lived sessions without forcing immediate logout.
update edgar_private.sessions set expires_at=least(expires_at,now()+interval '30 days') where expires_at>now()+interval '30 days';
