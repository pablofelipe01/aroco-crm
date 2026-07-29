-- ============================================================================
--  AROCO · 0045 — La restricción de actas no estaba surtiendo efecto
--
--  0044 agregó una política de SELECT que excluye las actas restringidas, pero
--  `meetings_write` (de 0017) es `FOR ALL`, y FOR ALL incluye SELECT. Como
--  PostgreSQL combina las políticas permisivas con OR, bastaba con ser miembro
--  activo para leer cualquier acta: la restricción era decorativa.
--
--  Verificado con un usuario de prueba: veía el acta restringida sin estar
--  invitado (el archivo sí quedaba bloqueado, porque ahí solo había una
--  política de lectura).
--
--  Aquí se parte `meetings_write` en insert/update/delete, de modo que la
--  única política de SELECT sea la de 0044. Y se blinda el interruptor: sin
--  esto, cualquier miembro podía abrir un acta restringida con una llamada a
--  la API, aunque la interfaz solo le muestre el botón a Dirección.
-- ============================================================================

drop policy if exists "meetings_write" on public.meetings;

create policy "meetings_insert" on public.meetings
  for insert to authenticated
  with check (public.is_active_member());

create policy "meetings_update" on public.meetings
  for update to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

create policy "meetings_delete" on public.meetings
  for delete to authenticated
  using (public.is_active_member());

-- ── Solo Dirección abre o cierra un acta ────────────────────────────────────
-- La RLS no distingue por columna, así que el candado va en un trigger.
create or replace function public.guard_meeting_restricted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.restricted is distinct from old.restricted and not public.is_admin() then
    raise exception 'Solo Dirección puede cambiar la restricción de un acta.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists meetings_guard_restricted on public.meetings;
create trigger meetings_guard_restricted
  before update on public.meetings
  for each row execute function public.guard_meeting_restricted();
