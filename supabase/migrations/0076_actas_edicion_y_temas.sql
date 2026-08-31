-- ============================================================================
--  AROCO · 0076 — Editar actas y agruparlas por tema
--
--  Dos cosas que pidió Álvaro:
--
--    1. Que las actas se puedan editar. Las tareas ya se editaban; el acta no.
--    2. Que las notas y las tareas se agrupen POR TEMA y no por el orden en
--       que se dijeron. Un acta de comité operativo trae 24 tareas seguidas;
--       leerlas en el orden de la conversación obliga a reconstruir de qué se
--       estaba hablando en cada salto.
-- ============================================================================


-- ── 1. Temas ────────────────────────────────────────────────────────────────
--
--  Tabla propia y no un `jsonb` en `meetings` porque las tareas apuntan al
--  tema: con una clave foránea, renombrar un tema no desconecta sus tareas.
--  Guardado como texto dentro del acta, cada edición del título las huerfanaría
--  en silencio — y el silencio es justo el problema.

create table if not exists public.meeting_temas (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references public.meetings (id) on delete cascade,
  titulo      text not null,
  -- Las notas de ESE tema, recortadas del acta. El acta completa sigue intacta
  -- en `meetings.notes`: los temas son una vista encima, no un reemplazo, y si
  -- la agrupación sale mal el original no se perdió.
  resumen     text,
  orden       int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists meeting_temas_meeting_idx
  on public.meeting_temas (meeting_id, orden);

drop trigger if exists meeting_temas_set_updated_at on public.meeting_temas;
create trigger meeting_temas_set_updated_at
  before update on public.meeting_temas
  for each row execute function public.set_updated_at();

-- La tarea sabe de qué tema salió. `on delete set null`: borrar la agrupación
-- no puede borrar las tareas, que son el trabajo real de la gente.
alter table public.tasks
  add column if not exists tema_id uuid
    references public.meeting_temas (id) on delete set null;

create index if not exists tasks_tema_idx on public.tasks (tema_id);


-- ── 2. Quién puede editar un acta ───────────────────────────────────────────
--
--  0045 ya había partido `meetings_write` en insert/update/delete, pero dejó
--  update y delete en `is_active_member()`: cualquier miembro activo puede
--  cambiar o borrar cualquier acta. Mientras la interfaz no ofreció editar,
--  eso quedó en teoría; al habilitarlo deja de serlo — cualquiera con sesión
--  podría reescribir el acta de una reunión a la que no fue, y un acta es un
--  registro.
--
--  Puede editarla quien la administra (SuperAdmin que asistió, o Gerencia) y
--  quien la creó — normalmente quien la subió a mano, que es quien nota el
--  error de dedo y debe poder corregirlo sin pedir permiso a nadie.
--
--  `meetings_insert` no cambia: subir un acta es aportar, no mandar. Se
--  recrea igual para que la migración se pueda volver a correr entera.
create or replace function public.puede_editar_acta(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.can_manage_meeting(p_meeting)
    or exists (
      select 1 from public.meetings m
      where m.id = p_meeting and m.created_by = auth.uid()
    );
$$;

revoke execute on function public.puede_editar_acta(uuid) from anon;
grant execute on function public.puede_editar_acta(uuid) to authenticated;

-- Se sueltan las tres de 0045 antes de recrearlas: `create policy` no tiene
-- `or replace`, y sin el drop la migración falla en la segunda pasada.
drop policy if exists "meetings_write" on public.meetings;
drop policy if exists "meetings_insert" on public.meetings;
drop policy if exists "meetings_update" on public.meetings;
drop policy if exists "meetings_delete" on public.meetings;

create policy "meetings_insert" on public.meetings
  for insert to authenticated
  with check (public.is_active_member());

create policy "meetings_update" on public.meetings
  for update to authenticated
  using (public.puede_editar_acta(id))
  with check (public.puede_editar_acta(id));

create policy "meetings_delete" on public.meetings
  for delete to authenticated
  using (public.puede_editar_acta(id));



-- ── 3. RLS de temas: se hereda del acta ─────────────────────────────────────
--
--  Un tema no puede ser más visible que su acta. Si la reunión está
--  restringida, sus temas también: `meetings_select` ya resuelve quién la ve,
--  así que preguntarle a ella evita duplicar —y desincronizar— la regla.

alter table public.meeting_temas enable row level security;

drop policy if exists "meeting_temas_select" on public.meeting_temas;
create policy "meeting_temas_select" on public.meeting_temas
  for select to authenticated
  using (
    exists (select 1 from public.meetings m where m.id = meeting_id)
  );

drop policy if exists "meeting_temas_write" on public.meeting_temas;
create policy "meeting_temas_write" on public.meeting_temas
  for all to authenticated
  using (public.puede_editar_acta(meeting_id))
  with check (public.puede_editar_acta(meeting_id));

comment on table public.meeting_temas is
  'Temas de un acta. Agrupan sus notas y sus tareas por asunto, no por el orden en que se hablaron.';
