-- ============================================================================
--  AROCO · 0053 — El dueño de la pregunta lo pone la base
--
--  La política de borrado de 0052 dice «solo el autor, y solo mientras siga
--  pendiente». Al probarla con usuarios reales salió el hueco: si quien
--  inserta no manda `created_by`, la fila queda con dueño nulo, y entonces
--  `created_by = auth.uid()` nunca es cierto — ni siquiera para quien la
--  escribió. La pregunta queda sin dueño y nadie salvo un admin la puede
--  borrar.
--
--  Hoy la acción del CRM sí manda `created_by`, así que no hay filas rotas.
--  Pero que la propiedad dependa de que el cliente se acuerde es justo la
--  clase de cosa que se rompe callada. La base lo pone sola.
--
--  Se deja NULL cuando no hay usuario (service_role): así se siembra desde una
--  migración o un script sin inventarle un autor a la fila.
-- ============================================================================

alter table public.preguntas
  alter column created_by set default auth.uid();
