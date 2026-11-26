
-- Preserve the latest normalized categories after a staging import.
create trigger smart_on_staging after insert or update or delete on public.family_sheet_staging for each statement execute function public.family_smart_refresh_trigger();
-- Additional general patterns for the remaining commercial families.
insert into public.family_smart_rules(kind,pattern,value,priority) values
('category','\m(ojos? moviles?|ojos? locos?)\M','Ojos móviles',15),
('category','\m(tiza|dedal|enhebrador|abreojal|abreojales|carrete|bobina)\M','Accesorios de costura',20),
('category','\m(gafete|corchete|gancho|ganchos|herraje)\M','Cierres y sujeciones',25),
('category','\m(aplique|apliques)\M','Apliques',20),
('category','\m(pinza|pinzas) de madera\M','Pinzas de madera',15),
('category','\m(pinza|pinzas) lagarto\M','Accesorios para el cabello',15),
('category','\m(copa|copas) (de |para )?(brasier|sosten)\M','Insumos de lencería',15),
('category','\m(limpiapipas|chenil|iman|imanes)\M','Manualidades',20),
('category','\m(tinte|tintes)\M','Tintes textiles',20),
('category','\m(pasamaneria|borla|borlas)\M','Pasamanería',25),
('category','\m(velo|velos|frori|georgina)\M','Telas para cortinas',25),
('variant','\m(poliester)\M','Poliéster',40),
('variant','\m(multicolor|multicolores)\M','Multicolor',40),
('variant','\m(plastico|plastica|plasticos|plasticas)\M','Plástico',40),
('variant','\m(niquel)\M','Níquel',40),
('variant','\m(natural|naturales)\M','Natural',40),
('variant','\m(oro|plata)\M','Oro / plata',50)
on conflict(kind,pattern) do nothing;
