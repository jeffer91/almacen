
-- Production-only document registry. Certification responses must never enter accounting.
create function edgar_private.fiscal_key_valid(k text) returns boolean language plpgsql immutable set search_path='' as $$
declare i integer; n integer:=0; w integer:=2; d integer;
begin
 if k is null or k!~'^[0-9]{49}$' or substr(k,24,1)<>'2' or substr(k,9,2)<>'01' or substr(k,48,1)<>'1' then return false;end if;
 for i in reverse 48..1 loop n:=n+substr(k,i,1)::integer*w;w:=case when w=7 then 2 else w+1 end;end loop;
 d:=11-mod(n,11);
 return substr(k,49,1)::integer=case d when 11 then 0 when 10 then 1 else d end;
end $$;
revoke all on function edgar_private.fiscal_key_valid(text) from public,anon,authenticated;
alter table edgar_private.invoice_documents add constraint invoice_production_key_only check(access_key is null or edgar_private.fiscal_key_valid(access_key));
alter table edgar_private.invoice_documents add constraint invoice_fiscal_number_matches_key check(access_key is null or (fiscal_number is not null and fiscal_number=substr(access_key,25,3)||'-'||substr(access_key,28,3)||'-'||substr(access_key,31,9) and substr(access_key,31,9)<>'000000000'));
-- Gates are controlled only by the trusted backend, never by the commercial PIN.
create table edgar_private.invoice_release_control(
 id integer primary key check(id=1),
 official_schema_verified boolean not null default false,
 provider_rule_verified boolean not null default false,
 certificate_trust_verified boolean not null default false,
 certificate_revocation_verified boolean not null default false,
 issuer_identity_verified boolean not null default false,
 sequence_verified boolean not null default false,
 certification_authorized boolean not null default false,
 ride_verified boolean not null default false,
 delivery_verified boolean not null default false,
 owner_release_approved boolean not null default false
);
insert into edgar_private.invoice_release_control(id) values(1);
alter table edgar_private.invoice_release_control enable row level security;
revoke all on edgar_private.invoice_release_control from public,anon,authenticated;
create function edgar_private.invoice_production_enabled() returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select r.official_schema_verified and r.provider_rule_verified and r.certificate_trust_verified and r.certificate_revocation_verified and r.issuer_identity_verified and r.sequence_verified and r.certification_authorized and r.ride_verified and r.delivery_verified and r.owner_release_approved and s.signer_ready and s.sri_ready and s.valid_until>now() from edgar_private.invoice_release_control r cross join edgar_private.signing_status s where r.id=1 and s.id=1),false)
$$;
revoke all on function edgar_private.invoice_production_enabled() from public,anon,authenticated;
create function edgar_private.invoice_document_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare d edgar_private.invoice_drafts%rowtype; ruc text;
begin
 if tg_op='DELETE' then raise exception 'No se permite borrar documentos fiscales';end if;
 if tg_op='UPDATE' then
  if old.draft_id is distinct from new.draft_id or old.access_key is not null and old.access_key is distinct from new.access_key or old.fiscal_number is not null and old.fiscal_number is distinct from new.fiscal_number then raise exception 'No se puede cambiar identidad fiscal';end if;
  if old.status in ('authorized','cancellation_requested','cancelled') and (old.authorized_xml is distinct from new.authorized_xml or old.authorization_at is distinct from new.authorization_at or old.signed_xml is distinct from new.signed_xml or new.status not in ('authorized','cancellation_requested','cancelled') or old.status='cancelled' and new.status<>'cancelled') then raise exception 'No se puede alterar un comprobante autorizado';end if;
 end if;
 if tg_op='INSERT' or new.status in ('submitted','authorized') and (old.status is distinct from new.status) then
  if not edgar_private.invoice_production_enabled() then raise exception 'Emisión productiva bloqueada: requisitos pendientes';end if;
 end if;
 if new.access_key is not null then
  select * into strict d from edgar_private.invoice_drafts where id=new.draft_id;
  select details->>'ruc' into ruc from edgar_private.invoice_issuer limit 1;
  if substr(new.access_key,1,8)<>to_char(d.issue_date,'DDMMYYYY') or substr(new.access_key,11,13) is distinct from ruc then raise exception 'Clave de acceso no coincide con fecha o emisor';end if;
 end if;
 if new.status in ('submitted','authorized','cancellation_requested','cancelled') and (new.access_key is null or coalesce(length(new.signed_xml),0)=0) then raise exception 'Documento firmado y clave obligatorios';end if;
 return new;
end $$;
revoke all on function edgar_private.invoice_document_guard() from public,anon,authenticated;
create trigger invoice_document_production_guard before insert or update or delete on edgar_private.invoice_documents for each row execute function edgar_private.invoice_document_guard();
create function public.edgar_invoice_readiness(p_token text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if public.edgar_pin_validate(p_token) is distinct from true then raise exception 'SESSION_INVALID' using errcode='28000';end if;
 select to_jsonb(r)-'id'||jsonb_build_object('signer_ready',s.signer_ready,'sri_ready',s.sri_ready,'certificate_current',coalesce(s.valid_until>now(),false),'production_enabled',edgar_private.invoice_production_enabled()) into result from edgar_private.invoice_release_control r cross join edgar_private.signing_status s where r.id=1 and s.id=1;
 return result;
end $$;
revoke all on function public.edgar_invoice_readiness(text) from public,anon,authenticated;
grant execute on function public.edgar_invoice_readiness(text) to anon,authenticated,service_role;
