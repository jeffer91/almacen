
create table edgar_private.product_fiscal (
 product_key text primary key,
 product_code text not null unique check(length(product_code) between 1 and 25),
 vat_rate numeric check(vat_rate in (0,15)),
 confirmed_at timestamptz,
 created_at timestamptz not null default now()
);
alter table edgar_private.product_fiscal enable row level security;
revoke all on edgar_private.product_fiscal from public,anon,authenticated;
create function edgar_private.product_code_for(k text) returns text language sql immutable set search_path='' as $$
 select 'NE-'||upper(substr(encode(extensions.digest(k,'sha256'),'hex'),1,20))
$$;
insert into edgar_private.product_fiscal(product_key,product_code)
select k,edgar_private.product_code_for(k) from (
 select 'excel:'||source_id k from public.family_smart_catalog where source_kind='excel'
 union select 'presentation:'||id::text from public.family_presentations
 union select 'option:'||id::text from public.family_catalog_options
) s on conflict(product_key) do nothing;
create function edgar_private.sale_product_key(n text,detail text,u text,snapshot jsonb) returns text language plpgsql stable set search_path='' as $$
declare k text:=snapshot->>'product_key'; old_key text; matches integer;
begin
 if k is not null and length(k)<=240 and (
   (k like 'excel:%' and exists(select 1 from public.family_smart_catalog where source_id=substr(k,7) and source_kind='excel' and original_name=n))
   or (k like 'presentation:%' and exists(select 1 from public.family_presentations where id::text=substr(k,14)))
   or (k like 'option:%' and exists(select 1 from public.family_catalog_options where id::text=substr(k,8)))
   or exists(select 1 from edgar_private.product_fiscal where product_key=k and k not like 'manual:%')
 ) then return k;end if;
 select count(*),min(source_id) into matches,old_key from public.family_smart_catalog where source_kind='excel' and lower(trim(original_name))=lower(trim(n));
 if matches=1 then return 'excel:'||old_key;end if;
 return 'manual:'||encode(extensions.digest(lower(trim(n))||'|'||lower(trim(coalesce(detail,'')))||'|'||coalesce(u,''),'sha256'),'hex');
end $$;
create function public.edgar_sale_fiscal_defaults(p_token text,p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare h edgar_private.sale_headers%rowtype;s record;k text;f edgar_private.product_fiscal%rowtype;items jsonb:='[]';methods text[];pay text;
begin
 if public.edgar_pin_validate(p_token) is distinct from true then raise exception 'SESSION_INVALID' using errcode='28000';end if;
 select * into h from edgar_private.sale_headers where id=p_id;
 if not found then raise exception 'Compra no encontrada';end if;
 for s in select ds.*,x.v as snapshot from public.family_daily_sales ds join jsonb_array_elements(h.request_rows) with ordinality x(v,n) on ds.request_key=(x.v->>'request_key')::uuid where ds.sale_id=p_id and ds.voided_at is null order by x.n loop
  k:=edgar_private.sale_product_key(s.product_name,s.presentation_label,s.unit,s.snapshot);
  insert into edgar_private.product_fiscal(product_key,product_code) values(k,edgar_private.product_code_for(k)) on conflict(product_key) do nothing;
  select * into strict f from edgar_private.product_fiscal where product_key=k;
  items:=items||jsonb_build_array(jsonb_build_object('id',s.id,'code',f.product_code,'rate',f.vat_rate));
 end loop;
 select array_agg(distinct payment_method) into methods from public.family_daily_sales where sale_id=p_id and voided_at is null;
 if cardinality(methods)=1 then pay:=case methods[1] when 'efectivo' then '01' when 'transferencia' then '20' else null end;end if;
 return jsonb_build_object('items',items,'payment_code',pay,'mixed_payment',cardinality(array_remove(methods,'sin_especificar'))>1);
end $$;
revoke all on function edgar_private.product_code_for(text),edgar_private.sale_product_key(text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.edgar_sale_fiscal_defaults(text,uuid) from public,anon,authenticated;
grant execute on function public.edgar_sale_fiscal_defaults(text,uuid) to anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.edgar_sale_invoice_draft(p_token text, p_id uuid, p_payment text, p_fiscal jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h edgar_private.sale_headers%rowtype;c edgar_private.customers%rowtype;d edgar_private.invoice_drafts%rowtype;s record;f jsonb;rate numeric;net numeric;base numeric;vat numeric;st numeric:=0;tx numeric:=0;lines jsonb:='[]';v_buyer jsonb;code text;cnt integer;k text;cfg edgar_private.product_fiscal%rowtype;
begin
 if public.edgar_pin_validate(p_token) is distinct from true then raise exception 'SESSION_INVALID' using errcode='28000';end if;
 perform pg_advisory_xact_lock(2681130);
 select * into h from edgar_private.sale_headers where id=p_id for update;
 if not found then raise exception 'Compra no encontrada';end if;
 select * into d from edgar_private.invoice_drafts where sale_id=p_id;
 if found then return to_jsonb(d);end if;
 select * into c from edgar_private.customers where id=h.customer_id and active;
 if not found or c.identification_type='none' or c.identification is null then raise exception 'La factura requiere cliente activo con identificación';end if;
 if p_payment is null or p_payment not in ('01','16','19','20') then raise exception 'Confirma la forma de pago fiscal';end if;
 if (select count(distinct payment_method) from public.family_daily_sales where sale_id=p_id and voided_at is null and payment_method<>'sin_especificar')>1 then raise exception 'La compra tiene pagos mixtos; el borrador actual admite una sola forma de pago fiscal';end if;
 if exists(select 1 from public.family_daily_sales where sale_id=p_id and voided_at is null and ((payment_method='efectivo' and p_payment<>'01') or (payment_method='transferencia' and p_payment<>'20') or (payment_method='tarjeta' and p_payment not in ('16','19')))) then raise exception 'La forma de pago fiscal no coincide con la venta';end if;
 select count(*) into cnt from public.family_daily_sales where sale_id=p_id and voided_at is null;
 if cnt=0 or jsonb_typeof(p_fiscal) is distinct from 'array' or jsonb_array_length(p_fiscal)<>cnt then raise exception 'Confirma los datos fiscales de cada artículo';end if;
 v_buyer:=jsonb_build_object('name',c.name,'identification',c.identification,'identification_type',c.identification_type,'address',c.address,'phone',c.phone,'email',c.email);
 for s in select ds.*,x.v->>'public_name' as public_name,x.v->>'public_detail' as public_detail,x.v as snapshot from public.family_daily_sales ds join jsonb_array_elements(h.request_rows) with ordinality x(v,n) on ds.request_key=(x.v->>'request_key')::uuid where ds.sale_id=p_id and ds.voided_at is null order by x.n loop
  select value into f from jsonb_array_elements(p_fiscal) where value->>'id'=s.id::text;
  k:=edgar_private.sale_product_key(s.product_name,s.presentation_label,s.unit,s.snapshot);
  insert into edgar_private.product_fiscal(product_key,product_code) values(k,edgar_private.product_code_for(k)) on conflict(product_key) do nothing;
  select * into strict cfg from edgar_private.product_fiscal where product_key=k for update;
  code:=cfg.product_code;rate:=coalesce(cfg.vat_rate,(f->>'rate')::numeric);
  if cfg.vat_rate is not null and f->>'rate' is not null and (f->>'rate')::numeric<>cfg.vat_rate then raise exception 'La tarifa del producto cambió. Vuelve a abrir la compra.';end if;
  if rate is null or rate not in (0,15) or length(code) not between 1 and 25 or s.quantity>100000 then raise exception 'Verifica código, IVA y cantidad de cada artículo';end if;
  -- Price agreed in sales is the final gross amount. Never change it to force a tax split.
  base:=round(s.total/(1+rate/100),2);
  net:=round(base/s.quantity,6);vat:=round(base*rate/100,2);
  if round(net*s.quantity,2)<>base or base+vat<>s.total then raise exception 'El desglose de IVA no coincide con el total de venta para %. Revisión fiscal necesaria.',s.public_name;end if;
  if cfg.vat_rate is null then update edgar_private.product_fiscal set vat_rate=rate,confirmed_at=now() where product_key=k;end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('source','sale','catalog_id',s.id,'code',code,'aux','','description',s.public_name,'extra',concat_ws(' · ',nullif(s.public_detail,''),s.unit),'quantity',s.quantity,'unit_net',net,'discount',0,'rate',rate,'base',base,'tax',vat));
  st:=st+base;tx:=tx+vat;
 end loop;
 insert into edgar_private.invoice_drafts(id,customer_id,buyer,sale_id,issue_date,lines,payment_code,subtotal,discount,tax,total)
 values(gen_random_uuid(),c.id,v_buyer,p_id,h.sale_date,lines,p_payment,st,0,tx,st+tx) returning * into d;
 return to_jsonb(d);
end $function$
;