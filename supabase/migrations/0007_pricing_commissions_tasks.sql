-- ============================================================================
--  AROCO · 0007 — Price history, commissions & tasks
-- ============================================================================

-- ── price_history ──────────────────────────────────────────────────────────
create table public.price_history (
  id           uuid primary key default gen_random_uuid(),
  company      text not null,                          -- Casa Luker / Nal. Chocolate Bta / …
  date         date not null,
  price_cop_kg numeric(14,4) not null,
  created_at   timestamptz not null default now()
);

create unique index price_history_company_date_key on public.price_history (company, date);
create index price_history_date_idx on public.price_history (date);

-- ── commission_rules — matriz Mercado × Nivel ──────────────────────────────
-- The 60% / 40% splits derive in code (×0.6 venta, ×0.4 compra).
create table public.commission_rules (
  id         uuid primary key default gen_random_uuid(),
  market     public.market not null,
  level      public.commission_level not null,
  pct_full   numeric(8,5) not null,                    -- ratio (0.08 = 8%)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index commission_rules_market_level_key
  on public.commission_rules (market, level);

create trigger commission_rules_set_updated_at
  before update on public.commission_rules
  for each row execute function public.set_updated_at();

-- ── commission_calcs — registros del simulador / comisiones reales ─────────
create table public.commission_calcs (
  id              uuid primary key default gen_random_uuid(),
  quote_id        uuid references public.quotes (id) on delete set null,
  dispatch_id     uuid references public.dispatches (id) on delete set null,
  sale_total_cop  numeric(20,2) not null,
  cost_total_cop  numeric(20,2) not null,
  market          public.market not null,
  level           public.commission_level not null,
  role            public.commission_role not null,
  gross_utility   numeric(20,2),
  applied_pct     numeric(8,5),
  commission_cop  numeric(20,2),
  agent           uuid references public.team_members (id) on delete set null,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now()
);

create index commission_calcs_agent_idx on public.commission_calcs (agent);

-- ── tasks ──────────────────────────────────────────────────────────────────
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid references public.team_members (id) on delete set null,
  person_name text,
  name        text not null,
  description text,
  source      text,
  start_date  date,
  due_date    date,
  status      public.task_status not null default 'pending',
  notes       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index tasks_person_idx on public.tasks (person_id);
create index tasks_status_idx on public.tasks (status);
create index tasks_due_idx on public.tasks (due_date);

create trigger tasks_set_updated_at
  before update on public.tasks
  for each row execute function public.set_updated_at();
