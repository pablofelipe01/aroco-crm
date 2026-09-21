-- ============================================================================
--  AROCO · 0093 — Avisar antes de que venza una opción
--
--  En el primer collar las opciones llegaron al vencimiento sin que nadie
--  mirara la fecha y se convirtieron en futuros. La tarjeta de Mercado ya lo
--  marca a 30 días, pero solo lo ve quien entra a Mercado. Ahora llega a la
--  campana de quien tiene permiso de Mercado (`ve_mercado`).
--
--  Tres escalones, un aviso por escalón y por contrato:
--    30 días  warn    margen para rodar la posición sin prisa
--     7 días  danger
--     3 días  danger
--  Si el cron no corre un día, el escalón se avisa al siguiente: se mira en
--  qué tramo cae hoy, no si hoy es exactamente el día 30.
--
--  Solo opciones. Un futuro no se «convierte» al vencer: su riesgo es la
--  entrega, y empieza en el primer día de aviso, antes del último día de
--  negociación. Avisarlo contra `last_trade_date` sería avisar tarde.
--
--  Sale del extracto más reciente: lo anotado a mano no trae vencimiento.
--  El cuerpo dice de qué extracto es, porque si el extracto se atrasa, la
--  posición pudo haberse rodado ya.
-- ============================================================================

create or replace function public.generate_daily_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
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
  on conflict (dedupe_key) do nothing;

  -- Tareas vencidas → responsable; si no tiene responsable, difusión (for_user null).
  insert into public.notifications
    (type, severity, title, body, related_table, related_id, for_user, for_department, dedupe_key)
  select
    'task_overdue', 'warn',
    'Tarea vencida: ' || t.name,
    coalesce(t.person_name, 'Sin responsable') ||
      ' · vencía ' || to_char(t.due_date, 'DD/MM/YYYY'),
    'tasks', t.id,
    (select tm.profile_id from public.team_members tm where tm.id = t.person_id),
    null,
    'task_overdue:' || t.id || ':' || current_date
  from public.tasks t
  where t.due_date < current_date
    and t.status <> 'done'
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
