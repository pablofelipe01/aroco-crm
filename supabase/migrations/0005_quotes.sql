-- ============================================================================
--  AROCO · 0005 — Quotes (cotizador por incoterm)
--
--  The cost modifiers are stored in their display unit (COP/kg) exactly as the
--  user enters them; for NACIONAL, bonif_calidad is a direct value in USD/TM.
--  Calculation lives in code (src/lib/calc) — the *_result columns persist the
--  computed snapshot for history/PDF, they are NOT generated columns.
-- ============================================================================

create table public.quotes (
  id                 uuid primary key default gen_random_uuid(),
  quote_number       text unique,
  lead_id            uuid references public.leads (id) on delete set null,
  client_name        text,
  incoterm           public.incoterm not null,
  market             public.market,
  port_origin        text,
  port_destination   text,
  validity_days      integer default 15,

  -- Inputs
  trm                numeric(14,4) not null,           -- USD/COP
  cocoa_usd_t        numeric(14,4) not null,           -- USD/T reference
  differential       numeric(8,5) not null default 0,  -- ratio (0.05 = 5%)
  purchase_price_cop_kg numeric(14,4) not null,        -- COP/kg
  volume_tm          numeric(14,4) not null default 1,

  -- Cost modifiers (display unit COP/kg, except where noted)
  transporte_bodega  numeric(14,4) not null default 0,
  seleccion          numeric(14,4) not null default 0,
  fumigacion         numeric(14,4) not null default 0,
  estibas            numeric(14,4) not null default 0,
  costales           numeric(14,4) not null default 0,
  coberturas         numeric(14,4) not null default 0,
  costos_exportacion numeric(14,4) not null default 0,

  -- NACIONAL bonifications (reduce net cost). bonif_calidad in USD/TM (direct),
  -- the rest in display unit COP/kg. See SPEC §8.1 — bonif_calidad pending.
  bonif_calidad      numeric(14,4) not null default 0,
  bonif_cadmio       numeric(14,4) not null default 0,
  bonif_trazabilidad numeric(14,4) not null default 0,
  bonif_transporte   numeric(14,4) not null default 0,

  commission_pct     numeric(8,5) not null default 0,  -- ratio
  target_utility_pct numeric(8,5) not null default 0,  -- ratio (NACIONAL only)

  -- Persisted results (snapshot)
  costo_total_usd_tm   numeric(16,4),
  utilidad_pct         numeric(8,5),
  precio_final_usd_tm  numeric(16,4),
  precio_final_cop_tm  numeric(18,2),
  total_operacion_usd  numeric(18,2),
  total_operacion_cop  numeric(20,2),

  status             public.quote_status not null default 'borrador',
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index quotes_lead_idx on public.quotes (lead_id);
create index quotes_status_idx on public.quotes (status);
create index quotes_created_idx on public.quotes (created_at desc);

create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function public.set_updated_at();
