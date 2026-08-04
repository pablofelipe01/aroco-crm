-- ============================================================================
--  AROCO · 0049 — Acceso al acta persona por persona
--
--  0044 dejó la restricción en todo-o-nada: el acta restringida la veían todos
--  sus invitados. Ahora quien la administra elige de esa lista quién sí y
--  quién no — el caso de "restringírsela solo a Hugo".
--
--  Modelo de lista blanca: con el acta restringida, solo entra quien tenga
--  `can_view`. Es la opción segura — quien no esté marcado, no entra — frente
--  a una lista de excluidos, donde olvidar a alguien lo deja dentro.
--
--  Quién administra: un SuperAdmin que haya asistido a ESA reunión, más el
--  Gerente General siempre. Sin la segunda parte, un acta a la que no asistió
--  ningún SuperAdmin quedaría sin nadie que pudiera administrarla.
-- ============================================================================

alter table public.meeting_attendees
  add column if not exists can_view boolean not null default true;

comment on column public.meeting_attendees.can_view is
  'Con el acta restringida, solo la ven los invitados con can_view. Se puede '
  'quitar a alguien sin borrarlo de la lista de asistentes, que es un hecho.';

-- ── El Gerente General ──────────────────────────────────────────────────────
-- Se identifica por la raíz del organigrama en vez de por su correo: si mañana
-- cambia la persona, esto la sigue sin tocar código.
create or replace function public.is_org_root()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.team_members tm
    where tm.profile_id = auth.uid()
      and tm.manager_id is null
      and tm.active
  );
$$;

-- ── ¿Puede este usuario administrar el acceso de esta acta? ─────────────────
create or replace function public.can_manage_meeting(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    and (public.is_org_root() or public.is_meeting_attendee(p_meeting));
$$;

-- ── ¿Puede verla? ───────────────────────────────────────────────────────────
-- `is_meeting_attendee` sigue significando "asistió" — es un hecho de la
-- reunión y decide quién puede administrarla. Ver es otra cosa: es un permiso.
create or replace function public.is_meeting_viewer(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.meeting_attendees a
    where a.meeting_id = p_meeting
      and a.can_view
      and (
        a.profile_id = auth.uid()
        or lower(a.email) = lower((select p.email from public.profiles p where p.id = auth.uid()))
      )
  );
$$;

revoke execute on function public.is_org_root() from anon;
revoke execute on function public.can_manage_meeting(uuid) from anon;
revoke execute on function public.is_meeting_viewer(uuid) from anon;
grant execute on function public.is_org_root() to authenticated;
grant execute on function public.can_manage_meeting(uuid) to authenticated;
grant execute on function public.is_meeting_viewer(uuid) to authenticated;

-- ── Lectura del acta ────────────────────────────────────────────────────────
drop policy if exists "meetings_select" on public.meetings;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (
    public.is_active_member()
    and (
      not restricted
      or public.can_manage_meeting(id)
      or created_by = auth.uid()
      or public.is_meeting_viewer(id)
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
      and not public.can_manage_meeting(m.id)
      and m.created_by is distinct from auth.uid()
      and not public.is_meeting_viewer(m.id)
  );
$$;

revoke execute on function public.can_read_acta_file(text) from anon;
grant execute on function public.can_read_acta_file(text) to authenticated;

-- ── Quién cambia el interruptor ─────────────────────────────────────────────
-- Antes bastaba con ser SuperAdmin; ahora hay que poder administrar ESA acta.
create or replace function public.guard_meeting_restricted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.restricted is distinct from old.restricted
     and auth.uid() is not null
     and not public.can_manage_meeting(new.id) then
    raise exception 'Solo quien administra esta acta puede cambiar su restricción.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ── Quién toca la lista de acceso ───────────────────────────────────────────
-- La inserción queda abierta a cualquier miembro activo: al subir un acta se
-- registran sus asistentes, y quien la sube no tiene por qué administrarla.
-- Cambiar o quitar el acceso de alguien sí exige administrarla.
drop policy if exists "meeting_attendees_write" on public.meeting_attendees;

create policy "meeting_attendees_insert" on public.meeting_attendees
  for insert to authenticated
  with check (public.is_active_member());

create policy "meeting_attendees_update" on public.meeting_attendees
  for update to authenticated
  using (public.can_manage_meeting(meeting_id))
  with check (public.can_manage_meeting(meeting_id));

create policy "meeting_attendees_delete" on public.meeting_attendees
  for delete to authenticated
  using (public.can_manage_meeting(meeting_id));
