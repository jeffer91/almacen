
create table edgar_private.operation_audit (
 id bigint generated always as identity primary key,
 occurred_at timestamptz not null default clock_timestamp(),
 entity text not null,
 operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
 entity_id uuid not null,
 source text not null default 'database',
 state_before text,
 state_after text
);
alter table edgar_private.operation_audit enable row level security;
revoke all on edgar_private.operation_audit from public,anon,authenticated;
create index operation_audit_time_idx on edgar_private.operation_audit(occurred_at desc,id desc);
create function edgar_private.capture_operation() returns trigger language plpgsql security definer set search_path='' as $$
declare before_row jsonb; after_row jsonb; obj uuid; previous_state text; next_state text;
begin
 if tg_op<>'INSERT' then before_row:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then after_row:=to_jsonb(new); end if;
 if tg_op='UPDATE' and before_row=after_row then return new; end if;
 obj:=coalesce(after_row->>'id',before_row->>'id')::uuid;
 previous_state:=coalesce(before_row->>'status',before_row->>'active',case when before_row is not null and tg_table_name='family_daily_sales' then case when before_row->>'voided_at' is null then 'active' else 'voided' end end);
 next_state:=coalesce(after_row->>'status',after_row->>'active',case when after_row is not null and tg_table_name='family_daily_sales' then case when after_row->>'voided_at' is null then 'active' else 'voided' end end);
 insert into edgar_private.operation_audit(entity,operation,entity_id,state_before,state_after)
 values(tg_table_name,tg_op,obj,previous_state,next_state);
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function edgar_private.capture_operation() from public,anon,authenticated;
create trigger audit_customers after insert or update or delete on edgar_private.customers for each row execute function edgar_private.capture_operation();
create trigger audit_sale_headers after insert or update or delete on edgar_private.sale_headers for each row execute function edgar_private.capture_operation();
create trigger audit_sale_lines after insert or update or delete on public.family_daily_sales for each row execute function edgar_private.capture_operation();
create trigger audit_orders after insert or update or delete on edgar_private.orders for each row execute function edgar_private.capture_operation();
create trigger audit_order_payments after insert or update or delete on edgar_private.order_payments for each row execute function edgar_private.capture_operation();
create trigger audit_invoice_drafts after insert or update or delete on edgar_private.invoice_drafts for each row execute function edgar_private.capture_operation();
create trigger audit_invoice_documents after insert or update or delete on edgar_private.invoice_documents for each row execute function edgar_private.capture_operation();
create trigger audit_invoice_adjustments after insert or update or delete on edgar_private.invoice_adjustments for each row execute function edgar_private.capture_operation();

create function public.family_admin_diagnostics(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare snapshot jsonb;
begin
 if coalesce(p_token,'') !~ '^[a-f0-9]{64}$' or not exists(select 1 from public.family_admin_sessions where token_hash=encode(extensions.digest(p_token,'sha256'),'hex') and expires_at>now()) then raise exception 'ADMIN_SESSION_REQUIRED' using errcode='28000';end if;
 select jsonb_build_object(
 'checked_at',clock_timestamp(),
 'security',jsonb_build_object(
 'public_table_access',(select count(*) from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','p','v','m') and (n.nspname='edgar_private' or n.nspname='public' and (c.relname like 'family_%' or c.relname like 'invoice_%')) and (has_table_privilege('anon',c.oid,'SELECT,INSERT,UPDATE,DELETE') or has_table_privilege('authenticated',c.oid,'SELECT,INSERT,UPDATE,DELETE'))),
 'legacy_pairing_allowed',has_function_privilege('anon','public.family_pair_editor(text,text)','EXECUTE') or has_function_privilege('authenticated','public.family_pair_editor(text,text)','EXECUTE'),
 'catalog_session_checks',(select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('family_edgar_add_product','family_edgar_update_presentation','family_save_option','family_option_list') and position('edgar_pin_validate(device)' in pg_catalog.pg_get_functiondef(p.oid))>0),
 'long_sessions',(select count(*) from edgar_private.sessions where expires_at>now()+interval '30 days'),
 'active_commercial_sessions',(select count(*) from edgar_private.sessions where expires_at>now()),
 'public_costs_policy','public_reading_retained'),
 'catalog',jsonb_build_object('active_products',(select count(*) from public.family_products where active),'catalog_rows',(select count(*) from public.family_smart_catalog),'conflicts',(select count(*) from public.family_smart_catalog where conflict),'review',(select count(*) from public.family_smart_catalog where needs_review),'missing_cost',(select count(*) from public.family_presentations p join public.family_products f on f.id=p.product_id where f.active and p.current_cost is null),'fiscal_codes',(select count(*) from edgar_private.product_fiscal),'invalid_vat',(select count(*) from edgar_private.product_fiscal where vat_rate is distinct from 15::numeric)),
 'customers',jsonb_build_object('active',(select count(*) from edgar_private.customers where active),'missing_identification',(select count(*) from edgar_private.customers where active and (identification is null or identification_type='none'))),
 'sales',jsonb_build_object('purchases',(select count(*) from edgar_private.sale_headers),'active_lines',(select count(*) from public.family_daily_sales where voided_at is null),'legacy_lines',(select count(*) from public.family_daily_sales where sale_id is null),'invalid_totals',(select count(*) from public.family_daily_sales where total is distinct from round(quantity*unit_price,2)),'headers_without_lines',(select count(*) from edgar_private.sale_headers h where not exists(select 1 from public.family_daily_sales l where l.sale_id=h.id))),
 'orders',jsonb_build_object('total',(select count(*) from edgar_private.orders),'invalid_totals',(select count(*) from edgar_private.orders o where o.total is distinct from coalesce((select sum(i.line_total) from edgar_private.order_items i where i.order_id=o.id),0)),'overpaid',(select count(*) from edgar_private.orders o where coalesce((select sum(p.amount) from edgar_private.order_payments p where p.order_id=o.id),0)>o.total)),
 'sync',jsonb_build_object('bridge_configured',exists(select 1 from public.family_sheet_bridge where id=1 and length(secret)>=32 and webhook like 'https://script.google.com/macros/s/%/exec'),'last_import',(select checked_at from public.family_live_sync_status where id=1),'source_rows',(select count(*) from public.family_excel_live_rows),'last_sheet_backup',(select max(at) from public.family_audit where action='syncGoogleSheets')),
 'fiscal',jsonb_build_object('drafts',(select count(*) from edgar_private.invoice_drafts),'documents',(select count(*) from edgar_private.invoice_documents),'authorized',(select count(*) from edgar_private.invoice_documents where status='authorized'),'rejected',(select count(*) from edgar_private.invoice_documents where status='rejected'),'pending',(select count(*) from edgar_private.invoice_documents where status in ('pending','submitted')),'invalid_totals',(select count(*) from edgar_private.invoice_drafts where total is distinct from subtotal+tax),'production_enabled',edgar_private.invoice_production_enabled(),'checks',(select to_jsonb(r)-'id' from edgar_private.invoice_release_control r where id=1),'signing',(select jsonb_build_object('signer_ready',signer_ready,'sri_ready',sri_ready,'certificate_registered',certificate_fingerprint is not null,'valid_until',valid_until,'verified_at',verified_at) from edgar_private.signing_status where id=1)),
 'audit',jsonb_build_object('database_events',(select count(*) from edgar_private.operation_audit),'commercial_events',(select count(*) from public.family_audit),'recent',coalesce((select jsonb_agg(to_jsonb(x) order by x.occurred_at desc,x.event_id desc) from (select * from (select occurred_at,id::text as event_id,entity,operation,source from edgar_private.operation_audit order by occurred_at desc,id desc limit 50) d union all select * from (select at,id::text,'catalog',left(action,100),left(actor,50) from public.family_audit order by at desc,id desc limit 50) c order by occurred_at desc,event_id desc limit 50) x),'[]'::jsonb)),
 'limits',jsonb_build_object('backup_restore_verified',false,'live_sri_test_performed',false,'individual_actor_attribution',false)
 ) into snapshot;
 return snapshot;
end $$;
revoke all on function public.family_admin_diagnostics(text) from public,anon,authenticated;
grant execute on function public.family_admin_diagnostics(text) to service_role;
