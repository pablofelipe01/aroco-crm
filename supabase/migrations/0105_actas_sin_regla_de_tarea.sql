-- ============================================================================
--  AROCO · 0105 — Tener una tarea ya no abre el acta
--
--  Revisión del 2026-10-13 (Nicolás, con la cuenta de John Muñoz): John leía
--  «Revisión MEGA y Palancas», «Seguimiento Rain Forest» y la revisión del
--  capital de exportación sin haber sido invitado. Bastaba con que Dirección
--  le dejara una tarea para que viera la reunión entera. Esa regla la puso
--  0100 a propósito; abría a 10 personas entre 2 y 16 actas cada una.
--
--  Se quita de la lectura del acta y de su archivo. Las tareas no dependen del
--  acta (`tasks_select` mira el responsable), así que «Próximas tareas» sigue
--  igual. El invitado que llega con un solo nombre («Lucho») se arregla
--  emparejándolo con su cuenta, no abriendo el acta.
--
--  Asistentes y temas heredan de `meetings` (0101), así que también se cierran.
-- ============================================================================

drop policy if exists "meetings_select" on public.meetings;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (
    public.is_active_member()
    and (
      not restricted
      or public.is_direccion()
      or public.can_manage_meeting(id)
      or created_by = auth.uid()
      or public.is_meeting_viewer(id)
    )
  );

create or replace function public.can_read_acta_file(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.meetings m
    where m.file_path = p_path
      and m.restricted
      and not public.is_direccion()
      and not public.can_manage_meeting(m.id)
      and m.created_by is distinct from auth.uid()
      and not public.is_meeting_viewer(m.id)
  );
$$;

-- Ya nadie la usa.
drop function if exists public.tiene_tarea_en_acta(uuid);
