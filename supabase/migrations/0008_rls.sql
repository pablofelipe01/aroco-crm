-- ============================================================================
--  AROCO · 0008 — Row Level Security
--
--  Model (SPEC §7):
--   • RLS on every table; nothing is reachable without an explicit policy.
--   • Any active member (authenticated + provisioned profile) can READ
--     operational data — the platform is transparent across departments.
--   • WRITES are gated by department via can_write(); admins (Dirección) write
--     everywhere. The anon role gets no access at all (policies target
--     `authenticated`).
--
--  RLS helpers are SECURITY DEFINER so their inner SELECT on `profiles` runs
--  as the function owner and bypasses RLS — avoiding recursive policy
--  evaluation. They are defined here (not 0002) because `language sql`
--  validates their body against `profiles`, which must already exist.
-- ============================================================================

-- ── RLS helper functions ─────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and active
  );
$$;

create or replace function public.is_active_member()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  );
$$;

create or replace function public.can_write(depts public.department[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active
      and (p.role = 'admin' or p.department = any(depts))
  );
$$;

-- ── profiles ────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;

create policy "profiles_select_all" on public.profiles
  for select to authenticated
  using (public.is_active_member());

-- A user can update their own profile (name); admins manage everyone.
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy "profiles_admin_all" on public.profiles
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── team_members (catalog) — read: members · write: admin ────────────────────
alter table public.team_members enable row level security;

create policy "team_members_select" on public.team_members
  for select to authenticated
  using (public.is_active_member());

create policy "team_members_admin_write" on public.team_members
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ── leads · lead_activities — write: Comercial / Administrativo ───────────────
alter table public.leads enable row level security;

create policy "leads_select" on public.leads
  for select to authenticated
  using (public.is_active_member());

create policy "leads_write" on public.leads
  for all to authenticated
  using (public.can_write(array['Comercial','Administrativo']::public.department[]))
  with check (public.can_write(array['Comercial','Administrativo']::public.department[]));

alter table public.lead_activities enable row level security;

create policy "lead_activities_select" on public.lead_activities
  for select to authenticated
  using (public.is_active_member());

create policy "lead_activities_write" on public.lead_activities
  for all to authenticated
  using (public.can_write(array['Comercial','Administrativo']::public.department[]))
  with check (public.can_write(array['Comercial','Administrativo']::public.department[]));

-- ── quotes — write: Comercial / Financiero ───────────────────────────────────
alter table public.quotes enable row level security;

create policy "quotes_select" on public.quotes
  for select to authenticated
  using (public.is_active_member());

create policy "quotes_write" on public.quotes
  for all to authenticated
  using (public.can_write(array['Comercial','Financiero']::public.department[]))
  with check (public.can_write(array['Comercial','Financiero']::public.department[]));

-- ── inventory_lots · inventory_movements — write: Bodega / Administrativo ─────
alter table public.inventory_lots enable row level security;

create policy "inventory_lots_select" on public.inventory_lots
  for select to authenticated
  using (public.is_active_member());

create policy "inventory_lots_write" on public.inventory_lots
  for all to authenticated
  using (public.can_write(array['Bodega Central','Administrativo']::public.department[]))
  with check (public.can_write(array['Bodega Central','Administrativo']::public.department[]));

alter table public.inventory_movements enable row level security;

create policy "inventory_movements_select" on public.inventory_movements
  for select to authenticated
  using (public.is_active_member());

create policy "inventory_movements_write" on public.inventory_movements
  for all to authenticated
  using (public.can_write(array['Bodega Central','Administrativo']::public.department[]))
  with check (public.can_write(array['Bodega Central','Administrativo']::public.department[]));

-- ── dispatches — write: Bodega / Comercial ───────────────────────────────────
alter table public.dispatches enable row level security;

create policy "dispatches_select" on public.dispatches
  for select to authenticated
  using (public.is_active_member());

create policy "dispatches_write" on public.dispatches
  for all to authenticated
  using (public.can_write(array['Bodega Central','Comercial']::public.department[]))
  with check (public.can_write(array['Bodega Central','Comercial']::public.department[]));

-- ── price_history · commission_rules — write: Financiero ─────────────────────
alter table public.price_history enable row level security;

create policy "price_history_select" on public.price_history
  for select to authenticated
  using (public.is_active_member());

create policy "price_history_write" on public.price_history
  for all to authenticated
  using (public.can_write(array['Financiero']::public.department[]))
  with check (public.can_write(array['Financiero']::public.department[]));

alter table public.commission_rules enable row level security;

create policy "commission_rules_select" on public.commission_rules
  for select to authenticated
  using (public.is_active_member());

create policy "commission_rules_write" on public.commission_rules
  for all to authenticated
  using (public.can_write(array['Financiero']::public.department[]))
  with check (public.can_write(array['Financiero']::public.department[]));

-- ── commission_calcs — write: Financiero / Comercial ─────────────────────────
alter table public.commission_calcs enable row level security;

create policy "commission_calcs_select" on public.commission_calcs
  for select to authenticated
  using (public.is_active_member());

create policy "commission_calcs_write" on public.commission_calcs
  for all to authenticated
  using (public.can_write(array['Financiero','Comercial']::public.department[]))
  with check (public.can_write(array['Financiero','Comercial']::public.department[]));

-- ── tasks — any active member manages tasks ──────────────────────────────────
alter table public.tasks enable row level security;

create policy "tasks_select" on public.tasks
  for select to authenticated
  using (public.is_active_member());

create policy "tasks_write" on public.tasks
  for all to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());
