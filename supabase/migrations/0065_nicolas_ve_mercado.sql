-- ============================================================================
--  AROCO · 0065 — Nicolás Rodríguez también ve Mercado
--
--  0062 dejó el permiso en Álvaro y Pablo. Se suma el Gerente Comercial: es
--  quien negocia los precios de venta, y decidir sin ver la exposición ni la
--  cobertura es decidir a ciegas sobre la mitad del problema.
--
--  El cambio ya está aplicado en la base; esto queda para que una
--  reconstrucción desde cero no lo pierda. Es idempotente.
-- ============================================================================

update public.profiles
set ve_mercado = true
where email = 'nicolas.rodriguez@aroco.co';
