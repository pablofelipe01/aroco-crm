-- ============================================================================
--  AROCO · 0063 — Las tablas de Mercado (fase 2 de traer CacaoQ)
--
--  CacaoQ tiene doce tablas en SQLite/Turso. Aquí entran nueve; tres NO, y esa
--  es la mitad interesante de la migración:
--
--    · `physical_inventory` ya es `inventory_lots`. CacaoQ la llena leyendo la
--      misma hoja de Google que el CRM, con las columnas emparejadas por
--      aproximación. Dos parsers sobre la misma hoja que iban a divergir.
--    · `local_sales` ya es `ventas`, con precio real por envío en vez de un
--      resumen aparte.
--    · `chat_history` la cubre el asistente del CRM, que además ya sabe de
--      inventario, tareas y actas.
--
--  Nada se convierte a enum: los valores los escribe un PDF de StoneX o un
--  scraper de Barchart, y un valor nuevo allá no puede tumbar un sync aquí.
--
--  Las claves naturales llevan índice único para que los syncs puedan hacer
--  upsert sin duplicar. El de CacaoQ inserta y confía; a la segunda corrida del
--  mismo día eso deja dos filas y el P&L se cuenta dos veces.
-- ============================================================================

-- ── Estados de cuenta de StoneX ─────────────────────────────────────────────
create table if not exists public.broker_statements (
  id              uuid primary key default gen_random_uuid(),
  filename        text not null,
  statement_date  date not null,
  account         text not null,
  -- Hash del archivo: es lo que impide procesar dos veces el mismo PDF cuando
  -- llega con otro nombre.
  file_hash       text not null unique,
  num_positions   integer,
  processed_at    timestamptz not null default now()
);

create table if not exists public.broker_positions (
  id              uuid primary key default gen_random_uuid(),
  statement_date  date not null,
  account         text not null,
  trade_date      date,
  card            text,
  long_qty        integer not null default 0,
  short_qty       integer not null default 0,
  option_type     text,               -- CALL | PUT | FUTURE
  contract_month  text,
  exchange        text default 'ICE COCOA',
  strike          numeric(12,4),
  settle_price    numeric(12,4),
  market_value    numeric(16,2),
  dr_cr           text,
  created_at      timestamptz not null default now()
);

create index if not exists broker_positions_fecha_idx
  on public.broker_positions (statement_date desc, account);

-- Una posición queda identificada por su contrato dentro de un estado de
-- cuenta. Sin esto, reprocesar el mismo PDF duplica la exposición.
create unique index if not exists broker_positions_clave
  on public.broker_positions (
    statement_date, account, coalesce(option_type, ''),
    coalesce(contract_month, ''), coalesce(strike, -1), coalesce(card, '')
  );

create table if not exists public.account_balance (
  id                          uuid primary key default gen_random_uuid(),
  statement_date              date not null,
  account                     text not null,
  beginning_balance           numeric(16,2),
  ending_balance              numeric(16,2),
  total_equity                numeric(16,2),
  long_option_value           numeric(16,2),
  short_option_value          numeric(16,2),
  net_option_value            numeric(16,2),
  net_liquidating_value       numeric(16,2),
  prior_net_liquidating_value numeric(16,2),
  market_variance             numeric(16,2),
  initial_margin              numeric(16,2),
  maintenance_margin          numeric(16,2),
  excess_equity               numeric(16,2),
  created_at                  timestamptz not null default now(),
  unique (statement_date, account)
);

create table if not exists public.broker_pnl (
  id               uuid primary key default gen_random_uuid(),
  statement_date   date not null,
  account          text not null,
  realized_pnl_mtd numeric(16,2),
  realized_pnl_ytd numeric(16,2),
  currency         text not null default 'USD',
  created_at       timestamptz not null default now(),
  unique (statement_date, account)
);

-- ── Mercado ─────────────────────────────────────────────────────────────────
create table if not exists public.market_data (
  id          uuid primary key default gen_random_uuid(),
  date        date not null,
  ticker      text not null,
  close_price numeric(12,4),
  open_price  numeric(12,4),
  high        numeric(12,4),
  low         numeric(12,4),
  volume      numeric(16,2),
  created_at  timestamptz not null default now(),
  unique (date, ticker)
);

create table if not exists public.trm_data (
  id         uuid primary key default gen_random_uuid(),
  date       date not null unique,
  trm        numeric(12,4) not null,
  created_at timestamptz not null default now()
);

-- ── Tablero de opciones ─────────────────────────────────────────────────────
create table if not exists public.options_board (
  id                uuid primary key default gen_random_uuid(),
  date              date not null,
  contract_month    text not null,
  underlying_price  numeric(12,4),
  dte               integer,
  expiration        date,
  volatility_calls  numeric(10,6),
  volatility_puts   numeric(10,6),
  interest_rate     numeric(10,6),
  created_at        timestamptz not null default now(),
  unique (date, contract_month)
);

create table if not exists public.options_chain (
  id           uuid primary key default gen_random_uuid(),
  board_id     uuid not null references public.options_board (id) on delete cascade,
  strike       numeric(12,4) not null,
  call_premium numeric(12,4),
  call_delta   numeric(10,6),
  put_premium  numeric(12,4),
  put_delta    numeric(10,6),
  created_at   timestamptz not null default now(),
  unique (board_id, strike)
);

-- ── Foto del riesgo ─────────────────────────────────────────────────────────
-- Una fila por día: sirve para ver cómo se movió la cobertura en el tiempo, que
-- es algo que el cálculo en vivo no puede contar.
create table if not exists public.risk_snapshots (
  id                      uuid primary key default gen_random_uuid(),
  date                    date not null unique,
  total_physical_tonnes   numeric(14,4),
  covered_tonnes          numeric(14,4),
  coverage_pct            numeric(8,4),
  cacao_price_usd         numeric(12,4),
  trm                     numeric(12,4),
  net_liquidating_value   numeric(16,2),
  unrealized_pnl_physical numeric(16,2),
  unrealized_pnl_hedge    numeric(16,2),
  collar_floor            numeric(12,4),
  collar_cap              numeric(12,4),
  created_at              timestamptz not null default now()
);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Todas cuelgan del mismo permiso que el módulo. Ligarlas al rol dejaría que un
-- SuperAdmin sin permiso de Mercado leyera las posiciones por la puerta de
-- atrás, que es justo lo que 0062 evita en el menú.
--
-- Nadie escribe desde el cliente: los syncs corren con service_role. Sin
-- políticas de INSERT/UPDATE/DELETE, la RLS los bloquea a todos.
do $$
declare t text;
begin
  foreach t in array array[
    'broker_statements', 'broker_positions', 'account_balance', 'broker_pnl',
    'market_data', 'trm_data', 'options_board', 'options_chain', 'risk_snapshots'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.ve_mercado())',
      t || '_select', t
    );
  end loop;
end $$;
