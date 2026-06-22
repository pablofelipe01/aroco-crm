-- ============================================================================
--  AROCO · 0022 — Procesos (tablero operativo de seguimiento por fases)
--
--  Vertiente nueva, independiente del CRM/Inventario. Modela "casos" que
--  recorren un proceso por fases con checklist por paso, decisiones (ramas) y
--  timeline. La plantilla del proceso vive en TS (src/lib/procesos/template.ts);
--  aquí se persisten las INSTANCIAS (casos + pasos + decisiones + eventos).
--  Compartido por el equipo (RLS: miembros activos leen y escriben).
-- ============================================================================

create type public.proceso_tipo   as enum ('proveedor', 'orden_compra');
create type public.proceso_estado as enum ('en_curso', 'bloqueado', 'completado');
create type public.paso_estado    as enum ('pendiente', 'en_curso', 'completado', 'bloqueado', 'no_aplica');

-- ── casos — cada sujeto que recorre el flujo ─────────────────────────────────
create table public.proceso_casos (
  id            uuid primary key default gen_random_uuid(),
  proceso_key   text not null default 'cacao',         -- prepara multi-proceso
  tipo          public.proceso_tipo not null,
  titulo        text not null,
  proveedor_ref uuid references public.proceso_casos (id) on delete set null,
  origen        text,                                  -- solo OCs: define ramas
  fase_actual   int not null default 1,
  estado        public.proceso_estado not null default 'en_curso',
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index proceso_casos_tipo_idx on public.proceso_casos (tipo);
create index proceso_casos_estado_idx on public.proceso_casos (estado);

create trigger proceso_casos_set_updated_at
  before update on public.proceso_casos
  for each row execute function public.set_updated_at();

-- ── pasos — checklist instanciado por caso ───────────────────────────────────
create table public.proceso_pasos (
  id             uuid primary key default gen_random_uuid(),
  caso_id        uuid not null references public.proceso_casos (id) on delete cascade,
  fase_numero    int  not null,
  fase_nombre    text not null,
  orden          int  not null default 0,
  numero         text not null,                        -- "1", "3A", "6B"…
  titulo         text not null,
  rol            text not null,
  es_automatico  boolean not null default false,
  es_rama        boolean not null default false,       -- pertenece a una decisión
  asignado_a     uuid references public.team_members (id) on delete set null,
  estado         public.paso_estado not null default 'pendiente',
  notas          text,
  fecha_limite   date,
  completado_el  timestamptz,
  completado_por uuid references public.team_members (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index proceso_pasos_caso_idx on public.proceso_pasos (caso_id, fase_numero, orden);

create trigger proceso_pasos_set_updated_at
  before update on public.proceso_pasos
  for each row execute function public.set_updated_at();

-- ── decisiones — nodos de rama instanciados ──────────────────────────────────
create table public.proceso_decisiones (
  id          uuid primary key default gen_random_uuid(),
  caso_id     uuid not null references public.proceso_casos (id) on delete cascade,
  fase_numero int  not null,
  orden       int  not null default 0,
  clave       text not null,                           -- id de la decisión en la plantilla
  pregunta    text not null,
  rol         text not null,
  opciones    jsonb not null,                          -- [{id, etiqueta, activaPasos:[numero]}]
  elegida     text,                                    -- id de opción elegida
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index proceso_decisiones_caso_idx on public.proceso_decisiones (caso_id, fase_numero, orden);

create trigger proceso_decisiones_set_updated_at
  before update on public.proceso_decisiones
  for each row execute function public.set_updated_at();

-- ── eventos — timeline cronológico del caso ──────────────────────────────────
create table public.proceso_eventos (
  id           uuid primary key default gen_random_uuid(),
  caso_id      uuid not null references public.proceso_casos (id) on delete cascade,
  descripcion  text not null,
  paso_numero  text,
  actor        uuid references public.team_members (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index proceso_eventos_caso_idx on public.proceso_eventos (caso_id, created_at desc);

-- ── revisiones — Fase 5 (seguimiento bimensual recurrente) ───────────────────
create table public.proceso_revisiones (
  id         uuid primary key default gen_random_uuid(),
  caso_id    uuid not null references public.proceso_casos (id) on delete cascade,
  fecha      date not null,
  metas      text,
  notas      text,
  created_at timestamptz not null default now()
);
create index proceso_revisiones_caso_idx on public.proceso_revisiones (caso_id, fecha desc);

-- ── RLS — tablero compartido: miembros activos leen y escriben ───────────────
alter table public.proceso_casos      enable row level security;
alter table public.proceso_pasos      enable row level security;
alter table public.proceso_decisiones enable row level security;
alter table public.proceso_eventos    enable row level security;
alter table public.proceso_revisiones enable row level security;

create policy "proceso_casos_rw" on public.proceso_casos
  for all using (public.is_active_member()) with check (public.is_active_member());
create policy "proceso_pasos_rw" on public.proceso_pasos
  for all using (public.is_active_member()) with check (public.is_active_member());
create policy "proceso_decisiones_rw" on public.proceso_decisiones
  for all using (public.is_active_member()) with check (public.is_active_member());
create policy "proceso_eventos_rw" on public.proceso_eventos
  for all using (public.is_active_member()) with check (public.is_active_member());
create policy "proceso_revisiones_rw" on public.proceso_revisiones
  for all using (public.is_active_member()) with check (public.is_active_member());
