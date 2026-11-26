
create function public.edgar_invoice_document_get(p_token text,p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare f edgar_private.invoice_documents%rowtype;
begin
 if public.edgar_pin_validate(p_token) is distinct from true then raise exception 'SESSION_INVALID' using errcode='28000';end if;
 select * into f from edgar_private.invoice_documents where draft_id=p_draft_id;
 if not found then raise exception 'No existe documento fiscal vinculado';end if;
 return jsonb_build_object('fiscal_number',f.fiscal_number,'access_key',f.access_key,'status',f.status,'authorization_at',f.authorization_at,'cancelled_at',f.cancelled_at,
 'authorized_xml',case when f.status in ('authorized','cancellation_requested','cancelled') then f.authorized_xml else null end,
 'events',coalesce((select jsonb_agg(to_jsonb(x)) from (select event_type,occurred_at from edgar_private.invoice_events where document_id=f.id order by occurred_at desc limit 100) x),'[]'::jsonb));
end $$;
revoke all on function public.edgar_invoice_document_get(text,uuid) from public,anon,authenticated;
grant execute on function public.edgar_invoice_document_get(text,uuid) to anon,authenticated,service_role;
