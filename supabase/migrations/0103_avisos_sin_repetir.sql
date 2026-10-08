-- ============================================================================
--  AROCO · 0103 — Un aviso por cosa vencida, no uno por día
--
--  El cron de las 7:00 creaba cada día un aviso nuevo por cada tarea o
--  seguimiento vencido. Al 2026-10-08 había 8.908 sin leer para 212 cosas
--  vencidas de verdad (John: 2.029 por 33 leads). La campana muestra 20 y
--  «marcar leídas» limpia esos 20: nunca se vaciaba.
--
--  Ahora:
--    · Si ya hay un aviso sin leer de esa cosa para esa persona, no se crea
--      otro. Marcado leído y todavía vencido, vuelve a avisar a los 7 días.
--    · Cada corrida borra los avisos sin leer de lo que ya se resolvió.
--
--  Limpieza: se deja el aviso sin leer más reciente de cada cosa y persona,
--  y se borran los repetidos, los de cosas ya resueltas y los de seguimiento
--  sin destinatario que quedaron de antes de 0036 (último: 2026-08-04).
-- ============================================================================

create or replace function public.generate_daily_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Lo ya resuelto sale de la campana: una tarea cerrada o un seguimiento al
  -- día no deben seguir diciendo «vencido».
  delete from public.notifications n
  where not n.read
    and (
      (n.type = 'task_overdue' and not exists (
        select 1 from public.tasks t
        where t.id = n.related_id and t.status <> 'done' and t.due_date < current_date))
      or
      (n.type = 'lead_followup' and not exists (
        select 1 from public.leads l
        where l.id = n.related_id
          and l.status not in ('Cerrado', 'Descartado')
          and l.next_action_date < current_date))
    );

  -- Seguimiento de leads vencidos → dueño del lead; si no tiene, al área Comercial.
  insert into public.notifications
    (type, severity, title, body, related_table, related_id, for_user, for_department, dedupe_key)
  select
    'lead_followup', 'warn',
    'Seguimiento vencido: ' || l.company,
    coalesce('Próxima acción: ' || l.next_action, 'Acción pendiente') ||
      ' (' || to_char(l.next_action_date, 'DD/MM/YYYY') || ')',
    'leads', l.id,
    (select tm.profile_id from public.team_members tm where tm.id = l.commercial_owner),
    'Comercial',
    'lead_followup:' || l.id || ':' || current_date
  from public.leads l
  where l.next_action_date < current_date
    and l.status not in ('Cerrado', 'Descartado')
    and not exists (
      select 1 from public.notifications n
      where n.type = 'lead_followup'
        and n.related_id = l.id
        and n.for_user is not distinct from
          (select tm.profile_id from public.team_members tm where tm.id = l.commercial_owner)
        and (not n.read or n.created_at > now() - interval '7 days')
    )
  on conflict (dedupe_key) do nothing;

  -- Tareas vencidas → cada responsable con cuenta, uno por persona. Los
  -- responsables viven en task_assignees (0043); tasks.person_id es derivado y
  -- casi nunca llega lleno en las tareas de actas. Sin responsable con cuenta
  -- no hay aviso: difundirlo era lo que llenaba la campana de tareas ajenas.
  insert into public.notifications
    (type, severity, title, body, related_table, related_id, for_user, for_department, dedupe_key)
  select
    'task_overdue', 'warn',
    'Tarea vencida: ' || t.name,
    'Vencía el ' || to_char(t.due_date, 'DD/MM/YYYY'),
    'tasks', t.id,
    r.profile_id,
    null,
    'task_overdue:' || t.id || ':' || current_date || ':' || r.profile_id
  from public.tasks t
  join lateral (
    select tm.profile_id
    from public.task_assignees ta
    join public.team_members tm on tm.id = ta.team_member_id
    where ta.task_id = t.id
    union
    select tm.profile_id
    from public.team_members tm
    where tm.id = t.person_id
  ) r on r.profile_id is not null
  join public.profiles p on p.id = r.profile_id and p.active
  where t.due_date < current_date
    and t.status <> 'done'
    and not exists (
      select 1 from public.notifications n
      where n.type = 'task_overdue'
        and n.related_id = t.id
        and n.for_user = r.profile_id
        and (not n.read or n.created_at > now() - interval '7 days')
    )
  on conflict (dedupe_key) do nothing;

  -- Opciones por vencer → quien ve Mercado.
  with extracto as (
    select max(statement_date) as fecha from public.broker_positions
  ),
  opciones as (
    -- Una misma opción puede venir en varias filas (una por fecha de entrada).
    select
      bp.contract_month,
      upper(bp.option_type) as tipo,
      bp.strike,
      bp.last_trade_date,
      sum(bp.long_qty)  as comprados,
      sum(bp.short_qty) as vendidos,
      min(bp.id::text)::uuid as una_fila,
      e.fecha as fecha_extracto,
      bp.last_trade_date - current_date as dias
    from public.broker_positions bp
    join extracto e on bp.statement_date = e.fecha
    where upper(bp.option_type) in ('CALL', 'PUT')
      and bp.last_trade_date is not null
      and bp.last_trade_date >= current_date
      and bp.last_trade_date - current_date <= 30
      and (bp.long_qty > 0 or bp.short_qty > 0)
    group by bp.contract_month, upper(bp.option_type), bp.strike, bp.last_trade_date, e.fecha
  ),
  con_tramo as (
    select o.*,
      case when o.dias <= 3 then 3 when o.dias <= 7 then 7 else 30 end as tramo,
      initcap(o.tipo) || ' ' || coalesce(o.contract_month, '¿contrato?') ||
        coalesce(' ' || replace(to_char(o.strike, 'FM999,999'), ',', '.'), '') as nombre
    from opciones o
  )
  insert into public.notifications
    (type, severity, title, body, related_table, related_id, for_user, for_department, dedupe_key)
  select
    'option_expiry',
    case when c.tramo = 30 then 'warn' else 'danger' end,
    case c.dias
      when 0 then 'Vence hoy: '
      when 1 then 'Vence mañana: '
      else 'Vence en ' || c.dias || ' días: '
    end || c.nombre,
    'Último día de negociación: ' || to_char(c.last_trade_date, 'DD/MM/YYYY') || '. ' ||
      concat_ws(' y ',
        case when c.comprados > 0 then c.comprados || ' comprad' || case when c.comprados = 1 then 'a' else 'as' end end,
        case when c.vendidos > 0 then c.vendidos || ' vendid' || case when c.vendidos = 1 then 'a' else 'as' end end
      ) ||
      ' según el extracto del ' || to_char(c.fecha_extracto, 'DD/MM/YYYY') || '. ' ||
      'Si llega al vencimiento sin rodarse, se convierte en futuro.',
    'broker_positions', c.una_fila,
    p.id,
    null,
    'option_expiry:' || coalesce(c.contract_month, '') || ':' || c.tipo || ':' ||
      coalesce(c.strike::text, '') || ':' || c.last_trade_date || ':' || c.tramo || ':' || p.id
  from con_tramo c
  cross join public.profiles p
  where p.ve_mercado and p.active
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke execute on function public.generate_daily_reminders() from anon, authenticated;

-- ── Limpieza ────────────────────────────────────────────────────────────────
delete from public.notifications n
using (
  select id, row_number() over (
    partition by type, related_id, for_user order by created_at desc
  ) as rn
  from public.notifications
  where type in ('task_overdue', 'lead_followup') and not read
) d
where n.id = d.id and d.rn > 1;

delete from public.notifications
where type = 'lead_followup' and for_user is null;

select public.generate_daily_reminders();
