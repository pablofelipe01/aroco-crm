-- ============================================================================
--  AROCO · 0074 — Ratios de producto y precios de futuros
--
--  El ratio dice cuántas veces el precio del futuro vale un derivado: con el
--  cacao en 6.173 y la manteca europea en ratio 1,74, esa manteca se cotiza a
--  10.741. Es lo que permite ver si conviene vender grano o transformarlo, y no
--  estaba en ninguna parte del CRM.
--
--  El bloque de futuros va aparte porque responde otra pregunta: cuánto vale el
--  contrato de Nueva York, el de Londres, y el ARBITRAJE entre los dos. Ese
--  spread es información de mercado por sí misma y mezclarlo con los ratios
--  obligaría a filtrar cada vez que se quiera una de las dos cosas.
--
--  La matriz cruda sigue guardándose en `cocoa_report_tables`, que ya acepta
--  `reporte = 'ratios'` desde 0066: si el parseo resulta equivocado alguna
--  semana, se puede rehacer sin esperar al reporte siguiente.
-- ============================================================================

create table if not exists public.cocoa_ratios (
  id            uuid primary key default gen_random_uuid(),
  report_date   date not null,
  -- Liquor · Butter · Powder · Combined
  categoria     text not null,
  producto      text not null,
  incoterm      text,
  -- LDN o NY: contra qué futuro se mide el ratio.
  mercado       text,
  ratio         numeric(10,4) not null,
  ratio_anterior numeric(10,4),
  precio_usd    numeric(14,2),
  precio_gbp    numeric(14,2),
  precio_eur    numeric(14,2),
  created_at    timestamptz not null default now()
);

-- Índice y no restricción de tabla: hace falta `coalesce` porque el incoterm
-- puede ser nulo, y en SQL null nunca es igual a null — sin eso, dos filas del
-- mismo producto sin incoterm no chocarían.
create unique index if not exists cocoa_ratios_clave
  on public.cocoa_ratios (report_date, categoria, producto, coalesce(incoterm, ''));

create index if not exists cocoa_ratios_fecha_idx
  on public.cocoa_ratios (report_date desc, categoria);

create table if not exists public.cocoa_futuros (
  id             uuid primary key default gen_random_uuid(),
  report_date    date not null,
  -- NY-DEC · LDN-DEC · ARBITRAGE
  contrato       text not null,
  valor          numeric(14,2) not null,
  valor_anterior numeric(14,2),
  moneda         text not null default 'USD',
  created_at     timestamptz not null default now(),
  unique (report_date, contrato)
);

create index if not exists cocoa_futuros_fecha_idx
  on public.cocoa_futuros (report_date desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo permiso que el resto de Mercado. Solo el sync escribe, con
-- service_role: sin políticas de escritura, la RLS las bloquea todas.
alter table public.cocoa_ratios enable row level security;
alter table public.cocoa_futuros enable row level security;

drop policy if exists "cocoa_ratios_select" on public.cocoa_ratios;
create policy "cocoa_ratios_select" on public.cocoa_ratios
  for select to authenticated using (public.ve_mercado());

drop policy if exists "cocoa_futuros_select" on public.cocoa_futuros;
create policy "cocoa_futuros_select" on public.cocoa_futuros
  for select to authenticated using (public.ve_mercado());
