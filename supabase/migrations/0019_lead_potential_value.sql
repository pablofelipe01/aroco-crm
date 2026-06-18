-- ============================================================================
--  AROCO · 0019 — Lead potential value (pipeline estimation)
--
--  Each lead can carry a potential business value (COP). The dashboard weights
--  it by pipeline stage (10% "Nuevo" … 100% "Cerrado", 0% "Descartado") to
--  estimate the expected value of the pipeline. RLS already covers leads.
-- ============================================================================

alter table public.leads
  add column if not exists potential_value_cop numeric(16,2);
