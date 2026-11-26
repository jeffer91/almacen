
create table edgar_private.sale_headers(
 id uuid primary key, customer_id uuid references edgar_private.customers(id),
 buyer jsonb not null, sale_date date not null, request_rows jsonb not null,
 created_at timestamptz not null default now()
);
alter table edgar_private.sale_headers enable row level security;
revoke all on edgar_private.sale_headers from public,anon,authenticated;
alter table public.family_daily_sales add column sale_id uuid references edgar_private.sale_headers(id);
create index family_daily_sales_sale_id_idx on public.family_daily_sales(sale_id);
alter table edgar_private.invoice_drafts add column sale_id uuid unique references edgar_private.sale_headers(id);
create or replace function public.edgar_sale_detail(p_token text,p_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h edgar_private.sale_headers%rowtype; items jsonb; total numeric; draft uuid;
begin
 if public.edgar_pin_validate(p_token) is distinct from true then raise exception 'SESSION_INVALID' using errcode='28000';end if;
 select * into h from edgar_private.sale_headers where id=p_id;
 if not found then raise exception 'Compra no encontrada';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'description',x.v->>'public_name','detail',x.v->>'public_detail','quantity',s.quantity,'unit',s.unit,'unit_price',s.unit_price,'total',s.total,'payment_method',s.payment_method) order by x.n),'[]'::jsonb),coalesce(sum(s.total),0)
 into items,total from public.family_daily_sales s join jsonb_array_elements(h.request_rows) with ordinality x(v,n) on s.request_key=(x.v->>'request_key')::uuid where s.sale_id=h.id and s.voided_at is null;
 select id into draft from edgar_private.invoice_drafts where sale_id=h.id;
 return jsonb_build_object('id',h.id,'customer_id',h.customer_id,'buyer',h.buyer,'sale_date',h.sale_date,'items',items,'total',total,'draft_id',draft);
end $$;
create or replace function public.edgar_sale_save(p_token text,p_id uuid,p_customer_id uuid,p_alias text,p_rows jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare h edgar_private.sale_headers%rowtype;c edgar_private.customers%rowtype;x jsonb;v_rows jsonb:='[]';buyer jsonb;day date;alias text;qty numeric;price numeric;request uuid;
begin
 if public.edgar_pin_validate(p_token) is distinct from true then raise exception 'SESSION_INVALID' using errcode='28000';end if;
 if p_id is null or jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 100 then raise exception 'Compra inválida';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into h from edgar_private.sale_headers where id=p_id;
 if found then
  if h.customer_id is distinct from p_customer_id or h.request_rows is distinct from p_rows then raise exception 'La compra ya existe con otros datos';end if;
  return public.edgar_sale_detail(p_token,p_id);
 end if;
 if p_customer_id is not null then
  select * into c from edgar_private.customers where id=p_customer_id and active;
  if not found then raise exception 'Selecciona un cliente activo';end if;
  alias:=c.name;buyer:=jsonb_build_object('name',c.name,'phone',c.phone,'identification',c.identification,'identification_type',c.identification_type,'email',c.email,'address',c.address);
 else
  alias:=trim(coalesce(p_alias,''));if length(alias) not between 1 and 70 then raise exception 'Indica un cliente o referencia';end if;
  buyer:=jsonb_build_object('name',alias);
 end if;
 day:=(p_rows->0->>'sale_date')::date;
 if day is null then raise exception 'Fecha inválida';end if;
 for x in select value from jsonb_array_elements(p_rows) loop
  qty:=(x->>'quantity')::numeric;price:=(x->>'unit_price')::numeric;request:=(x->>'request_key')::uuid;
  if request is null or (x->>'sale_date')::date is distinct from day or qty is null or qty not between 0.001 and 1000000 or qty<>round(qty,3) or price is null or price not between 0 and 1000000 or price<>round(price,4) then raise exception 'Cantidad, fecha o precio inválido';end if;
  if length(trim(coalesce(x->>'product_name',''))) not between 1 and 180 or length(trim(coalesce(x->>'public_name',''))) not between 1 and 180 or length(coalesce(x->>'public_detail',''))>100 or length(coalesce(x->>'presentation_label',''))>100 or coalesce(x->>'unit','') not in ('unidad','metro','rollo','yarda','paquete','otro') or coalesce(x->>'payment_method','') not in ('sin_especificar','efectivo','transferencia','tarjeta','otro') then raise exception 'Detalle de compra inválido';end if;
  if exists(select 1 from public.family_daily_sales where request_key=request) then raise exception 'Artículo ya pertenece a otra compra';end if;
  v_rows:=v_rows||jsonb_build_array(x||jsonb_build_object('notes','[venta:'||p_id||'] '||alias));
 end loop;
 insert into edgar_private.sale_headers(id,customer_id,buyer,sale_date,request_rows) values(p_id,p_customer_id,buyer,day,p_rows);
 perform public.family_add_sales_batch(v_rows,'edgar');
 update public.family_daily_sales s set sale_id=p_id where s.request_key in (select (v->>'request_key')::uuid from jsonb_array_elements(p_rows) v);
 return public.edgar_sale_detail(p_token,p_id);
end $$;
create or replace function public.edgar_sale_invoice_draft(p_token text,p_id uuid,p_payment text,p_fiscal jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
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
end $$;
create or replace function edgar_private.guard_linked_sale() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.sale_id is not null then
  perform 1 from edgar_private.sale_headers where id=old.sale_id for update;
  if exists(select 1 from edgar_private.invoice_drafts where sale_id=old.sale_id) then raise exception 'Compra vinculada a borrador fiscal; requiere revisión administrativa';end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger protect_linked_sale before update or delete on public.family_daily_sales for each row execute function edgar_private.guard_linked_sale();
create or replace function edgar_private.guard_sale_draft() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if old.sale_id is not null then raise exception 'Borrador vinculado a venta: no se puede modificar ni eliminar por esta vía';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
create trigger protect_sale_draft before update or delete on edgar_private.invoice_drafts for each row execute function edgar_private.guard_sale_draft();
revoke all on function edgar_private.guard_linked_sale(),edgar_private.guard_sale_draft() from public,anon,authenticated;
revoke all on function public.edgar_sale_detail(text,uuid),public.edgar_sale_save(text,uuid,uuid,text,jsonb),public.edgar_sale_invoice_draft(text,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.edgar_sale_detail(text,uuid),public.edgar_sale_save(text,uuid,uuid,text,jsonb),public.edgar_sale_invoice_draft(text,uuid,text,jsonb) to anon,authenticated,service_role;
