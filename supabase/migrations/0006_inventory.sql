-- ============================================================================
--  AROCO · 0006 — Inventory (lots, movements ledger, dispatches)
--
--  qty_available_kg is maintained by a trigger on inventory_movements
--  (added in Phase 5, §10). For now it is seeded directly from the snapshot.
-- ============================================================================

create table public.inventory_lots (
  id                          uuid primary key default gen_random_uuid(),
  code                        text not null,           -- procedencia/destino code
  entry_date                  date,
  remision                    text,
  origin                      text,
  quality                     text,                    -- Premium / Premium Exp / CTE / Orgánico…
  qty_in_kg                   numeric(14,3) not null default 0,
  qty_out_kg                  numeric(14,3) not null default 0,
  qty_available_kg            numeric(14,3) not null default 0,
  samples_pasilla_merma_kg    numeric(14,3) not null default 0,
  purchase_price_cop_kg       numeric(14,4),
  needs_review                boolean not null default false,  -- snapshot to verify
  notes                       text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create unique index inventory_lots_code_remision_key
  on public.inventory_lots (code, coalesce(remision, ''));
create index inventory_lots_origin_idx on public.inventory_lots (origin);

create trigger inventory_lots_set_updated_at
  before update on public.inventory_lots
  for each row execute function public.set_updated_at();

-- ── inventory_movements — ledger ───────────────────────────────────────────
create table public.inventory_movements (
  id          uuid primary key default gen_random_uuid(),
  lot_id      uuid not null references public.inventory_lots (id) on delete cascade,
  date        date not null default current_date,
  kind        public.movement_kind not null,
  remision    text,
  company     text,
  qty_kg      numeric(14,3) not null,
  notes       text,
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index inventory_movements_lot_idx on public.inventory_movements (lot_id, date);

-- ── dispatches — salidas a clientes ────────────────────────────────────────
create table public.dispatches (
  id                    uuid primary key default gen_random_uuid(),
  remision_salida       text,
  dispatch_date         date not null default current_date,
  destination           text,
  oc                    text,                          -- orden de compra
  remision_entrada      text,
  lot_id                uuid references public.inventory_lots (id) on delete set null,
  lead_id               uuid references public.leads (id) on delete set null,
  origin                text,
  qty_kg                numeric(14,3) not null,
  total_salida_kg       numeric(14,3),
  purchase_price_cop_kg numeric(14,4),
  needs_review          boolean not null default false,
  created_by            uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- A single remisión de salida groups several procedencias, so it is NOT unique.
create index dispatches_remision_salida_idx on public.dispatches (remision_salida);
create index dispatches_lot_idx on public.dispatches (lot_id);
create index dispatches_lead_idx on public.dispatches (lead_id);

create trigger dispatches_set_updated_at
  before update on public.dispatches
  for each row execute function public.set_updated_at();
