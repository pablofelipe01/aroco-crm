-- ============================================================================
--  AROCO · 0073 — Pablo y Nicolás también verifican proveedores
--
--  0068 dejó el permiso solo en Milena Soto. Ver el módulo ya lo podían los
--  dos —son SuperAdmin y el menú se los muestra— pero los botones de activar,
--  rechazar, aprobar una cuenta de cobro y marcarla pagada dependen de esta
--  bandera, no del rol.
--
--  Es a propósito que dependa de la bandera: decidir sobre pagos y datos
--  bancarios no debería heredarse de ser administrador. Por eso se concede una
--  por una, y no se cambia la regla.
-- ============================================================================

update public.profiles
set verifica_proveedores = true
where email in (
  'pablofelipe@me.com',          -- Pablo Felipe · Plataforma / CRM
  'nicolas.rodriguez@aroco.co'   -- Nicolás Rodríguez · Gerente Comercial
);
