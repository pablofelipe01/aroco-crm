-- ============================================================================
--  AROCO · 0101 — La lista de asistentes se ve solo con el acta
--
--  0044 dejó `meeting_attendees` legible para cualquier miembro activo. Con
--  las actas ya por invitación (0100), eso seguía contando quién fue a qué
--  reunión. Ahora hereda de `meetings_select`, igual que los temas (0076).
--
--  Sin recursión: las funciones que `meetings_select` usa para leer asistentes
--  son security definer y no pasan por esta política.
-- ============================================================================

drop policy if exists "meeting_attendees_select" on public.meeting_attendees;

create policy "meeting_attendees_select" on public.meeting_attendees
  for select to authenticated
  using (
    exists (select 1 from public.meetings m where m.id = meeting_id)
  );
