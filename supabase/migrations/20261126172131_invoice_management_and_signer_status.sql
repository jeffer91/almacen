
create table edgar_private.invoice_documents(
 id uuid primary key default gen_random_uuid(),
 draft_id uuid not null unique references edgar_private.invoice_drafts(id),
 fiscal_number text unique,
 access_key text unique check(access_key is null or access_key ~ '^[0-9]{49}$'),
 status text not null default 'pending' check(status in ('pending','submitted','authorized','rejected','cancellation_requested','cancelled')),
 sri_response jsonb,
 authorization_at timestamptz,
 cancelled_at timestamptz,
 signed_xml text,
 authorized_xml text,
 updated_at timestamptz not null default now(),
 check(status not in ('authorized','cancellation_requested','cancelled') or (access_key is not null and authorization_at is not null and authorized_xml is not null)),
 check(status<>'cancelled' or cancelled_at is not null)
);
create table edgar_private.invoice_events(
 id bigint generated always as identity primary key,
 document_id uuid not null references edgar_private.invoice_documents(id),
 event_type text not null,
 details jsonb not null default '{}'::jsonb,
 occurred_at timestamptz not null default now()
);
create table edgar_private.invoice_adjustments(
 id uuid primary key default gen_random_uuid(),
 document_id uuid not null references edgar_private.invoice_documents(id),
 kind text not null check(kind in ('cancellation','credit_note')),
 reason text not null check(length(trim(reason)) between 1 and 500),
 status text not null check(status in ('requested','submitted','authorized','rejected')),
 amount numeric(16,2) check(amount is null or amount>=0),
 sri_response jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table edgar_private.signing_status(
 id integer primary key check(id=1),
 provider text not null default 'Security Data',
 certificate_fingerprint text,
 certificate_subject text,
 valid_until timestamptz,
 verified_at timestamptz,
 signer_ready boolean not null default false,
 sri_ready boolean not null default false
);
insert into edgar_private.signing_status(id) values(1);
alter table edgar_private.invoice_documents enable row level security;
alter table edgar_private.invoice_events enable row level security;
alter table edgar_private.invoice_adjustments enable row level security;
alter table edgar_private.signing_status enable row level security;
revoke all on edgar_private.invoice_documents,edgar_private.invoice_events,edgar_private.invoice_adjustments,edgar_private.signing_status from public,anon,authenticated;
create index invoice_documents_status_idx on edgar_private.invoice_documents(status);
create index invoice_events_document_idx on edgar_private.invoice_events(document_id,occurred_at);
create index invoice_adjustments_document_idx on edgar_private.invoice_adjustments(document_id);
create function public.edgar_invoice_management(p_token text,p_from date,p_to date,p_query text,p_status text,p_offset integer default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if public.edgar_pin_validate(p_token) is distinct from true then raise exception 'SESSION_INVALID' using errcode='28000';end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>3660 or p_offset is null or p_offset<0 or coalesce(p_status,'') not in ('','draft','pending','submitted','authorized','rejected','cancellation_requested','cancelled') then raise exception 'Filtros inválidos';end if;
 with base as (
  select d.id,d.sale_id,d.issue_date,d.buyer->>'name' as customer,d.buyer->>'identification' as identification,
   d.subtotal,d.tax,d.total,coalesce(f.status,'draft') as status,f.fiscal_number,f.access_key,f.authorization_at
  from edgar_private.invoice_drafts d left join edgar_private.invoice_documents f on f.draft_id=d.id
  where d.issue_date between p_from and p_to
  and (coalesce(trim(p_query),'')='' or concat_ws(' ',d.buyer->>'name',d.buyer->>'identification',f.fiscal_number,f.access_key) ilike '%'||left(trim(p_query),180)||'%')
 ), filtered as (select * from base where coalesce(p_status,'')='' or status=p_status)
 select jsonb_build_object('total',(select count(*) from filtered),'items',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from filtered order by issue_date desc,id desc limit 50 offset p_offset) x),'[]'::jsonb),
 'summary',(select jsonb_build_object('drafts',count(*) filter(where status='draft'),'authorized',count(*) filter(where status in ('authorized','cancellation_requested')),'pending',count(*) filter(where status in ('pending','submitted')),'rejected',count(*) filter(where status='rejected'),'cancelled',count(*) filter(where status='cancelled'),'subtotal',coalesce(sum(subtotal) filter(where status in ('authorized','cancellation_requested')),0),'tax',coalesce(sum(tax) filter(where status in ('authorized','cancellation_requested')),0),'total',coalesce(sum(total) filter(where status in ('authorized','cancellation_requested')),0)) from base),
 'signing',(select jsonb_build_object('provider',provider,'valid_until',valid_until,'verified_at',verified_at,'signer_ready',signer_ready,'sri_ready',sri_ready) from edgar_private.signing_status where id=1),
 'adjustments',coalesce((select jsonb_agg(to_jsonb(x)) from (select a.id,f.fiscal_number,a.kind,a.reason,a.status,a.amount,a.created_at from edgar_private.invoice_adjustments a join edgar_private.invoice_documents f on f.id=a.document_id join base b on b.id=f.draft_id order by a.created_at desc limit 100) x),'[]'::jsonb),
 'credit_total',coalesce((select sum(a.amount) from edgar_private.invoice_adjustments a join edgar_private.invoice_documents f on f.id=a.document_id join base b on b.id=f.draft_id where a.kind='credit_note' and a.status='authorized'),0))
 into result;
 return result;
end $$;
revoke all on function public.edgar_invoice_management(text,date,date,text,text,integer) from public,anon,authenticated;
grant execute on function public.edgar_invoice_management(text,date,date,text,text,integer) to anon,authenticated,service_role;
