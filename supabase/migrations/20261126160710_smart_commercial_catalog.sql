
create table public.family_smart_rules (
 id bigint generated always as identity primary key,
 kind text not null check(kind in ('category','variant','alias')),
 pattern text not null, value text not null, priority integer not null default 100,
 active boolean not null default true, unique(kind,pattern)
);
create table public.family_smart_overrides (
 source_id text primary key, category text, variety text, provider text, canonical_name text,
 updated_at timestamptz not null default now()
);
create table public.family_smart_catalog (
 source_id text primary key, source_kind text not null, original_name text not null,
 canonical_name text not null, category text not null, variety text not null,
 provider text not null, size_value numeric, size_unit text, presentation text not null,
 cost numeric, tariffs jsonb not null default '[]', search_text text not null,
 conflict boolean not null default false, needs_review boolean not null default false
);
alter table public.family_smart_rules enable row level security;
alter table public.family_smart_overrides enable row level security;
alter table public.family_smart_catalog enable row level security;
revoke all on public.family_smart_rules,public.family_smart_overrides,public.family_smart_catalog from public,anon,authenticated;
grant select,insert,update,delete on public.family_smart_rules,public.family_smart_overrides,public.family_smart_catalog to service_role;
grant usage,select on sequence public.family_smart_rules_id_seq to service_role;
create index family_smart_category_idx on public.family_smart_catalog(category,variety,provider,size_value);
create index family_smart_name_idx on public.family_smart_catalog(canonical_name);
insert into public.family_smart_rules(kind,pattern,value,priority) values
('alias','\m(pon\s*pon|pom\s*pon|pompom)(es|s)?\M','pompon',10),
('category','\m(pompon|pompones)\M','Pompones',10),
('category','\m(encaje|encajes)\M','Encajes',30),
('category','\m(cinta|cintas)\M','Cintas',30),
('category','\m(fleco|flecos|cuquillo)\M','Flecos',20),
('category','\m(elastico|elasticos)\M','Elásticos',30),
('category','\m(reata|reatas)\M','Reatas',20),
('category','\m(sesgo|sesgos)\M','Sesgos',20),
('category','\m(cola|colita) (de )?(raton|rata)\M|\mcordon(es)?\M','Cordones',20),
('category','\m(greca|grecas|galon|galones)\M','Grecas',20),
('category','\m(aguja|agujas|alfiler|alfileres)\M','Agujas y alfileres',20),
('category','\m(boton|botones)\M','Botones',20),
('category','\m(velcro)\M','Velcro',20),
('category','\m(perla|perlas|chaquira|chaquiras|mullo|mullos)\M','Perlas y chaquiras',20),
('category','\m(hilo|hilos)\M','Hilos',20),
('category','\m(flor|flores|crisantemo|crisantemos)\M','Flores',20),
('category','\m(tijera|tijeras|cortahilo|estilete)\M','Tijeras y cortadores',20),
('category','\m(escarcha|brillantina)\M','Escarcha y brillantina',20),
('category','\m(cascabel|cascabeles)\M','Cascabeles',20),
('category','\m(campana|campanas)\M','Campanas',20),
('category','\m(lentejuela|lentejuelas)\M','Lentejuelas',20),
('category','\m(imperdible|imperdibles)\M','Imperdibles',20),
('category','\m(yute)\M','Yute',20),
('category','\m(malla|mallas)\M','Mallas decorativas',20),
('category','\m(pincel|pinceles)\M','Pinceles',20),
('category','\m(crochet|ganchillo|ganchillos)\M','Crochet y ganchillos',20),
('category','\m(silicona|goma)\M','Adhesivos',20),
('variant','\m(surt|surtido|surtidos|surtida|surtidas)\M','Surtido',10),
('variant','\m(metal|metalico|metalicos|metalica|metalicas)\M','Metálico',20),
('variant','\m(continuo|continua|continuos|continuas)\M','Continuo',30),
('variant','\m(neon)\M','Neón',40),
('variant','\m(tornasol)\M','Tornasol',40),
('variant','\m(plisado|plisada|plisados|plisadas)\M','Plisado',40),
('variant','\m(bordado|bordada|bordados|bordadas)\M','Bordado',40),
('variant','\m(raso)\M','Raso',40),
('variant','\m(organza)\M','Organza',40),
('variant','\m(gros)\M','Gros',40),
('variant','\m(reflectivo|reflectiva|reflec)\M','Reflectivo',40),
('variant','\m(dorado|dorada|dorados|doradas)\M','Dorado',40),
('variant','\m(elastico|elastica)\M','Elástico',40),
('variant','\m(zigzag)\M','Zigzag',40),
('variant','\m(plano|plana|planos|planas)\M','Plano',40),
('variant','\m(redondo|redonda|redondos|redondas)\M','Redondo',40),
('variant','\m(lurex)\M','Lurex',40);
create or replace function public.family_smart_norm(t text) returns text language sql immutable security invoker set search_path=pg_catalog as $$
 select trim(regexp_replace(translate(lower(coalesce(t,'')),'áéíóúüñ','aeiouun'),'[^a-z0-9.,]+',' ','g'))
$$;
create or replace function public.family_smart_number(t text) returns numeric language sql immutable security invoker set search_path=pg_catalog as $$
 select case when trim(coalesce(t,'')) ~ '^[0-9]+([.,][0-9]+)?$' then replace(trim(t),',','.')::numeric end
$$;
create or replace function public.family_smart_refresh() returns integer language plpgsql security invoker set search_path=public,pg_catalog as $$
declare n integer;
begin
 perform pg_advisory_xact_lock(2681127);
 delete from public.family_smart_catalog;
 with source_rows as (
  select 'excel-'||r.sheet_name||'-'||r.sheet_row||'-'||nk.key as source_id,'excel'::text as source_kind,
   coalesce(r.cells->>nk.key,case when nk.key='A' then r.display_name end) as original_name,
   r.sheet_name, r.cells, s.headers, nk.key as name_col,
   (select min(k) from jsonb_each_text(s.headers) h(k,v) where k>nk.key and public.family_smart_norm(v)~'^(articulo|nombre|numero)( |$)') as next_col
  from public.family_excel_live_rows r join public.family_excel_catalog_sheets s using(sheet_name)
  cross join lateral (
    select k as key from jsonb_each_text(s.headers) h(k,v) where public.family_smart_norm(v)~'^(articulo|nombre|numero)( |$)'
    union all select 'A' where not exists(select 1 from jsonb_each_text(s.headers) h(k,v) where public.family_smart_norm(v)~'^(articulo|nombre|numero)( |$)')
  ) nk
 ), excel as (
  select x.source_id,x.source_kind,x.original_name,x.sheet_name,
   coalesce((select r.cells->>h.k from jsonb_each_text(x.headers) h(k,v) where h.k>x.name_col and (x.next_col is null or h.k<x.next_col) and public.family_smart_norm(h.v)~'^(cant|mts|metros)' order by h.k limit 1),'') as presentation,
   (select public.family_smart_number(r.cells->>h.k) from jsonb_each_text(x.headers) h(k,v) where h.k>x.name_col and (x.next_col is null or h.k<x.next_col) and regexp_replace(public.family_smart_norm(h.v),'\.','','g') in ('neto','costo') order by h.k limit 1) as cost,
   coalesce((select jsonb_agg(jsonb_build_object('label',h.v,'value',public.family_smart_number(r.cells->>h.k)) order by h.k) from jsonb_each_text(x.headers) h(k,v) where h.k>x.name_col and (x.next_col is null or h.k<x.next_col) and regexp_replace(lower(h.v),'[^a-z]','','g') in ('pxm','pieza','docena','unid','rollo','xm') and public.family_smart_number(r.cells->>h.k)>0 and public.family_smart_number(r.cells->>h.k)<100000 and not(public.family_smart_number(r.cells->>h.k) between 40000 and 60000 and public.family_smart_number(r.cells->>h.k)=trunc(public.family_smart_number(r.cells->>h.k)))),'[]'::jsonb) as tariffs,
   null::text as known_category, null::text as known_provider
  from source_rows x cross join lateral (select x.cells) r
  where x.original_name is not null and trim(x.original_name)<>'' and x.original_name !~ '^[0-9., ]+$'
 ), official as (
  select p.id::text as source_id,'official'::text as source_kind,p.name as original_name,''::text as sheet_name,
   ''::text as presentation,null::numeric as cost,'[]'::jsonb as tariffs,p.category as known_category,null::text as known_provider
  from public.family_products p where p.active
 ), src as (select * from excel union all select * from official), staged as (
  select public.family_smart_norm(raw_values->>3) as name_key,
   case when count(distinct category)=1 then min(category) end as category,
   case when count(distinct nullif(raw_values->>4,''))=1 then min(nullif(raw_values->>4,'')) end as provider
  from public.family_sheet_staging where active group by 1
 ), normalized as (
  select src.*,staged.category as staged_category,staged.provider as staged_provider,
   public.family_smart_norm(original_name) as raw_norm,
   trim(regexp_replace(original_name,'\s*[-*]\s*[[:alpha:]]{2,4}\.?\s*$','','i')) as cleaned,
   upper((regexp_match(original_name,'[-*]\s*([[:alpha:]]{2,4})\.?\s*$','i'))[1]) as suffix
  from src left join staged on staged.name_key=public.family_smart_norm(src.original_name)
 ), aliases as (
  select n.*,coalesce((select regexp_replace(public.family_smart_norm(n.cleaned),r.pattern,r.value,'g') from public.family_smart_rules r where r.active and r.kind='alias' and public.family_smart_norm(n.cleaned)~r.pattern order by r.priority,r.id limit 1),public.family_smart_norm(n.cleaned)) as normalized_name
  from normalized n
 ), classified as (
  select a.*,coalesce(nullif(a.known_category,''),a.staged_category,(select r.value from public.family_smart_rules r where r.active and r.kind='category' and a.normalized_name~r.pattern order by r.priority,r.id limit 1),case a.sheet_name when 'Encaje' then 'Encajes' when 'Cintas' then 'Cintas' when 'Flecos' then 'Flecos' else 'Otros insumos' end) as category,
   coalesce((select string_agg(r.value,' + ' order by r.priority,r.id) from public.family_smart_rules r where r.active and r.kind='variant' and a.normalized_name~r.pattern),'Normal') as variety,
   coalesce(nullif(a.known_provider,''),a.staged_provider,a.suffix,'Sin especificar') as provider,
   regexp_match(a.normalized_name,'([0-9]+(?:[.,][0-9]+)?)\s*(mm|cm|mts|metro|m)\M') as measurement
  from aliases a
 ), final as (
  select c.source_id,c.source_kind,c.original_name,coalesce(o.canonical_name,c.normalized_name) canonical_name,
   coalesce(o.category,c.category) category,coalesce(o.variety,c.variety) variety,coalesce(o.provider,c.provider) provider,
   public.family_smart_number(c.measurement[1]) size_value,c.measurement[2] size_unit,c.presentation,c.cost,c.tariffs
  from classified c left join public.family_smart_overrides o using(source_id)
 ), conflicts as (
  select canonical_name,category,variety,provider,presentation from final where source_kind='excel' and jsonb_array_length(tariffs)>0
  group by 1,2,3,4,5 having count(distinct jsonb_build_array(cost,tariffs))>1
 )
 insert into public.family_smart_catalog
 select f.source_id,f.source_kind,f.original_name,f.canonical_name,f.category,f.variety,f.provider,f.size_value,f.size_unit,f.presentation,f.cost,f.tariffs,
  public.family_smart_norm(concat_ws(' ',f.original_name,f.canonical_name,f.category,f.variety,f.provider,f.presentation)),
  k.canonical_name is not null,
  f.category='Otros insumos' or (f.source_kind='excel' and (f.cost is null or jsonb_array_length(f.tariffs)=0))
 from final f left join conflicts k using(canonical_name,category,variety,provider,presentation);
 get diagnostics n=row_count; return n;
end $$;
create or replace function public.family_smart_refresh_trigger() returns trigger language plpgsql security invoker set search_path=public,pg_catalog as $$ begin perform public.family_smart_refresh(); return null; end $$;
revoke all on function public.family_smart_norm(text),public.family_smart_number(text),public.family_smart_refresh(),public.family_smart_refresh_trigger() from public,anon,authenticated;
grant execute on function public.family_smart_norm(text),public.family_smart_number(text),public.family_smart_refresh(),public.family_smart_refresh_trigger() to service_role;
create trigger smart_on_live after insert or update or delete on public.family_excel_live_rows for each statement execute function public.family_smart_refresh_trigger();
create trigger smart_on_rules after insert or update or delete on public.family_smart_rules for each statement execute function public.family_smart_refresh_trigger();
create trigger smart_on_overrides after insert or update or delete on public.family_smart_overrides for each statement execute function public.family_smart_refresh_trigger();
create trigger smart_on_products after insert or update or delete on public.family_products for each statement execute function public.family_smart_refresh_trigger();
select public.family_smart_refresh();
