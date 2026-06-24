-- ============================================================================
--  AROCO · 0033 — Fase 4: Liquidación / Pago (Pago General)
--
--  Una liquidación por recepción cerrada: confronta la calidad recibida contra
--  los umbrales del contrato y calcula valor base, sanciones y bonificaciones.
--  Estados: "Por revisión" (editable) → "Aprobada" (inmodificable).
--  ⚠️ La fórmula de calidad es PROVISIONAL y parametrizable (ver
--  src/lib/calc/liquidacion.ts); los parámetros se guardan en `params`.
-- ============================================================================

do $$ begin
  create type public.liquidacion_estado as enum ('Por revisión', 'Aprobada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.liquidacion_pago as enum ('general', 'roc');
exception when duplicate_object then null; end $$;

create table if not exists public.liquidaciones (
  id uuid primary key default gen_random_uuid(),
  recepcion_id uuid not null unique references public.recepciones (id) on delete cascade,
  orden_id uuid not null references public.ordenes_compra (id) on delete cascade,
  estado public.liquidacion_estado not null default 'Por revisión',
  tipo_pago public.liquidacion_pago not null default 'general',
  -- Entradas (snapshot al crear; editables mientras esté "Por revisión").
  peso_recibido_kg numeric(12, 2),
  precio_kg numeric(12, 2),
  humedad_pct numeric(5, 2),
  fermentacion_pct numeric(5, 2),
  impurezas_pct numeric(5, 2),
  params jsonb not null default '{}'::jsonb,
  -- Resultados calculados.
  valor_base numeric(16, 2) not null default 0,
  total_sanciones numeric(16, 2) not null default 0,
  total_bonificaciones numeric(16, 2) not null default 0,
  valor_total numeric(16, 2) not null default 0,
  desglose jsonb,
  observaciones text,
  aprobada_por uuid references public.profiles (id) on delete set null,
  aprobada_en timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists liquidaciones_estado_idx on public.liquidaciones (estado, created_at desc);

alter table public.liquidaciones enable row level security;

-- Lectura: miembros activos. Escritura: Administrativo y Dirección (Coordinadora
-- de Compras / Gerencia Administrativa).
drop policy if exists liquidaciones_read on public.liquidaciones;
create policy liquidaciones_read on public.liquidaciones
  for select using (public.is_active_member());
drop policy if exists liquidaciones_write on public.liquidaciones;
create policy liquidaciones_write on public.liquidaciones
  for all
  using (public.can_write(array['Administrativo', 'Dirección']::public.department[]))
  with check (public.can_write(array['Administrativo', 'Dirección']::public.department[]));
