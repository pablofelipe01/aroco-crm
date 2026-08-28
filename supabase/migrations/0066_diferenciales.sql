-- ============================================================================
--  AROCO · 0066 — Diferenciales por origen
--
--  El diferencial es la prima o el descuento que paga un comprador por el cacao
--  de un origen sobre el futuro de ICE. Es lo que convierte «el cacao está a
--  6.600» en «mi cacao vale 6.600 más X», y hoy no está en ninguna parte del
--  CRM.
--
--  Se guardan dos cosas y no una:
--
--    · `cocoa_report_tables` — la matriz cruda del PDF, tal como la entrega el
--      agente. El PDF no tiene líneas de grilla y su forma cambia entre
--      semanas; guardando el crudo, si el parseo resulta equivocado se puede
--      volver a leer sin tener que esperar al reporte siguiente.
--    · `cocoa_differentials` — las filas ya interpretadas, que son las que
--      consultan la pantalla y el asistente.
--
--  Colombia no aparece en el reporte de StoneX: se estima. Por eso la columna
--  `fuente`. Una fila estimada por nosotros y una cotización de mercado no
--  pueden verse iguales — alguien la citaría en una negociación como si fuera
--  precio, y `metodo` es lo que permite mostrar de dónde salió.
-- ============================================================================

create table if not exists public.cocoa_report_tables (
  id            uuid primary key default gen_random_uuid(),
  -- 'differentials' | 'ratios'
  reporte       text not null,
  report_date   date not null,
  pdf_url       text,
  matriz        jsonb not null,
  synced_at     timestamptz not null default now(),
  unique (reporte, report_date)
);

create table if not exists public.cocoa_differentials (
  id           uuid primary key default gen_random_uuid(),
  report_date  date not null,
  origen       text not null,
  grado        text,
  valor        numeric(12,2) not null,
  unidad       text not null default 'USD/t',
  -- 'stonex' = viene del reporte · 'aroco' = estimación nuestra
  fuente       text not null default 'stonex',
  /** Cómo se obtuvo, cuando no es una cotización. */
  metodo       text,
  created_at   timestamptz not null default now()
);

-- La clave va como ÍNDICE y no como `unique (...)` de tabla: una restricción de
-- tabla no admite expresiones, y aquí hace falta `coalesce` porque un grado
-- nulo tiene que contar como valor. Sin eso, dos filas del mismo origen sin
-- grado no chocarían —en SQL null nunca es igual a null— y el mismo origen
-- entraría dos veces.
create unique index if not exists cocoa_differentials_clave
  on public.cocoa_differentials (report_date, origen, coalesce(grado, ''), fuente);

create index if not exists cocoa_differentials_fecha_idx
  on public.cocoa_differentials (report_date desc, origen);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo permiso que el resto de Mercado. Solo el sync escribe, con
-- service_role: sin políticas de escritura, la RLS las bloquea todas.
alter table public.cocoa_report_tables enable row level security;
alter table public.cocoa_differentials enable row level security;

create policy "cocoa_report_tables_select" on public.cocoa_report_tables
  for select to authenticated using (public.ve_mercado());

create policy "cocoa_differentials_select" on public.cocoa_differentials
  for select to authenticated using (public.ve_mercado());

-- ── La posición de Colombia dentro del tramo ────────────────────────────────
-- Es un juicio de mercado, no una constante técnica: cuando Comercial lo mueva
-- de 77,5 % a otro valor, tiene que poder hacerlo sin tocar código ni esperar
-- un despliegue.
create table if not exists public.ajustes_mercado (
  clave       text primary key,
  valor       numeric not null,
  descripcion text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null
);

alter table public.ajustes_mercado enable row level security;

create policy "ajustes_mercado_select" on public.ajustes_mercado
  for select to authenticated using (public.ve_mercado());

-- Solo quien ve Mercado puede moverlo, y queda registrado quién fue.
create policy "ajustes_mercado_update" on public.ajustes_mercado
  for update to authenticated
  using (public.ve_mercado()) with check (public.ve_mercado());

insert into public.ajustes_mercado (clave, valor, descripcion)
values (
  'posicion_colombia',
  0.775,
  'Dónde cae Colombia dentro del tramo Perú–Ecuador: 0 = sobre el más barato, 1 = sobre el más caro. 0,775 es el centro del 75-80 % acordado con Comercial.'
)
on conflict (clave) do nothing;
