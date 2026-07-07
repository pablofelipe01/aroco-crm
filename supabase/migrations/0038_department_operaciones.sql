-- ============================================================================
--  AROCO · 0038 — Nueva área "Operaciones"
-- ============================================================================
-- Se agrega el valor 'Operaciones' al enum de departamentos para el personal
-- de operaciones (Fernando, John Sáenz, Juan Carlos). Debe ir en su propia
-- transacción: un nuevo valor de enum no puede usarse en la misma en que se crea.

alter type public.department add value if not exists 'Operaciones';
