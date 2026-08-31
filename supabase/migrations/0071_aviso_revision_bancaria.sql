-- ============================================================================
--  AROCO · 0071 — El aviso de cambio bancario no salía nunca
--
--  La prueba de punta a punta lo destapó: cambiar la cuenta bancaria SÍ devuelve
--  la ficha a 'Pendiente' —eso funcionaba— pero el aviso a quien verifica no
--  llegaba. Justamente el que más importa: es el vector de fraude del portal.
--
--  La causa es una sutileza de Postgres. El trigger estaba declarado
--  `after update OF estado`, y esa cláusula NO mira si la columna cambió: mira
--  si la columna aparece en el SET de la sentencia. El proveedor escribe
--
--      update proveedores_insumos set numero_cuenta = '...'
--
--  y es el trigger BEFORE el que pone `estado := 'Pendiente'`. Como la
--  sentencia nunca nombra `estado`, el trigger AFTER no se dispara.
--
--  Se quita la cláusula `of estado`: el trigger corre en cualquier UPDATE y la
--  condición de verdad —pasó a Pendiente viniendo de otro estado— ya la
--  comprueba la función por dentro.
-- ============================================================================

drop trigger if exists proveedores_insumos_avisa_revision on public.proveedores_insumos;

create trigger proveedores_insumos_avisa_revision
  after update on public.proveedores_insumos
  for each row execute function public.notificar_proveedor_revision();
