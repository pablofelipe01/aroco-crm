-- ============================================================================
--  AROCO · 0020 — Monthly tonnage per commercial (commission tracking)
--
--  Admin-curated record of tons moved by each commercial per month and market,
--  to track progress against the monthly targets (48 T Nacional / 50 T
--  Internacional). The commission itself keeps the existing utility×% simulator;
--  this is a monitoring board only.
-- ============================================================================

create table public.monthly_tonnage (
  id          uuid primary key default gen_random_uuid(),
  agent       uuid not null references public.team_members (id) on delete cascade,
  period      date not null,                                  -- first day of month
  market      public.market not null,
  role        public.commission_role not null default 'Compra+Venta',
  tons        numeric(12,3) not null default 0,
  note        text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index monthly_tonnage_agent_period_market_key
  on public.monthly_tonnage (agent, period, market);
create index monthly_tonnage_period_idx on public.monthly_tonnage (period);

create trigger monthly_tonnage_set_updated_at
  before update on public.monthly_tonnage
  for each row execute function public.set_updated_at();

alter table public.monthly_tonnage enable row level security;

-- Active members can read; only Financiero (and admins) write.
create policy "monthly_tonnage_select" on public.monthly_tonnage
  for select using (public.is_active_member());
create policy "monthly_tonnage_write" on public.monthly_tonnage
  for all
  using (public.can_write(array['Financiero']::public.department[]))
  with check (public.can_write(array['Financiero']::public.department[]));
