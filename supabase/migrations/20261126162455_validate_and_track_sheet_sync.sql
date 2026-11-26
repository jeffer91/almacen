
create table public.family_live_sync_status(
 id integer primary key check(id=1), checked_at timestamptz not null, rows_count integer not null, changed_rows integer not null
);
alter table public.family_live_sync_status enable row level security;
revoke all on public.family_live_sync_status from public,anon,authenticated;
grant select,insert,update on public.family_live_sync_status to service_role;
create or replace function public.family_replace_live_excel(p_rows jsonb) returns integer
language plpgsql security invoker set search_path=public,pg_catalog as $$
declare n integer;
begin
 if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1000 and 20000 then raise exception 'Carga incompleta o fuera de límite'; end if;
 perform pg_advisory_xact_lock(2681126);
 if (select count(distinct x.sheet_name) from jsonb_to_recordset(p_rows) as x(sheet_name text))<>(select count(*) from public.family_excel_catalog_sheets) then raise exception 'Faltan hojas'; end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) x(sheet_name text,sheet_row integer,display_name text,cells jsonb) where x.sheet_name is null or x.sheet_row is null or x.sheet_row not between 1 and 65536 or x.display_name is null or jsonb_typeof(x.cells) is distinct from 'object') then raise exception 'Fila inválida'; end if;
 if exists(select 1 from jsonb_to_recordset(p_rows) x(sheet_name text,sheet_row integer) group by 1,2 having count(*)>1) then raise exception 'Filas fuente repetidas'; end if;
 if exists(select 1 from public.family_excel_catalog_sheets s where (select count(*) from jsonb_to_recordset(p_rows) x(sheet_name text) where x.sheet_name=s.sheet_name)<greatest(s.row_count,(select count(*) from public.family_excel_live_rows l where l.sheet_name=s.sheet_name))) then raise exception 'Carga incompleta: faltan registros de una hoja'; end if;
 if exists(select 1 from public.family_excel_live_rows l where not exists(select 1 from jsonb_to_recordset(p_rows) x(sheet_name text,sheet_row integer) where x.sheet_name=l.sheet_name and x.sheet_row=l.sheet_row)) then raise exception 'Faltan identificadores de origen; revisar antes de sincronizar';end if;
 insert into public.family_excel_live_rows(sheet_name,sheet_row,display_name,cells)
 select x.sheet_name,x.sheet_row,x.display_name,x.cells from jsonb_to_recordset(p_rows) as x(sheet_name text,sheet_row integer,display_name text,cells jsonb)
 on conflict(sheet_name,sheet_row) do update set display_name=excluded.display_name,cells=excluded.cells,imported_at=now()
 where (family_excel_live_rows.display_name,family_excel_live_rows.cells) is distinct from (excluded.display_name,excluded.cells);
 get diagnostics n=row_count;
 insert into public.family_live_sync_status(id,checked_at,rows_count,changed_rows) values(1,now(),jsonb_array_length(p_rows),n)
 on conflict(id) do update set checked_at=excluded.checked_at,rows_count=excluded.rows_count,changed_rows=excluded.changed_rows;
 return n;
end $$;
revoke all on function public.family_replace_live_excel(jsonb) from public,anon,authenticated;
grant execute on function public.family_replace_live_excel(jsonb) to service_role;
