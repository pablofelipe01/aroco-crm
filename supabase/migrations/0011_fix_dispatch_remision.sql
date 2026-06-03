-- ============================================================================
--  AROCO · 0011 — Dispatch remisión is not unique
--
--  A single remisión de salida can group several procedencias (one line per
--  origin lot), so remision_salida repeats across rows. Replace the partial
--  unique index with a plain index.
-- ============================================================================

drop index if exists public.dispatches_remision_salida_key;
create index if not exists dispatches_remision_salida_idx
  on public.dispatches (remision_salida);
