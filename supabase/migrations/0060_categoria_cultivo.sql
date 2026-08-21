-- ============================================================================
--  AROCO · 0060 — «Plantación» pasa a llamarse «Cultivo»
--
--  Es la palabra que usa el equipo. Se cambia el valor del enum en vez de
--  agregar uno nuevo y migrar filas: renombrar conserva la identidad del valor,
--  así que las solicitudes que ya lo tuvieran quedan apuntando al nombre nuevo
--  solas, sin un UPDATE que pudiera dejar filas a medio migrar.
--
--  Hoy ninguna solicitud usa esta categoría (Otro 3, Tecnología 2, Oficina 1,
--  Finca 1), pero el renombrado es correcto igual y no depende de eso.
-- ============================================================================

do $$ begin
  alter type public.compra_categoria rename value 'Plantación' to 'Cultivo';
exception
  -- Si ya se renombró, no es un error: la migración tiene que poder correr dos
  -- veces sin tumbar el resto del archivo.
  when invalid_parameter_value then null;
end $$;
