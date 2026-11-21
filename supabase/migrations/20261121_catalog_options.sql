create table public.family_editor_keys (
  fingerprint text primary key, invitation boolean not null
);
create table public.family_catalog_options (
  id uuid primary key default gen_random_uuid(),
  product text not null, brand text not null, source_label text,
  label text not null, supplier text not null, quantity numeric, unit text not null,
  cost numeric, gross numeric, revision integer not null default 1,
  check (quantity > 0 and cost >= 0 and gross >= 0),
  check (gross is not null or cost is not null or source_label is not null)
);
create unique index family_option_key on public.family_catalog_options
  (lower(product),lower(brand),lower(label),lower(supplier));
create unique index family_option_source on public.family_catalog_options
  (lower(product),lower(brand),lower(source_label)) where source_label is not null;
alter table public.family_editor_keys enable row level security;
alter table public.family_catalog_options enable row level security;
revoke all on public.family_editor_keys, public.family_catalog_options from public, anon, authenticated;

create function public.family_pair_editor(invite text, device text) returns boolean
language plpgsql security definer set search_path = pg_catalog, public as $$
begin
  if device is null or device !~ '^[0-9a-f]{64}$' then return false; end if;
  delete from family_editor_keys where invitation and fingerprint=encode(sha256(convert_to(invite,'UTF8')),'hex');
  if not found then return false; end if;
  insert into family_editor_keys values(encode(sha256(convert_to(device,'UTF8')),'hex'),false);
  return true;
end $$;

create function public.family_option_list(device text default '') returns jsonb
language sql stable security definer set search_path = pg_catalog, public as $$
  select jsonb_build_object('options',coalesce((select jsonb_agg(to_jsonb(o) order by label,supplier,id) from family_catalog_options o),'[]'),
    'assigned',coalesce((select jsonb_object_agg(p.id,s.name) from family_presentations p join family_suppliers s on p.supplier_id=s.id
      join family_products f on f.id=p.product_id where f.active),'{}'),
    'suppliers',case when exists(select 1 from family_editor_keys where not invitation and fingerprint=encode(sha256(convert_to(device,'UTF8')),'hex'))
    then (select coalesce(jsonb_agg(name order by name),'[]') from (select name from family_suppliers where active union select supplier from family_catalog_options where supplier<>'') names) end)
$$;

create function public.family_save_option(device text, entry jsonb) returns uuid
language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  r family_catalog_options;
begin
  if not exists(select 1 from family_editor_keys where not invitation and fingerprint=encode(sha256(convert_to(device,'UTF8')),'hex')) then
    raise insufficient_privilege using message='Abre el enlace de activación de Edgar en este navegador.';
  end if;
  r := jsonb_populate_record(null::family_catalog_options,entry);
  r.product:=trim(r.product); r.label:=trim(r.label); r.supplier:=trim(regexp_replace(r.supplier,'[[:space:]]+',' ','g'));
  if length(r.product) not between 1 and 180 or length(r.label) not between 1 and 100 or length(r.supplier)>160
     or length(r.brand)>160 or length(r.unit)>80 or length(r.source_label)>160 then raise exception 'Revisa el producto y la presentación.'; end if;
  if r.id is null then
    insert into family_catalog_options(product,brand,source_label,label,supplier,quantity,unit,cost,gross)
      values(r.product,r.brand,r.source_label,r.label,r.supplier,r.quantity,r.unit,r.cost,r.gross) returning id into r.id;
  else
    update family_catalog_options set label=r.label,supplier=r.supplier,quantity=r.quantity,unit=r.unit,cost=r.cost,gross=r.gross,revision=revision+1
      where id=r.id and revision=r.revision;
    if not found then raise exception 'Otra persona actualizó esta fila. Vuelve a cargarla.'; end if;
  end if;
  return r.id;
exception when unique_violation then raise exception 'La opción ya existe. Recarga la tabla y edita la fila existente.';
end $$;
revoke all on function public.family_pair_editor(text,text),public.family_option_list(text),public.family_save_option(text,jsonb) from public;
grant execute on function public.family_pair_editor(text,text),public.family_option_list(text),public.family_save_option(text,jsonb) to anon, authenticated;
