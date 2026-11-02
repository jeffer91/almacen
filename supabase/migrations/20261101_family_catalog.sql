-- Almacén Familiar · modelo central para Supabase
-- Ejecutar una vez en un proyecto nuevo. Todas las operaciones de escritura
-- se realizan exclusivamente mediante la Edge Function catalog-api.
create extension if not exists pgcrypto;

create table if not exists public.family_access_links (
  role text primary key check (role in ('edgar','gloria','jefferson')),
  token_hash text not null unique,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.family_suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 160),
  phone text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.family_products (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 180),
  category text not null default '',
  brand text not null default '',
  created_by text not null check (created_by in ('edgar','gloria','jefferson')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_presentations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.family_products(id) on delete restrict,
  label text not null check (length(btrim(label)) between 1 and 80),
  quantity numeric(14,3) not null default 1 check (quantity > 0),
  unit text not null default 'unidad',
  supplier_id uuid references public.family_suppliers(id) on delete set null,
  current_cost numeric(14,4) check (current_cost >= 0),
  cost_recorded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_cost_history (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.family_presentations(id) on delete restrict,
  supplier_id uuid references public.family_suppliers(id) on delete set null,
  cost numeric(14,4) not null check (cost >= 0),
  recorded_at timestamptz not null default now(),
  recorded_by text not null default 'jefferson'
);

create table if not exists public.family_prices (
  presentation_id uuid not null references public.family_presentations(id) on delete restrict,
  shop text not null check (shop in ('edgar','gloria','jefferson')),
  price numeric(14,2) not null check (price >= 0),
  updated_at timestamptz not null default now(),
  updated_by text not null check (updated_by in ('edgar','gloria','jefferson')),
  primary key (presentation_id,shop)
);

create table if not exists public.family_photos (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.family_products(id) on delete restrict,
  storage_path text not null unique,
  color_label text not null default '',
  is_primary boolean not null default false,
  created_by text not null check (created_by in ('edgar','gloria','jefferson')),
  created_at timestamptz not null default now()
);

create unique index if not exists family_one_primary_photo
  on public.family_photos (product_id) where is_primary;
create index if not exists family_products_name_idx on public.family_products (lower(name));
create index if not exists family_presentations_product_idx on public.family_presentations(product_id);
create index if not exists family_cost_history_presentation_idx
  on public.family_cost_history(presentation_id,recorded_at desc);
create index if not exists family_photos_product_idx on public.family_photos(product_id);

create table if not exists public.family_audit (
  id bigint generated always as identity primary key,
  actor text not null,
  action text not null,
  target_id text not null default '',
  details jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);

-- Actualización atómica: un costo vigente compartido y su historial.
create or replace function public.family_set_cost(
  p_presentation_id uuid, p_cost numeric, p_supplier_id uuid default null
) returns void language plpgsql security definer set search_path=public as $$
begin
  if p_cost is null or p_cost < 0 then raise exception 'Costo inválido'; end if;
  update family_presentations set current_cost=p_cost,
      supplier_id=p_supplier_id,cost_recorded_at=now(),updated_at=now()
    where id=p_presentation_id;
  if not found then raise exception 'Presentación no encontrada'; end if;
  insert into family_cost_history(presentation_id,supplier_id,cost,recorded_by)
    values(p_presentation_id,p_supplier_id,p_cost,'jefferson');
end;
$$;

-- Ni la llave pública ni los usuarios anónimos pueden consultar o escribir directamente.
do $$
declare t text;
begin
  foreach t in array array[
    'family_access_links','family_suppliers','family_products',
    'family_presentations','family_cost_history','family_prices',
    'family_photos','family_audit'
  ] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated, public',t);
    execute format('grant all on public.%I to service_role',t);
  end loop;
end $$;
revoke all on function public.family_set_cost(uuid,numeric,uuid)
  from public,anon,authenticated;
grant execute on function public.family_set_cost(uuid,numeric,uuid) to service_role;
grant usage on schema public to service_role;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values('family-photos','family-photos',false,2097152,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

-- Para activar los tres enlaces, ejecutar UNA VEZ el siguiente SQL en el
-- editor privado de Supabase. Copiar los códigos devueltos; no publicarlos:
--
-- with tokens as (
--   select role, encode(gen_random_bytes(32),'hex') as secret
--   from unnest(array['edgar','gloria','jefferson']) as role
-- ), write as (
--   insert into public.family_access_links(role,token_hash)
--   select role,encode(digest(secret,'sha256'),'hex') from tokens
--   on conflict(role) do update set token_hash=excluded.token_hash,
--      enabled=true,updated_at=now()
--   returning role
-- )
-- select tokens.role,tokens.secret from tokens join write using(role);
--
-- Enlace: https://jeffer91.github.io/almacen/<rol>/#key=<secret>
-- Cualquiera con el enlace completo tiene los permisos de ese rol:
-- nunca publicarlo en GitHub, ni enviarlo a personas ajenas.
