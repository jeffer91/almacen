-- Nicole Encajes: conservar columnas originales de hojas comerciales visibles.
-- Los registros de este origen NO alteran family_products ni family_prices.
create table if not exists public.family_excel_catalog_sheets (
 sheet_name text primary key,
 sheet_order integer not null,
 title text not null,
 header_row integer not null,
 headers jsonb not null default '{}'::jsonb,
 max_column integer not null,
 row_count integer not null,
 source_hash text not null,
 updated_at timestamptz not null default now()
);
create table if not exists public.family_excel_catalog_rows (
 sheet_name text not null references public.family_excel_catalog_sheets(sheet_name) on delete cascade,
 sheet_row integer not null check(sheet_row between 1 and 65536),
 display_name text not null,
 cells jsonb not null,
 batch_no integer not null check(batch_no between 1 and 10),
 source_hash text not null,
 imported_at timestamptz not null default now(),
 primary key(sheet_name,sheet_row)
);
create index if not exists family_excel_catalog_rows_batch_idx
 on public.family_excel_catalog_rows(batch_no,sheet_name,sheet_row);
create index if not exists family_excel_catalog_rows_source_idx
 on public.family_excel_catalog_rows(source_hash);
alter table public.family_excel_catalog_sheets enable row level security;
alter table public.family_excel_catalog_rows enable row level security;
drop policy if exists "Leer hojas comerciales visibles" on public.family_excel_catalog_sheets;
create policy "Leer hojas comerciales visibles" on public.family_excel_catalog_sheets
 for select to anon,authenticated using(true);
drop policy if exists "Leer registros comerciales visibles" on public.family_excel_catalog_rows;
create policy "Leer registros comerciales visibles" on public.family_excel_catalog_rows
 for select to anon,authenticated using(true);
grant select on public.family_excel_catalog_sheets, public.family_excel_catalog_rows to anon,authenticated;
revoke insert,update,delete on public.family_excel_catalog_sheets,public.family_excel_catalog_rows from anon,authenticated;
