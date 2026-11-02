-- Índices para localizar proveedores en historiales largos.
create index if not exists family_presentations_supplier_idx
  on public.family_presentations(supplier_id);
create index if not exists family_cost_history_supplier_idx
  on public.family_cost_history(supplier_id);
