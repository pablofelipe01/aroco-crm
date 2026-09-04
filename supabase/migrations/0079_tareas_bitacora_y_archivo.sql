-- ============================================================================
--  AROCO · 0079 — Tareas: fecha de inicio, bitácora y archivo mensual
--
--  Tres pedidos de la revisión de CRM del 1-sep-2026, los tres sobre la misma
--  pantalla:
--
--    1. Que la tarea nazca con fecha de inicio, sin que nadie la escriba.
--    2. Que se le puedan colgar varias notas fechadas, no una sola.
--    3. Que lo completado se archive mes a mes en vez de borrarse.
-- ============================================================================

-- ── 1 · Fecha de inicio automática ──────────────────────────────────────────
--
--  El default va en la BASE y no en el formulario porque las tareas entran por
--  cuatro caminos: el formulario, el asistente, la ingesta de actas y las
--  herramientas del agente. Poniéndolo en la columna, los cuatro quedan
--  cubiertos de una vez y ninguno puede olvidarse.
--
--  Ojo para quien inserte desde la aplicación: mandar `start_date: null`
--  EXPLÍCITAMENTE pisa el default. En `createTask` la clave se omite cuando
--  viene vacía, justamente por esto.
alter table public.tasks
  alter column start_date set default current_date;

comment on column public.tasks.start_date is
  'Cuándo arranca la tarea. Por defecto el día en que se creó; se puede cambiar.';

-- Las tareas viejas NO se rellenan. Ponerles hoy sería mentir sobre cuándo
-- arrancaron, y ponerles su `created_at` sería inventar una fecha que nadie
-- decidió. Se quedan sin inicio, que es la verdad.

-- ── 2 · Cuándo se completó ──────────────────────────────────────────────────
--
--  Hace falta para archivar por mes: sin esto, el único rastro sería
--  `updated_at`, que se mueve cada vez que alguien corrige una coma y haría
--  que una tarea de junio saltara al archivo de septiembre.
alter table public.tasks
  add column if not exists completed_at timestamptz;

comment on column public.tasks.completed_at is
  'Momento en que la tarea pasó a «done». Se limpia si se reabre. Lo mantiene un trigger.';

create or replace function public.task_set_completed_at()
returns trigger
language plpgsql
as $$
begin
  -- Al INSERTAR: una tarea que nace completada —la ingesta de un acta que
  -- recoge algo ya hecho— también necesita su fecha, o se quedaría fuera del
  -- archivo para siempre.
  if tg_op = 'INSERT' then
    if new.status = 'done' then
      new.completed_at = coalesce(new.completed_at, now());
    end if;
    return new;
  end if;

  -- Al ACTUALIZAR, solo en el CAMBIO de estado. Si se marcara en cada update,
  -- editar el nombre de una tarea ya completada le correría la fecha.
  if new.status is distinct from old.status then
    if new.status = 'done' then
      new.completed_at = coalesce(new.completed_at, now());
    else
      new.completed_at = null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_completed_at on public.tasks;
create trigger tasks_completed_at
  before insert or update on public.tasks
  for each row execute function public.task_set_completed_at();

-- Rescate de lo existente: para las que ya están completadas, `updated_at` es
-- la mejor aproximación que hay. Es aproximada y por eso solo se usa una vez,
-- aquí; de ahora en adelante la fecha la pone el trigger en el momento real.
update public.tasks
set completed_at = updated_at
where status = 'done' and completed_at is null;

create index if not exists tasks_completed_idx
  on public.tasks (completed_at desc)
  where status = 'done';

-- ── 3 · Bitácora ────────────────────────────────────────────────────────────
--
--  `tasks.notes` era un solo texto: la segunda nota se escribía encima de la
--  primera, o debajo con la fecha a mano. Se pasa a una tabla, igual que
--  `lead_activities` hace con los leads.
--
--  El archivo mensual (punto 3 del encabezado) NO necesita columna: una tarea
--  está archivada si está completada y su `completed_at` cayó en un mes
--  anterior al corriente. Se deriva del dato y no se guarda porque una marca
--  guardada hay que mantenerla —un cron, un proceso de fin de mes— y todo eso
--  se puede quedar quieto sin que nadie lo note. Una fecha no se queda quieta.
create table if not exists public.task_notes (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  body       text not null,
  -- Nombre congelado al escribir: si la persona se va del equipo o cambia de
  -- nombre, la nota sigue diciendo quién la escribió ese día.
  author_name text,
  -- `default auth.uid()` a propósito: el autor decide quién puede editar o
  -- borrar la nota, y una columna así no puede depender de que la aplicación
  -- se acuerde de llenarla.
  --
  -- Admite null y no por descuido: las notas que se traen de `tasks.notes`
  -- vienen de tareas creadas por la ingesta de actas, que corre sin sesión y
  -- las dejó sin autor. Una nota sin autor conocido es correcta; inventarle
  -- uno, no. Solo un admin puede corregirlas después.
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.task_notes is
  'Bitácora cronológica de una tarea. Sustituye a tasks.notes, que era un solo texto.';

create index if not exists task_notes_task_idx
  on public.task_notes (task_id, created_at desc);

-- Lo que había en `notes` pasa a ser la primera entrada de la bitácora. Se
-- fecha con la creación de la tarea y no con hoy: la nota es de entonces.
insert into public.task_notes (task_id, body, author_name, created_by, created_at)
select t.id, btrim(t.notes), null, t.created_by, t.created_at
from public.tasks t
where t.notes is not null and btrim(t.notes) <> ''
  and not exists (select 1 from public.task_notes n where n.task_id = t.id);

-- La columna se queda —vaciarla sería perder el original si algo salió mal en
-- el traspaso— pero deja de escribirse desde la aplicación.
comment on column public.tasks.notes is
  'HISTÓRICO. La bitácora vive en task_notes desde 0079; esta columna ya no se escribe.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
--  Leer y escribir: cualquier miembro activo, igual que `tasks` — quien puede
--  ver la tarea puede anotar en ella.
--
--  Corregir y borrar: solo el autor (o un admin). Una bitácora donde cualquiera
--  puede reescribir lo que otro afirmó deja de servir como constancia, que es
--  justo para lo que se pidió.
alter table public.task_notes enable row level security;

create policy "task_notes_select" on public.task_notes
  for select to authenticated
  using (public.is_active_member());

create policy "task_notes_insert" on public.task_notes
  for insert to authenticated
  with check (public.is_active_member() and created_by = auth.uid());

create policy "task_notes_update" on public.task_notes
  for update to authenticated
  using (public.is_active_member() and (created_by = auth.uid() or public.is_admin()))
  with check (public.is_active_member() and (created_by = auth.uid() or public.is_admin()));

create policy "task_notes_delete" on public.task_notes
  for delete to authenticated
  using (public.is_active_member() and (created_by = auth.uid() or public.is_admin()));
