-- Preserve commercial precision; total remains rounded to cents.
alter table public.family_daily_sales drop column total, alter column unit_price type numeric(14,4);
alter table public.family_daily_sales add column total numeric(16,2) generated always as (round(quantity * unit_price, 2)) stored;
