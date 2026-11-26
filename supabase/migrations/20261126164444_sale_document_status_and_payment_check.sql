CREATE OR REPLACE FUNCTION public.edgar_sale_invoice_draft(p_token text, p_id uuid, p_payment text, p_fiscal jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare h edgar_private.sale_headers%rowtype;c edgar_private.customers%rowtype;d edgar_private.invoice_drafts%rowtype;s record;f jsonb;rate numeric;net numeric;base numeric;vat numeric;st numeric:=0;tx numeric:=0;lines jsonb:='[]';v_buyer jsonb;code text;cnt integer;
begin
 if public.edgar_pin_validate(p_token) is distinct from true then raise exception 'SESSION_INVALID' using errcode='28000';end if;
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
 for s in select ds.*,x.v->>'public_name' as public_name,x.v->>'public_detail' as public_detail from public.family_daily_sales ds join jsonb_array_elements(h.request_rows) with ordinality x(v,n) on ds.request_key=(x.v->>'request_key')::uuid where ds.sale_id=p_id and ds.voided_at is null order by x.n loop
  select value into f from jsonb_array_elements(p_fiscal) where value->>'id'=s.id::text;
  rate:=(f->>'rate')::numeric;code:=trim(coalesce(f->>'code',''));
  if rate is null or rate not in (0,15) or length(code) not between 1 and 25 or s.quantity>100000 then raise exception 'Verifica código, IVA y cantidad de cada artículo';end if;
  -- Price agreed in sales is the final gross amount. Never change it to force a tax split.
  base:=round(s.total/(1+rate/100),2);
  net:=round(base/s.quantity,6);vat:=round(base*rate/100,2);
  if round(net*s.quantity,2)<>base or base+vat<>s.total then raise exception 'El desglose de IVA no coincide con el total de venta para %. Revisión fiscal necesaria.',s.public_name;end if;
  lines:=lines||jsonb_build_array(jsonb_build_object('source','sale','catalog_id',s.id,'code',code,'aux','','description',s.public_name,'extra',concat_ws(' · ',nullif(s.public_detail,''),s.unit),'quantity',s.quantity,'unit_net',net,'discount',0,'rate',rate,'base',base,'tax',vat));
  st:=st+base;tx:=tx+vat;
 end loop;
 insert into edgar_private.invoice_drafts(id,customer_id,buyer,sale_id,issue_date,lines,payment_code,subtotal,discount,tax,total)
 values(gen_random_uuid(),c.id,v_buyer,p_id,h.sale_date,lines,p_payment,st,0,tx,st+tx) returning * into d;
 return to_jsonb(d);
end $function$
;
create or replace function public.edgar_sale_statuses(p_token text,p_date date) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if public.edgar_pin_validate(p_token) is distinct from true then raise exception 'SESSION_INVALID' using errcode='28000';end if;
 return coalesce((select jsonb_object_agg(h.id::text,jsonb_build_object('draft_id',d.id,'has_phone',coalesce(h.buyer->>'phone','')<>'')) from edgar_private.sale_headers h left join edgar_private.invoice_drafts d on d.sale_id=h.id where h.sale_date=p_date),'{}'::jsonb);
end $$;
revoke all on function public.edgar_sale_statuses(text,date) from public,anon,authenticated;
grant execute on function public.edgar_sale_statuses(text,date) to anon,authenticated,service_role;