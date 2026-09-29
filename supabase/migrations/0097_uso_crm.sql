-- ============================================================================
--  AROCO · 0097 — Uso del CRM
--
--  Un tablero para saber quién usa el CRM, cuánto tiempo a la semana y si
--  mantiene al día sus tareas. Lo ven Álvaro, Nicolás y Pablo, nadie más.
--
--  Dos cosas que el CRM no guardaba y que sin ellas el tablero mentiría:
--
--  1. TIEMPO. `auth.users.last_sign_in_at` es el último login, no el último
--     uso: la sesión dura semanas, así que alguien que entra a diario puede
--     figurar con un login de hace quince días. `uso_latidos` guarda un
--     minuto por persona cada vez que la app está visible y la persona hizo
--     algo en ese minuto (lo manda `src/components/layout/latido.tsx`). El
--     tiempo de la semana es la cuenta de esos minutos. Arranca vacío: no hay
--     de dónde reconstruir el pasado.
--
--  2. QUIÉN MUEVE LAS TAREAS. 760 de las 808 tareas las crea el cron de actas
--     sin autor, así que «alimentar el pipeline» no es crear tareas: es
--     moverlas. `tasks` no guardaba quién le cambió el estado; el trigger de
--     `tarea_eventos` lo anota desde ahora.
--
--  El permiso va por persona, como `ve_mercado` (0062): no hay rol que
--  describa a esos tres, y ser SuperAdmin no puede meter a nadie de rebote a
--  ver el tiempo de sus compañeros.
-- ============================================================================

-- ── Permiso ─────────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists ve_uso boolean not null default false;

comment on column public.profiles.ve_uso is
  'Puede ver el tablero de uso del CRM (tiempo y actividad de cada persona). Gana sobre el rol.';

create or replace function public.ve_uso()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.ve_uso
  );
$$;

revoke execute on function public.ve_uso() from anon, public;
grant execute on function public.ve_uso() to authenticated;

update public.profiles
set ve_uso = true
where email in (
  'alvaro.acosta@aroco.co',      -- Gerente General
  'nicolas.rodriguez@aroco.co',  -- Gerente Comercial
  'pablofelipe@me.com'           -- Plataforma / CRM
);

-- ── Latidos: un minuto de uso por fila ──────────────────────────────────────

create table if not exists public.uso_latidos (
  user_id  uuid not null references public.profiles (id) on delete cascade,
  minuto   timestamptz not null,
  -- Primer segmento de la ruta («tareas», «comercial»…), para saber en qué
  -- módulo se va el tiempo. Nunca la URL completa: puede llevar ids.
  modulo   text not null,
  primary key (user_id, minuto)
);

create index if not exists uso_latidos_minuto_idx on public.uso_latidos (minuto desc);

comment on table public.uso_latidos is
  'Un minuto de uso activo por persona (pestaña visible y con interacción). Lo escribe registrar_latido().';

alter table public.uso_latidos enable row level security;

-- Nadie escribe directo: solo por registrar_latido(), que fija el usuario y
-- el minuto en el servidor. Así nadie se puede sumar horas desde la consola.
drop policy if exists uso_latidos_select on public.uso_latidos;
create policy uso_latidos_select on public.uso_latidos
  for select to authenticated using (public.ve_uso());

create or replace function public.registrar_latido(p_modulo text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not public.is_active_member() then
    return;
  end if;
  insert into public.uso_latidos (user_id, minuto, modulo)
  values (
    auth.uid(),
    date_trunc('minute', now()),
    left(coalesce(nullif(regexp_replace(lower(p_modulo), '[^a-z0-9-]', '', 'g'), ''), 'otro'), 40)
  )
  on conflict (user_id, minuto) do nothing;
end;
$$;

revoke execute on function public.registrar_latido(text) from anon, public;
grant execute on function public.registrar_latido(text) to authenticated;

-- ── Quién cambia el estado de una tarea ─────────────────────────────────────

create table if not exists public.tarea_eventos (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  -- Nulo cuando lo cambia un proceso del servidor (cron, service_role).
  user_id     uuid references public.profiles (id) on delete set null,
  de          public.task_status,
  a           public.task_status not null,
  created_at  timestamptz not null default now()
);

create index if not exists tarea_eventos_user_idx on public.tarea_eventos (user_id, created_at desc);

comment on table public.tarea_eventos is
  'Cambios de estado de tareas con su autor (trigger en tasks). Base del tablero de uso.';

alter table public.tarea_eventos enable row level security;

drop policy if exists tarea_eventos_select on public.tarea_eventos;
create policy tarea_eventos_select on public.tarea_eventos
  for select to authenticated using (public.ve_uso());

create or replace function public.registrar_tarea_evento()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.tarea_eventos (task_id, user_id, de, a)
  values (new.id, auth.uid(), old.status, new.status);
  return new;
end;
$$;

drop trigger if exists tasks_registrar_evento on public.tasks;
create trigger tasks_registrar_evento
  after update of status on public.tasks
  for each row
  when (old.status is distinct from new.status)
  execute function public.registrar_tarea_evento();

-- ── El tablero ──────────────────────────────────────────────────────────────
--
-- Una sola función, security definer, que cuenta en el servidor: el tablero
-- necesita leer tareas, leads y notas de todos, y darles a esos tres lectura
-- directa sobre esas tablas sería abrir mucho más de lo que ven aquí. Las
-- semanas son de lunes a domingo, hora de Bogotá.

create or replace function public.uso_crm(p_semanas int default 8)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_semanas int := least(greatest(coalesce(p_semanas, 8), 1), 26);
  v_hoy     date := (now() at time zone 'America/Bogota')::date;
  v_desde   date := date_trunc('week', v_hoy)::date - (v_semanas - 1) * 7;
  v_ini     timestamptz := v_desde::timestamp at time zone 'America/Bogota';
  v_out     jsonb;
begin
  if not public.ve_uso() then
    raise exception 'Sin permiso para ver el uso del CRM' using errcode = '42501';
  end if;

  with
  personas as (
    select p.id, p.full_name, p.department::text as area, p.role::text as rol,
           u.last_sign_in_at,
           (select tm.id from public.team_members tm
             where tm.profile_id = p.id order by tm.active desc limit 1) as miembro
    from public.profiles p
    left join auth.users u on u.id = p.id
    where p.active
  ),
  -- Cada acción cuenta en la semana (de Bogotá) en que ocurrió.
  acciones as (
    select user_id as uid, 'minutos' as k, minuto as t from public.uso_latidos where minuto >= v_ini
    union all select user_id, 'movidas', created_at from public.tarea_eventos where created_at >= v_ini and user_id is not null
    union all select user_id, 'cerradas', created_at from public.tarea_eventos where created_at >= v_ini and user_id is not null and a = 'done'
    union all select created_by, 'notas', created_at from public.task_notes where created_at >= v_ini and created_by is not null
    union all select created_by, 'creadas', created_at from public.tasks where created_at >= v_ini and created_by is not null
    union all select created_by, 'leads', created_at from public.leads where created_at >= v_ini and created_by is not null
    union all select created_by, 'gestiones', created_at from public.lead_activities where created_at >= v_ini and created_by is not null
  ),
  por_semana as (
    select uid,
           date_trunc('week', (t at time zone 'America/Bogota'))::date as semana,
           count(*) filter (where k = 'minutos')   as minutos,
           count(distinct (t at time zone 'America/Bogota')::date) filter (where k = 'minutos') as dias,
           count(*) filter (where k = 'movidas')   as movidas,
           count(*) filter (where k = 'cerradas')  as cerradas,
           count(*) filter (where k = 'notas')     as notas,
           count(*) filter (where k = 'creadas')   as creadas,
           count(*) filter (where k = 'leads')     as leads,
           count(*) filter (where k = 'gestiones') as gestiones
    from acciones
    group by 1, 2
  ),
  -- Foto de hoy de las tareas asignadas (misma definición que los resúmenes
  -- por correo: task_assignees, sin las fusionadas).
  tareas as (
    select a.team_member_id as miembro,
           count(*) filter (where t.status <> 'done') as abiertas,
           count(*) filter (where t.status <> 'done' and t.due_date < v_hoy) as vencidas,
           count(*) filter (where t.status <> 'done' and t.due_date is null) as sin_fecha,
           count(*) filter (where t.status = 'done' and t.completed_at >= now() - interval '30 days') as cerradas_30d,
           max(t.updated_at) filter (where t.status <> 'done') as ultima_actualizacion
    from public.task_assignees a
    join public.tasks t on t.id = a.task_id and t.unida_a is null
    group by 1
  ),
  ultimo as (
    select user_id, max(minuto) as visto from public.uso_latidos group by 1
  ),
  modulos as (
    select user_id, modulo, count(*) as minutos
    from public.uso_latidos
    where minuto >= now() - interval '28 days'
    group by 1, 2
  )
  select jsonb_build_object(
    'desde', v_desde,
    'hoy', v_hoy,
    'medicion_desde', (select min(minuto) from public.uso_latidos),
    'eventos_desde', (select min(created_at) from public.tarea_eventos),
    'personas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'nombre', p.full_name,
        'area', p.area,
        'rol', p.rol,
        'ultimo_login', p.last_sign_in_at,
        'ultimo_uso', ul.visto,
        'abiertas', coalesce(tr.abiertas, 0),
        'vencidas', coalesce(tr.vencidas, 0),
        'sin_fecha', coalesce(tr.sin_fecha, 0),
        'cerradas_30d', coalesce(tr.cerradas_30d, 0),
        'tiene_tareas', p.miembro is not null,
        'semanas', coalesce((
          select jsonb_agg(jsonb_build_object(
            'semana', s.semana, 'minutos', s.minutos, 'dias', s.dias,
            'movidas', s.movidas, 'cerradas', s.cerradas, 'notas', s.notas,
            'creadas', s.creadas, 'leads', s.leads, 'gestiones', s.gestiones
          ) order by s.semana)
          from por_semana s where s.uid = p.id
        ), '[]'::jsonb),
        'modulos', coalesce((
          select jsonb_agg(jsonb_build_object('modulo', m.modulo, 'minutos', m.minutos)
                           order by m.minutos desc)
          from modulos m where m.user_id = p.id
        ), '[]'::jsonb)
      ) order by p.full_name)
      from personas p
      left join tareas tr on tr.miembro = p.miembro
      left join ultimo ul on ul.user_id = p.id
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.uso_crm(int) from anon, public;
grant execute on function public.uso_crm(int) to authenticated;
