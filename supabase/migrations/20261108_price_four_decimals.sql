-- El precio se guarda sin IVA; con 4 decimales el precio con IVA vuelve exacto (p. ej. 10,00 con IVA).
alter table public.family_prices alter column price type numeric(14,4);
