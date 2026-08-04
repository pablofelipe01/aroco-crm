-- ============================================================================
--  AROCO · 0048 — Jerarquía del organigrama y visibilidad de tareas
--
--  Hasta ahora la RLS de `tasks` dejaba que cualquier miembro activo leyera
--  TODAS las tareas — el error que reportó Nicolás en el dashboard. El recorte
--  vivía provisionalmente en la aplicación (src/lib/ai/context.ts), que solo
--  sabía filtrar por departamento.
--
--  Con el organigrama en la mano el criterio pasa a ser la rama: cada jefe ve
--  lo que cuelga de él, aunque sus reportes estén en áreas distintas — Nicolás
--  ve a David, John Jairo y Max; Ángela ve a Juan Carlos y su equipo.
--
--  El árbol vive en `team_members` (no en `profiles`) porque hay personas del
--  organigrama que reciben tareas sin tener cuenta en el CRM.
-- ============================================================================

-- ── El árbol ────────────────────────────────────────────────────────────────
alter table public.team_members
  add column if not exists manager_id uuid references public.team_members (id)
    on delete set null;

create index if not exists team_members_manager_idx
  on public.team_members (manager_id);

comment on column public.team_members.manager_id is
  'Jefe directo según el organigrama. La raíz (Gerente General) lo tiene nulo.';

-- Un ciclo en el árbol colgaría la consulta recursiva. Se corta al escribir.
create or replace function public.guard_manager_cycle()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_cursor uuid := new.manager_id;
  v_steps  int := 0;
begin
  if new.manager_id is null then
    return new;
  end if;
  if new.manager_id = new.id then
    raise exception 'Una persona no puede ser su propio jefe.' using errcode = '23514';
  end if;
  -- Se sube por la cadena de mando: si se vuelve a pasar por la misma
  -- persona, hay ciclo.
  while v_cursor is not null and v_steps < 50 loop
    if v_cursor = new.id then
      raise exception 'La jerarquía haría un ciclo (% ya depende de esta persona).', new.name
        using errcode = '23514';
    end if;
    select manager_id into v_cursor from public.team_members where id = v_cursor;
    v_steps := v_steps + 1;
  end loop;
  return new;
end;
$$;

drop trigger if exists team_members_guard_cycle on public.team_members;
create trigger team_members_guard_cycle
  before insert or update of manager_id on public.team_members
  for each row execute function public.guard_manager_cycle();

-- ── Quién es quién ──────────────────────────────────────────────────────────
create or replace function public.is_admin_view()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.role = 'admin_view'
  );
$$;

/**
 * Ids de team_members que el usuario actual tiene a cargo, incluido él mismo.
 * STABLE para que PostgreSQL la evalúe una vez por consulta y no por fila.
 */
create or replace function public.my_team_subtree()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  with recursive raiz as (
    select id from public.team_members where profile_id = auth.uid()
  ),
  rama as (
    select id from raiz
    union
    select tm.id
    from public.team_members tm
    join rama on tm.manager_id = rama.id
  )
  select id from rama;
$$;

revoke execute on function public.is_admin_view() from anon;
revoke execute on function public.my_team_subtree() from anon;
grant execute on function public.is_admin_view() to authenticated;
grant execute on function public.my_team_subtree() to authenticated;

-- ── RLS de tareas ───────────────────────────────────────────────────────────
-- `tasks_write` era FOR ALL, y FOR ALL incluye SELECT: mientras exista, la
-- política de lectura no sirve de nada porque las permisivas se combinan con
-- OR. Es el mismo fallo que tuvieron las actas en 0044/0045.
drop policy if exists "tasks_select" on public.tasks;
drop policy if exists "tasks_write" on public.tasks;

create policy "tasks_select" on public.tasks
  for select to authenticated
  using (
    public.is_active_member()
    and (
      public.is_admin()
      or public.is_admin_view()
      -- Sin responsable no es dato privado de nadie: son los pendientes
      -- generales, y ocultarlos dejaría al equipo sin verlos.
      or not exists (
        select 1 from public.task_assignees ta where ta.task_id = tasks.id
      )
      or exists (
        select 1
        from public.task_assignees ta
        where ta.task_id = tasks.id
          and ta.team_member_id in (select public.my_team_subtree())
      )
    )
  );

-- La escritura sigue abierta a cualquier miembro activo: el equipo se reparte
-- pendientes entre áreas y restringirla rompería ese flujo. Lo que se acota
-- aquí es la lectura.
create policy "tasks_insert" on public.tasks
  for insert to authenticated
  with check (public.is_active_member());

create policy "tasks_update" on public.tasks
  for update to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

create policy "tasks_delete" on public.tasks
  for delete to authenticated
  using (public.is_active_member());
