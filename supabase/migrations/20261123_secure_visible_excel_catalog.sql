-- Costos y tarifas del Excel son datos administrativos: nunca permitir SELECT anónimo.
DROP POLICY IF EXISTS "Leer hojas comerciales visibles" ON public.family_excel_catalog_sheets;
DROP POLICY IF EXISTS "Leer registros comerciales visibles" ON public.family_excel_catalog_rows;
REVOKE ALL ON TABLE public.family_excel_catalog_sheets FROM anon,authenticated;
REVOKE ALL ON TABLE public.family_excel_catalog_rows FROM anon,authenticated;
ALTER TABLE public.family_excel_catalog_sheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.family_excel_catalog_rows ENABLE ROW LEVEL SECURITY;