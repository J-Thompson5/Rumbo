-- ============================================================================
-- Fractal · Agregar columna description a milestones
-- ============================================================================

alter table public.milestones
  add column if not exists description text;

-- Refrescar el caché del esquema expuesto por PostgREST
notify pgrst, 'reload schema';
