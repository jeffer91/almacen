CREATE OR REPLACE FUNCTION public.family_import_commercial(p_rows jsonb, p_mode text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  r jsonb; n integer:=0; changed integer:=0; made integer:=0; made_pres integer:=0; updated integer:=0; rates numeric;
  p family_products%rowtype; v family_presentations%rowtype; matched uuid; pid uuid; vid uuid; matches integer;
  code text; pname text; brandname text; labelname text; cat text; un text; q numeric; meters numeric;
  c numeric; retail numeric; wholesale numeric; meter numeric; oldnet numeric; net numeric; result jsonb;
  seen uuid[]:=array[]::uuid[];
begin
  if p_mode not in ('products','prices') or p_rows is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 500 then
    raise exception 'El lote debe contener entre 1 y 500 filas.';
  end if;
  lock table family_products, family_presentations, family_prices in share row exclusive mode;
  select coalesce((value->>'iva_rate')::numeric,15) into rates from family_settings where key='store';
  rates:=1+coalesce(rates,15)/100;
  if rates<1 or rates>1.5 then raise exception 'Configuración de IVA inválida'; end if;
  for r in select value from jsonb_array_elements(p_rows) loop
    n:=n+1; pid:=null;vid:=null;matched:=null;oldnet:=null;p:=null;v:=null;
    if p_mode='prices' then
      vid:=(r->>'presentation_id')::uuid;
      select * into v from family_presentations where id=vid;
      if not found then raise exception 'Fila %: presentación inexistente',n; end if;
      select * into p from family_products where id=v.product_id and active=true;
      if not found then raise exception 'Fila %: producto archivado o inexistente',n; end if;
      q:=v.quantity;un:=v.unit;
    else
      code:=nullif(btrim(coalesce(r->>'codigo','')),''); pname:=btrim(coalesce(r->>'producto','')); brandname:=btrim(coalesce(r->>'marca','')); labelname:=btrim(coalesce(r->>'presentacion',''));cat:=btrim(coalesce(r->>'categoria',''));un:=coalesce(nullif(btrim(r->>'unidad'),''),'unidad');q:=coalesce(nullif(r->>'cantidad','')::numeric,1);
      if length(pname) not between 1 and 180 or length(labelname) not between 1 and 80 or length(cat) not between 1 and 100 or length(brandname)>100 or length(code)>40 or length(un)>40 or length(coalesce(r->>'proveedor',''))>160 or q<=0 or q>999999999 or q<>round(q,3) then raise exception 'Fila %: datos de producto inválidos',n; end if;
      select count(*) into matches from family_products where lower(btrim(name))=lower(pname) and lower(btrim(brand))=lower(brandname);
      if matches>1 then raise exception 'Fila %: producto ambiguo',n; end if;
      select * into p from family_products where lower(btrim(name))=lower(pname) and lower(btrim(brand))=lower(brandname);
      if p.id is not null and not p.active then raise exception 'Fila %: producto archivado',n; end if;
      if code is not null then select id into matched from family_presentations where lower(btrim(sku))=lower(code);end if;
      if p.id is not null then
        select count(*) into matches from family_presentations where product_id=p.id and lower(btrim(label))=lower(labelname);
        if matches>1 then raise exception 'Fila %: presentación ambigua; usa un identificador único',n; end if;
        select * into v from family_presentations where product_id=p.id and lower(btrim(label))=lower(labelname);
      end if;
      if matched is not null and matched is distinct from v.id then raise exception 'Fila %: SKU pertenece a otra presentación',n;end if;
      if v.id is not null and code is not null and v.sku is not null and lower(btrim(v.sku))<>lower(code) then raise exception 'Fila %: presentación tiene otro SKU',n;end if;
      vid:=v.id;
    end if;
    if vid is not null then
      if vid=any(seen) then raise exception 'Fila %: presentación repetida',n;end if;
      select price into oldnet from family_prices where presentation_id=vid and shop='jefferson';
    end if;
    if p_mode='prices' and oldnet is distinct from nullif(r->>'expected_price','')::numeric then raise exception 'Fila %: precio actual cambió; descarga otra plantilla',n;end if;
    if p_mode='prices' and (v.current_cost is distinct from nullif(r->>'expected_cost','')::numeric or v.wholesale_price is distinct from nullif(r->>'expected_wholesale','')::numeric or v.meter_price is distinct from nullif(r->>'expected_meter','')::numeric) then raise exception 'Fila %: costo o precios especiales cambiaron; descarga otra plantilla',n;end if;
    c:=coalesce(nullif(r->>'costo','')::numeric,v.current_cost);
    retail:=coalesce(nullif(r->>'precio','')::numeric,round(oldnet*rates,2));
    wholesale:=coalesce(nullif(r->>'pxm','')::numeric,v.wholesale_price);
    meter:=coalesce(nullif(r->>'precio_metro','')::numeric,v.meter_price);
    if retail is null then raise exception 'Fila %: falta precio de venta',n; end if;
    if retail<=0 or retail>999999999 or retail<>round(retail,2) or (c is not null and (c<0 or retail<=c or c>999999999 or c<>round(c,4))) then raise exception 'Fila %: el precio debe superar el costo (precio a 2 decimales)',n;end if;
    if wholesale is not null and (wholesale<=0 or (c is not null and wholesale<=c) or wholesale>retail or wholesale<>round(wholesale,4)) then raise exception 'Fila %: PXM debe superar costo y no superar precio',n;end if;
    meters:=case when lower(btrim(un)) in ('m','metro','metros') then q when lower(btrim(un)) in ('yd','yarda','yardas') then q*0.9144 else null end;
    if meter is not null and (meters is null or meter<=0 or (c is not null and meter<=c/meters) or meter>999999999 or meter<>round(meter,4)) then raise exception 'Fila %: precio por metro requiere longitud válida y debe superar costo por metro',n;end if;
    net:=case when nullif(r->>'precio','') is not null then round(retail/rates,4) else oldnet end;
    if p_mode='products' then
      result:=family_import_catalog_v2(jsonb_build_array(jsonb_build_object('codigo',coalesce(code,v.sku,''),'producto',coalesce(p.name,pname),'marca',coalesce(p.brand,brandname),'categoria',cat,'presentacion',coalesce(v.label,labelname),'cantidad',q::text,'unidad',un,'proveedor',coalesce(r->>'proveedor',''),'costo',coalesce(r->>'costo',''),'precio',case when nullif(r->>'precio','') is not null then net::text else '' end)));
      made:=made+(result->>'products')::integer;made_pres:=made_pres+(result->>'presentations')::integer;updated:=updated+(result->>'updated')::integer;
      select fp.id into vid from family_presentations fp join family_products pp on pp.id=fp.product_id where lower(btrim(pp.name))=lower(pname) and lower(btrim(pp.brand))=lower(brandname) and lower(btrim(fp.label))=lower(labelname);
      if vid is null then raise exception 'Fila %: presentación no resuelta',n;end if;
    else
      if nullif(r->>'costo','') is not null and c is distinct from v.current_cost then perform family_set_cost(vid,c,v.supplier_id);end if;
      if nullif(r->>'precio','') is not null then
        insert into family_prices(presentation_id,shop,price,updated_by) values(vid,'jefferson',net,'jefferson') on conflict(presentation_id,shop) do update set price=excluded.price,updated_at=now(),updated_by='jefferson' where family_prices.price is distinct from excluded.price;
      end if;
    end if;
    if vid=any(seen) then raise exception 'Fila %: presentación repetida',n;end if;
    seen:=array_append(seen,vid);
    update family_presentations set wholesale_price=wholesale,meter_price=meter,updated_at=now() where id=vid and (wholesale_price is distinct from wholesale or meter_price is distinct from meter);
    if oldnet is distinct from net then changed:=changed+1;end if;
  end loop;
  insert into family_audit(actor,action,target_id,details) values('jefferson','import_commercial','catalog',jsonb_build_object('rows',n,'mode',p_mode));
  return jsonb_build_object('rows',n,'products',made,'presentations',made_pres,'updated',updated,'prices',changed);
end $function$
;
revoke all on function public.family_import_commercial(jsonb,text) from public,anon,authenticated;
grant execute on function public.family_import_commercial(jsonb,text) to service_role;
