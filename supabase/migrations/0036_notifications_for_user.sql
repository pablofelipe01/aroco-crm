-- 0036 — Campanita: filtrar por responsable + área (revisión CRM 2026-06-30)
-- Antes: las notificaciones solo se filtraban por departamento; las "tareas
-- vencidas" iban a TODOS (for_department null) y los administradores veían todo.
-- Ahora: se pueden dirigir a un usuario concreto (for_user) — el responsable del
-- lead/tarea — y cada quien ve lo suyo o los avisos de su área. Los admins
-- quedan sujetos al mismo filtro (campana más limpia).

alter table public.notifications
  add column if not exists for_user uuid references public.profiles (id) on delete cascade;

create index if not exists notifications_for_user_idx
  on public.notifications (for_user, read, created_at desc);

-- ── RLS: dirigido a mí, o difusión a mi área / global ────────────────────────
drop policy if exists "notifications_select" on public.notifications;
create policy "notifications_select" on public.notifications
  for select to authenticated
  using (
    public.is_active_member()
    and (
      for_user = (select auth.uid())
      or (
        for_user is null
        and (
          for_department is null
          or for_department = (select department from public.profiles where id = (select auth.uid()))
        )
      )
    )
  );

-- Marcar como leída: solo lo que el usuario puede ver.
drop policy if exists "notifications_update" on public.notifications;
create policy "notifications_update" on public.notifications
  for update to authenticated
  using (
    public.is_active_member()
    and (
      for_user = (select auth.uid())
      or (
        for_user is null
        and (
          for_department is null
          or for_department = (select department from public.profiles where id = (select auth.uid()))
        )
      )
    )
  )
  with check (public.is_active_member());

-- ── Generador diario: dirigir al responsable (for_user) cuando exista ────────
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
end;
$$;

revoke execute on function public.generate_daily_reminders() from anon, authenticated;

-- ── Backfill: dirige las notificaciones existentes al responsable ────────────
update public.notifications n
set for_user = tm.profile_id
from public.leads l
join public.team_members tm on tm.id = l.commercial_owner
where n.type = 'lead_followup'
  and n.related_table = 'leads'
  and n.related_id = l.id
  and n.for_user is null
  and tm.profile_id is not null;

update public.notifications n
set for_user = tm.profile_id
from public.tasks t
join public.team_members tm on tm.id = t.person_id
where n.type = 'task_overdue'
  and n.related_table = 'tasks'
  and n.related_id = t.id
  and n.for_user is null
  and tm.profile_id is not null;
