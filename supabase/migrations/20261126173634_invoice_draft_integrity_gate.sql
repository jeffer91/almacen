
-- Arithmetic and completeness gate for drafts; no numbering or emission.
create function edgar_private.validate_invoice_draft() returns trigger language plpgsql security invoker set search_path='' as $$
declare item jsonb; q numeric; u numeric; disc numeric; base numeric; rate numeric; tax numeric; st numeric:=0; ds numeric:=0; tx numeric:=0; idtype text; ident text;
begin
 if new.issue_date is null or coalesce(new.payment_code,'') not in ('01','16','19','20') then raise exception 'Fecha o forma de pago inválida';end if;
 idtype:=new.buyer->>'identification_type'; ident:=new.buyer->>'identification';
 if coalesce(length(trim(new.buyer->>'name')),0) not between 1 and 300 or
 not coalesce((idtype='ruc' and ident~'^[0-9]{13}$') or (idtype='cedula' and ident~'^[0-9]{10}$') or (idtype='passport' and ident~'^[A-Za-z0-9-]{1,20}$'),false) then raise exception 'Identificación o nombre fiscal incompleto';end if;
 if jsonb_typeof(new.lines) is distinct from 'array' or jsonb_array_length(new.lines) not between 1 and 100 then raise exception 'Detalle fiscal inválido';end if;
 for item in select value from jsonb_array_elements(new.lines) loop
  q:=(item->>'quantity')::numeric;u:=(item->>'unit_net')::numeric;disc:=(item->>'discount')::numeric;rate:=(item->>'rate')::numeric;
  if q is null or q not between 0.001 and 100000 or q<>round(q,3) or u is null or u not between 0 and 1000000 or u<>round(u,6) or disc is null or disc<0 or disc<>round(disc,2) or rate is null or rate not in (0,15) or (new.sale_id is not null and rate<>15) then raise exception 'Cantidad, precio, descuento o IVA inválido';end if;
  if coalesce(length(trim(item->>'code')),0) not between 1 and 25 or coalesce(length(trim(item->>'description')),0) not between 1 and 300 or coalesce(length(item->>'aux'),0)>25 or coalesce(length(item->>'extra'),0)>300 then raise exception 'Código o descripción fiscal inválidos';end if;
  base:=round(q*u,2)-disc;tax:=round(base*rate/100,2);
  if base<0 or base is distinct from (item->>'base')::numeric or tax is distinct from (item->>'tax')::numeric then raise exception 'Importes de línea inconsistentes';end if;
  st:=st+base;ds:=ds+disc;tx:=tx+tax;
 end loop;
 if new.subtotal is distinct from st or new.discount is distinct from ds or new.tax is distinct from tx or new.total is distinct from st+tx then raise exception 'Totales fiscales inconsistentes';end if;
 return new;
end $$;
revoke all on function edgar_private.validate_invoice_draft() from public,anon,authenticated;
create trigger validate_invoice_draft_before_write before insert or update on edgar_private.invoice_drafts for each row execute function edgar_private.validate_invoice_draft();
-- All new commercial invoices originate in Ventas, not the obsolete manual editor.
revoke execute on function public.edgar_invoice_draft_save(text,jsonb) from public,anon,authenticated;
