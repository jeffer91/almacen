-- Nicole Encajes: registro de artículos vendidos por día.
-- No modifica las tablas actuales del catálogo.
create table if not exists public.family_daily_sales (
  id uuid primary key default gen_random_uuid(),
  sale_date date not null default (timezone('America/Guayaquil', now())::date),
  product_name text not null check (char_length(btrim(product_name)) between 1 and 180),
  presentation_label text not null default '' check (char_length(presentation_label) <= 100),
  quantity numeric(12,3) not null check (quantity > 0 and quantity <= 1000000),
  unit text not null default 'unidad' check (char_length(btrim(unit)) between 1 and 40),
  unit_price numeric(12,2) not null check (unit_price >= 0 and unit_price <= 1000000),
  total numeric(16,2) generated always as (round(quantity * unit_price, 2)) stored,
  payment_method text not null default 'sin_especificar'
    check (payment_method in ('sin_especificar','efectivo','transferencia','tarjeta','otro')),
  notes text not null default '' check (char_length(notes) <= 400),
  created_by text not null default 'jefferson'
    check (created_by in ('jefferson','chat')),
  request_key uuid unique,
  created_at timestamptz not null default now(),
  voided_at timestamptz,
  void_reason text not null default ''
);
create index if not exists family_daily_sales_date_idx
  on public.family_daily_sales(sale_date, created_at desc);
alter table public.family_daily_sales enable row level security;
revoke all on public.family_daily_sales from public, anon, authenticated;
grant select, insert, update on public.family_daily_sales to service_role;
comment on table public.family_daily_sales is 'Ventas por artículo; acceso únicamente mediante API con PIN o conexión administrativa.';