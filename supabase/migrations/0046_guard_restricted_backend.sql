-- ============================================================================
--  AROCO · 0046 — El candado del acta restringida no debe frenar al backend
--
--  El trigger de 0045 exige `is_admin()` para cambiar `meetings.restricted`.
--  Con `service_role` no hay sesión, así que `auth.uid()` es NULL, `is_admin()`
--  da false y el backend queda sin poder corregir el dato — ni siquiera desde
--  un script de mantenimiento o una migración.
--
--  Se permite el cambio cuando no hay usuario en la petición. No abre un
--  hueco: las políticas de `meetings` son `to authenticated`, así que una
--  petición anónima no llega siquiera a la tabla; el único camino sin
--  `auth.uid()` es la clave de servicio, que solo vive en el servidor.
-- ============================================================================

create or replace function public.guard_meeting_restricted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.restricted is distinct from old.restricted
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Solo Dirección puede cambiar la restricción de un acta.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
