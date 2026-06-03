-- ============================================================================
--  AROCO · 0013 — Notifications + reminders & price alerts (SPEC §10)
--
--  In-app notifications (no email/WhatsApp — those stay disabled per the comms
--  decision). A daily pg_cron job flags overdue lead follow-ups and tasks; a
--  trigger on price_history raises a notification when a price moves beyond a
--  threshold. dedupe_key prevents duplicates.
-- ============================================================================

create table public.notifications (
  id            uuid primary key default gen_random_uuid(),
  type          text not null,                 -- lead_followup | task_overdue | price_alert
  severity      text not null default 'info',  -- info | warn | danger
  title         text not null,
  body          text,
  related_table text,
  related_id    uuid,
  for_department public.department,            -- null = everyone
  dedupe_key    text unique,
  read          boolean not null default false,
  created_at    timestamptz not null default now()
);

create index notifications_unread_idx on public.notifications (read, created_at desc);

alter table public.notifications enable row level security;

create policy "notifications_select" on public.notifications
  for select to authenticated
  using (
    public.is_active_member()
    and (for_department is null or public.is_admin()
         or for_department = (select department from public.profiles where id = auth.uid()))
  );

-- Members may mark notifications read.
create policy "notifications_update" on public.notifications
  for update to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

-- ── Daily reminders (overdue follow-ups & tasks) ─────────────────────────────
create or replace function public.generate_daily_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications
    (type, severity, title, body, related_table, related_id, for_department, dedupe_key)
  select
    'lead_followup', 'warn',
    'Seguimiento vencido: ' || l.company,
    coalesce('Próxima acción: ' || l.next_action, 'Acción pendiente') ||
      ' (' || to_char(l.next_action_date, 'DD/MM/YYYY') || ')',
    'leads', l.id, 'Comercial',
    'lead_followup:' || l.id || ':' || current_date
  from public.leads l
  where l.next_action_date < current_date
    and l.status not in ('Cerrado', 'Descartado')
  on conflict (dedupe_key) do nothing;

  insert into public.notifications
    (type, severity, title, body, related_table, related_id, for_department, dedupe_key)
  select
    'task_overdue', 'warn',
    'Tarea vencida: ' || t.name,
    coalesce(t.person_name, 'Sin responsable') ||
      ' · vencía ' || to_char(t.due_date, 'DD/MM/YYYY'),
    'tasks', t.id, null,
    'task_overdue:' || t.id || ':' || current_date
  from public.tasks t
  where t.due_date < current_date
    and t.status <> 'done'
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke execute on function public.generate_daily_reminders() from anon, authenticated;

-- ── Price alert trigger (threshold 5% / 10%) ─────────────────────────────────
create or replace function public.notify_price_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prev numeric;
  pct  numeric;
begin
  select price_cop_kg into prev
  from public.price_history
  where company = new.company and date < new.date
  order by date desc
  limit 1;

  if prev is not null and prev <> 0 then
    pct := abs(new.price_cop_kg - prev) / prev;
    if pct >= 0.05 then
      insert into public.notifications
        (type, severity, title, body, related_table, related_id, for_department, dedupe_key)
      values (
        'price_alert',
        case when pct >= 0.10 then 'danger' else 'warn' end,
        'Alerta de precio: ' || new.company,
        format('Variación de %s%% (%s → %s COP/kg)',
               round(pct * 100, 1), round(prev), round(new.price_cop_kg)),
        'price_history', new.id, 'Financiero',
        'price_alert:' || new.id
      )
      on conflict (dedupe_key) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger price_history_alert
  after insert on public.price_history
  for each row execute function public.notify_price_change();

revoke execute on function public.notify_price_change() from anon, authenticated;
