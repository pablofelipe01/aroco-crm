-- ============================================================================
--  AROCO · 0102 — Uso del CRM: días activos en vez de horas
--
--  Reunión del 2026-10-08: las horas no representan el uso. Nicolás trabaja
--  por la integración con Claude sin abrir el CRM y no deja latidos. Se
--  aprobó medir días de uso por semana y tareas cerradas/abiertas/vencidas
--  en 30 días.
--
--  No se cuentan inicios de sesión: la sesión dura semanas y casi nadie
--  vuelve a entrar, así que darían casi cero (ver 0097).
--
--  Cambia `dias`: antes eran días con latido; ahora también cuentan los días
--  con una acción a su nombre (tarea movida, nota, tarea, lead, gestión).
--  Se agrega `dias_30d`, los días activos de los últimos 30.
-- ============================================================================

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
           -- Día activo: abrió el CRM o hizo algo a su nombre. Lo segundo cuenta
           -- lo que se hace por la integración con Claude, que no deja latidos.
           count(distinct (t at time zone 'America/Bogota')::date) filter (where k <> 'cerradas') as dias,
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
  dias_30 as (
    select uid, count(distinct (t at time zone 'America/Bogota')::date) as dias
    from acciones
    where t >= now() - interval '30 days' and k <> 'cerradas'
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
        'dias_30d', coalesce(d30.dias, 0),
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
      left join dias_30 d30 on d30.uid = p.id
    ), '[]'::jsonb)
  ) into v_out;

  return v_out;
end;
$$;

revoke execute on function public.uso_crm(int) from anon, public;
grant execute on function public.uso_crm(int) to authenticated;
