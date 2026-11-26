
create or replace function public.family_add_sales_batch(p_rows jsonb,p_actor text) returns jsonb
language plpgsql security invoker set search_path=public,pg_catalog as $$
declare x jsonb; existing public.family_daily_sales%rowtype; result jsonb:='[]'::jsonb; inserted boolean;
begin
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 100 then raise exception 'Lote inválido'; end if;
 if p_actor not in ('edgar','jefferson') then raise exception 'Actor inválido'; end if;
 perform pg_advisory_xact_lock(2681128);
 if (select count(distinct v->>'request_key') from jsonb_array_elements(p_rows) v)<>jsonb_array_length(p_rows) then raise exception 'Identificadores de venta repetidos'; end if;
 for x in select value from jsonb_array_elements(p_rows) loop
  if x->>'request_key' is null or (x->>'quantity')::numeric<>round((x->>'quantity')::numeric,3) or (x->>'unit_price')::numeric<>round((x->>'unit_price')::numeric,4) then raise exception 'Cantidad o precio inválido'; end if;
  insert into public.family_daily_sales(sale_date,product_name,presentation_label,quantity,unit,unit_price,payment_method,notes,created_by,request_key)
  values((x->>'sale_date')::date,x->>'product_name',coalesce(x->>'presentation_label',''),(x->>'quantity')::numeric,x->>'unit',(x->>'unit_price')::numeric,x->>'payment_method',x->>'notes','jefferson',(x->>'request_key')::uuid)
  on conflict(request_key) do nothing returning * into existing;
  inserted:=found;
  if not inserted then
    select * into strict existing from public.family_daily_sales where request_key=(x->>'request_key')::uuid;
    if existing.voided_at is not null or (existing.sale_date,existing.product_name,existing.presentation_label,existing.quantity,existing.unit,existing.unit_price,existing.payment_method,existing.notes) is distinct from ((x->>'sale_date')::date,x->>'product_name',coalesce(x->>'presentation_label',''),(x->>'quantity')::numeric,x->>'unit',(x->>'unit_price')::numeric,x->>'payment_method',x->>'notes') then raise exception 'La solicitud ya existe con datos distintos'; end if;
  else
    insert into public.family_audit(actor,action,target_id,details) values(p_actor,'addSale',existing.id::text,jsonb_build_object('total',existing.total,'product_name',existing.product_name));
  end if;
  result:=result||jsonb_build_array(jsonb_build_object('id',existing.id,'total',existing.total));
 end loop;
 return result;
end $$;
revoke all on function public.family_add_sales_batch(jsonb,text) from public,anon,authenticated;
grant execute on function public.family_add_sales_batch(jsonb,text) to service_role;
