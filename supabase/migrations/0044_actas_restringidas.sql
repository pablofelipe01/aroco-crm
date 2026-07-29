-- ============================================================================
--  AROCO · 0044 — Actas restringidas a sus invitados
--
--  Las actas de comités financieros y reuniones sensibles no deben ser
--  legibles por todo el equipo. Se agrega un interruptor por acta y una lista
--  de invitados.
--
--  Decisiones:
--    · El interruptor es MANUAL y por defecto está apagado. Nada se oculta
--      solo: esconder actas por heurística de título sería peor que no
--      restringir, porque nadie sabría que se perdió información.
--    · La lista de invitados se llena automáticamente desde el acta (el
--      notetaker manda los correos de los asistentes), así que al activar el
--      interruptor ya se sabe quién puede leerla.
--    · La lista de asistentes en sí NO es el secreto — el contenido lo es —
--      así que cualquier miembro activo puede ver quién asistió. Eso además
--      evita recursión entre las políticas de las dos tablas.
--    · Las tareas derivadas del acta siguen visibles: son trabajo asignado a
--      una persona, no el contenido de la reunión.
-- ============================================================================

alter table public.meetings
  add column if not exists restricted boolean not null default false;

comment on column public.meetings.restricted is
  'Cuando es true, solo la ven sus invitados, quien la creó y Dirección.';

create table if not exists public.meeting_attendees (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  -- Se guarda el perfil cuando el invitado tiene cuenta; si no, el correo y el
  -- nombre tal como venían en el acta, para poder resolverlo más adelante.
  profile_id uuid references public.profiles (id) on delete set null,
  email      text,
  name       text,
  created_at timestamptz not null default now(),
  constraint meeting_attendees_identifiable check (
    profile_id is not null or email is not null or name is not null
  )
);

create index if not exists meeting_attendees_meeting_idx
  on public.meeting_attendees (meeting_id);

-- Un invitado por acta, se identifique por perfil o por correo.
create unique index if not exists meeting_attendees_key
  on public.meeting_attendees (
    meeting_id,
    coalesce(lower(email), profile_id::text, lower(name))
  );

-- ── ¿El usuario actual está invitado a esta acta? ───────────────────────────
-- SECURITY DEFINER a propósito: se consulta desde la política de `meetings`, y
-- si dependiera de la RLS de `meeting_attendees` las dos se llamarían entre sí.
create or replace function public.is_meeting_attendee(p_meeting uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.meeting_attendees a
    where a.meeting_id = p_meeting
      and (
        a.profile_id = auth.uid()
        or lower(a.email) = lower((select p.email from public.profiles p where p.id = auth.uid()))
      )
  );
$$;

revoke execute on function public.is_meeting_attendee(uuid) from anon;
grant execute on function public.is_meeting_attendee(uuid) to authenticated;

-- ── RLS de meetings: el acta restringida solo la ven sus invitados ──────────
drop policy if exists "meetings_select" on public.meetings;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (
    public.is_active_member()
    and (
      not restricted
      or public.is_admin()
      or created_by = auth.uid()
      or public.is_meeting_attendee(id)
    )
  );

-- ── RLS de meeting_attendees ────────────────────────────────────────────────
alter table public.meeting_attendees enable row level security;

create policy "meeting_attendees_select" on public.meeting_attendees
  for select to authenticated
  using (public.is_active_member());

create policy "meeting_attendees_write" on public.meeting_attendees
  for all to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

-- ── El archivo del acta hereda la restricción ───────────────────────────────
-- Sin esto la restricción sería de fachada: `createSignedUrl` solo exige
-- permiso de lectura sobre el objeto, así que cualquiera con la ruta podía
-- descargar el PDF de un comité restringido.
create or replace function public.can_read_acta_file(p_path text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1
    from public.meetings m
    where m.file_path = p_path
      and m.restricted
      and not public.is_admin()
      and m.created_by is distinct from auth.uid()
      and not public.is_meeting_attendee(m.id)
  );
$$;

revoke execute on function public.can_read_acta_file(text) from anon;
grant execute on function public.can_read_acta_file(text) to authenticated;

drop policy if exists "actas_read" on storage.objects;

create policy "actas_read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'actas'
    and public.is_active_member()
    and public.can_read_acta_file(name)
  );
