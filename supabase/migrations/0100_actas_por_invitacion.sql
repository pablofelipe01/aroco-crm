-- ============================================================================
--  AROCO · 0100 — Las actas se ven por invitación
--
--  Revisión del 2026-10-08: David veía actas a las que no lo invitaron (el
--  seguimiento de Rainforest). No era un caso suelto: ninguna de las 101 actas
--  estaba restringida y `meetings_select` deja ver a todos las que no lo están.
--
--  Ahora toda acta nace restringida y se restringen las que ya había. La ven:
--    · Dirección (área), todas — decidido con Pablo el 2026-10-08.
--    · Quien la administra y quien la subió, como antes.
--    · Los invitados con `can_view`, como antes.
--    · Quien tiene una tarea del acta. Sin esto, Luis veía 44 actas y tenía
--      tareas en 54: muchos invitados llegan con un solo nombre («Lucho»,
--      «Milena») y no se emparejan con su cuenta.
--  «Abrir a todo el equipo» sigue disponible para quien la administra.
-- ============================================================================

-- ── ¿Es de Dirección? ───────────────────────────────────────────────────────
create or replace function public.is_direccion()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.department = 'Dirección'
  );
$$;

-- ── ¿Tiene una tarea de esta acta? ──────────────────────────────────────────
-- Responsables en task_assignees (0043); person_id es derivado, se mira igual.
create or replace function public.tiene_tarea_en_acta(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tasks t
    join public.task_assignees ta on ta.task_id = t.id
    join public.team_members tm on tm.id = ta.team_member_id
    where t.meeting_id = p_meeting and tm.profile_id = auth.uid()
  ) or exists (
    select 1
    from public.tasks t
    join public.team_members tm on tm.id = t.person_id
    where t.meeting_id = p_meeting and tm.profile_id = auth.uid()
  );
$$;

revoke execute on function public.is_direccion() from anon;
revoke execute on function public.tiene_tarea_en_acta(uuid) from anon;
grant execute on function public.is_direccion() to authenticated;
grant execute on function public.tiene_tarea_en_acta(uuid) to authenticated;

-- ── Lectura del acta ────────────────────────────────────────────────────────
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
      or public.tiene_tarea_en_acta(id)
    )
  );

-- ── El archivo hereda el mismo criterio ─────────────────────────────────────
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
      and not public.tiene_tarea_en_acta(m.id)
  );
$$;

-- ── Restringidas por defecto ────────────────────────────────────────────────
alter table public.meetings alter column restricted set default true;

-- Sin sesión (auth.uid() null) el guard de 0049 deja pasar el cambio.
update public.meetings set restricted = true where not restricted;
