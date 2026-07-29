-- ============================================================================
--  AROCO · 0043 — Una tarea, varios responsables
--
--  `tasks` solo admitía un responsable (`person_id`), pero en la operación real
--  un mismo compromiso suele quedar en manos de dos o tres personas, y las
--  actas los mencionan juntos. Se agrega una tabla puente.
--
--  Fuente de la verdad: `task_assignees`.
--  `tasks.person_id` / `person_name` quedan como campos DERIVADOS — el primer
--  responsable — para no romper las vistas que muestran un solo nombre
--  (kanban, dashboard, filtros). Un trigger los mantiene sincronizados, así
--  que nadie debe escribirlos a mano.
-- ============================================================================

create table if not exists public.task_assignees (
  task_id        uuid not null references public.tasks (id) on delete cascade,
  team_member_id uuid not null references public.team_members (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (task_id, team_member_id)
);

create index if not exists task_assignees_member_idx
  on public.task_assignees (team_member_id);

comment on table public.task_assignees is
  'Responsables de una tarea. Fuente de la verdad; tasks.person_id es derivado.';

-- ── Rescate de lo existente ─────────────────────────────────────────────────
insert into public.task_assignees (task_id, team_member_id)
select t.id, t.person_id
from public.tasks t
where t.person_id is not null
on conflict do nothing;

-- ── Sincronía del responsable principal ─────────────────────────────────────
-- El "principal" es el primero asignado. Al quitar a todos, la tarea queda sin
-- responsable pero conserva `person_name` si venía de un acta con un nombre que
-- no está en el equipo.
create or replace function public.task_sync_primary_assignee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_task uuid := coalesce(new.task_id, old.task_id);
  v_id   uuid;
  v_name text;
begin
  select ta.team_member_id, tm.name
    into v_id, v_name
  from public.task_assignees ta
  join public.team_members tm on tm.id = ta.team_member_id
  where ta.task_id = v_task
  order by ta.created_at, ta.team_member_id
  limit 1;

  update public.tasks
  set person_id   = v_id,
      person_name = coalesce(v_name, case when v_id is null then person_name end)
  where id = v_task;

  return null;
end;
$$;

drop trigger if exists task_assignees_sync on public.task_assignees;
create trigger task_assignees_sync
  after insert or delete on public.task_assignees
  for each row execute function public.task_sync_primary_assignee();

-- ── RLS: igual que `tasks` ──────────────────────────────────────────────────
-- Quien puede leer/gestionar tareas puede leer/gestionar sus responsables. El
-- recorte por jerarquía sigue viviendo en la aplicación hasta que se defina la
-- estructura definitiva (ver src/lib/ai/context.ts).
alter table public.task_assignees enable row level security;

create policy "task_assignees_select" on public.task_assignees
  for select to authenticated
  using (public.is_active_member());

create policy "task_assignees_write" on public.task_assignees
  for all to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());
