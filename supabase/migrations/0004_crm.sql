-- ============================================================================
--  AROCO · 0004 — CRM (leads & activity timeline)
-- ============================================================================

create table public.leads (
  id                uuid primary key default gen_random_uuid(),
  company           text not null,
  contact_name      text,
  country           text,
  city              text,
  market            public.market,
  type              public.lead_type,
  status            public.lead_status not null default 'Nuevo',
  product_interest  text,
  volume            text,                              -- free text (e.g. "5 TM/mes")
  next_action       text,
  next_action_date  date,
  commercial_owner  uuid references public.team_members (id) on delete set null,
  notes             text,
  source            text,
  created_by        uuid references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index leads_status_idx on public.leads (status);
create index leads_market_idx on public.leads (market);
create index leads_owner_idx on public.leads (commercial_owner);
create index leads_company_trgm on public.leads using gin (company gin_trgm_ops);
create index leads_next_action_date_idx on public.leads (next_action_date);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ── lead_activities — timeline / bitácora ──────────────────────────────────
create table public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  type        public.activity_type not null default 'Nota',
  description text not null,
  user_name   text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);
