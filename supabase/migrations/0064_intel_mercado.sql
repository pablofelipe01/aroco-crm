-- ============================================================================
--  AROCO · 0064 — Inteligencia de mercado
--
--  StoneX publica análisis del mercado de cacao: reportes semanales de
--  inventarios certificados, notas sobre clima y cosecha, movimientos de
--  precio. Es lo que había en CacaoQ y no se había traído.
--
--  Se guardan en vez de consultarse en vivo por dos razones: la llamada al MCP
--  tarda segundos —cargar la pantalla contra el túnel la volvería lenta— y
--  StoneX solo devuelve los más recientes, así que sin guardarlos el histórico
--  se pierde.
--
--  `resumen` es una traducción corta al español hecha al sincronizar. Los
--  artículos vienen en inglés y con el cuerpo dentro de un PDF de dos páginas;
--  el equipo comercial necesita saber en dos líneas si le concierne, no leerse
--  el reporte completo. El texto original se conserva igual, para poder ir a la
--  fuente.
-- ============================================================================

create table if not exists public.market_intel (
  id            uuid primary key default gen_random_uuid(),
  -- El id que asigna StoneX. Es lo que impide guardar dos veces el mismo
  -- artículo cuando vuelve a aparecer en la lista de recientes.
  article_id    text not null unique,
  title         text not null,
  abstract      text,
  /** Resumen en español generado al sincronizar. Null = todavía sin resumir. */
  resumen       text,
  author        text,
  market_name   text,
  url           text,
  /** Texto del PDF, para poder resumir y para que el asistente lo consulte. */
  texto         text,
  published_at  timestamptz not null,
  synced_at     timestamptz not null default now()
);

create index if not exists market_intel_fecha_idx
  on public.market_intel (published_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mismo permiso que el resto de Mercado. Nadie escribe desde el cliente: solo
-- el sync, con service_role.
alter table public.market_intel enable row level security;

create policy "market_intel_select" on public.market_intel
  for select to authenticated using (public.ve_mercado());
