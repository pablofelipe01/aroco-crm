-- ============================================================================
--  AROCO · 0120 — Labores Finca: riego, equipos y combustible
--
--  Reemplaza la «Planilla Control Operacion combustible riego» (Drive). La
--  historia entra con `scripts/cargar-combustible.ts`; la captura desde el
--  celular viene después.
--
--  De la planilla se usan DIESEL y GASOLINA (compras), RIEGO (horas del motor
--  por válvula y combustible cargado al motor) y las hojas de cada equipo
--  (guadaña, motosierra, bombas de motor). NO se usan «COMPRA» ni «RIEGO (1)»:
--  son copias más viejas de DIESEL/GASOLINA y de RIEGO, y cargarlas duplicaría.
--
--  PARA QUÉ: control. Lo que un equipo debió gastar es horas × consumo por
--  hora; lo que de verdad gastó es lo que se le cargó. Si se aleja mucho, o
--  faltan horas por registrar o se está perdiendo combustible.
--
--  ACCESO: solo Dirección (como 0117): hay plata.
-- ============================================================================

-- ── Equipos ─────────────────────────────────────────────────────────────────
--
--  `consumo_gal_h` es lo esperado. El del motor de riego (0,97 gal/h) lo
--  midió la finca el 2025-07-08 tanqueando con una pimpina de 5 galones. Los
--  de guadaña, motosierra y bombas vienen de la nota de cada hoja en LITROS
--  por hora y aquí van en galones (÷ 3,785). Son a confirmar con la finca: la
--  fórmula de la hoja los multiplicaba por la fracción del día, no por horas.
create table if not exists public.finca_equipos (
  id             uuid primary key default gen_random_uuid(),
  codigo         text not null unique,
  nombre         text not null,
  combustible    text not null check (combustible in ('acpm', 'gasolina')),
  consumo_gal_h  numeric(8,4),
  activo_fijo    text,
  activo         boolean not null default true,
  created_at     timestamptz not null default now()
);

insert into public.finca_equipos (codigo, nombre, combustible, consumo_gal_h, activo_fijo) values
  ('motor-riego', 'Motor de riego Deutz Weichai 53 HP', 'acpm', 0.97, '#17'),
  ('guadana', 'Guadaña', 'gasolina', round(0.3 / 3.785, 4), null),
  ('motosierra', 'Motosierra Bauker', 'gasolina', round(0.6 / 3.785, 4), null),
  ('bombas', 'Bombas de motor (fumigación)', 'gasolina', round(0.5 / 3.785, 4), null),
  ('planta', 'Planta eléctrica / estacionaria', 'gasolina', null, null)
on conflict (codigo) do nothing;

-- ── Compras de combustible ──────────────────────────────────────────────────
--
--  `valor` es lo pagado (VR.TOTAL); `galones` lo que dice el recibo. El
--  precio por galón se guarda aparte porque la estación lo cambia y no
--  siempre cuadra con valor ÷ galones (redondeos del surtidor).
create table if not exists public.finca_combustible_compras (
  id              uuid primary key default gen_random_uuid(),
  fecha           date not null,
  combustible     text not null check (combustible in ('acpm', 'gasolina')),
  recibo          text,
  galones         numeric(10,3),
  precio_galon    numeric(10,2),
  valor           numeric(14,2),
  proveedor       text,
  -- Para qué: «SISTEMA DE RIEGO», «control mecánico de malezas»,
  -- «transporte de ACPM»… tal como lo escribe la finca.
  destino         text,
  observaciones   text,

  origen          text not null default 'app' check (origen in ('app', 'hoja')),
  -- «diesel:<fila>» / «gasolina:<fila>» de la planilla, para recargar.
  ref_hoja        text unique,
  dudoso          boolean not null default false,
  motivo_duda     text,
  original        jsonb,
  created_by      uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  check (galones is null or galones >= 0),
  check (valor is null or valor >= 0)
);

create index if not exists finca_combustible_compras_fecha_idx
  on public.finca_combustible_compras (fecha);

create trigger finca_combustible_compras_set_updated_at
  before update on public.finca_combustible_compras
  for each row execute function public.set_updated_at();

-- ── Uso de equipos (incluido el riego) ──────────────────────────────────────
--
--  Una fila = un equipo, un tramo de uso. Para el motor de riego cada tramo
--  es un grupo de válvulas abierto de tal a tal hora: las válvulas del grupo
--  riegan A LA VEZ, así que cada una recibe las horas completas del tramo.
--
--  `carga_galones` es el combustible que se le echó al equipo ese día (la
--  columna CARGA MOTOR). Puede venir en una fila sin horas: el día que se
--  tanqueó sin regar.
create table if not exists public.finca_equipo_usos (
  id               uuid primary key default gen_random_uuid(),
  fecha            date not null,
  equipo_id        uuid not null references public.finca_equipos (id) on delete restrict,
  actividad        text,
  valvulas         text[] not null default '{}',
  sitio            text,
  hora_inicio      time,
  hora_fin         time,
  horas            numeric(5,2),
  carga_galones    numeric(8,2),
  empleado_id      uuid references public.finca_empleados (id) on delete set null,
  observaciones    text,

  origen           text not null default 'app' check (origen in ('app', 'hoja')),
  -- «riego:<fila>», «guadana:<fila>»… de la planilla.
  ref_hoja         text unique,
  dudoso           boolean not null default false,
  motivo_duda      text,
  original         jsonb,
  registrado_por   uuid default auth.uid() references public.profiles (id) on delete set null,
  registrado_en    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  check (horas is null or (horas >= 0 and horas <= 24)),
  check (carga_galones is null or carga_galones >= 0)
);

create index if not exists finca_equipo_usos_fecha_idx on public.finca_equipo_usos (fecha);
create index if not exists finca_equipo_usos_equipo_idx on public.finca_equipo_usos (equipo_id, fecha);

create trigger finca_equipo_usos_set_updated_at
  before update on public.finca_equipo_usos
  for each row execute function public.set_updated_at();

-- ── RLS: solo Dirección ─────────────────────────────────────────────────────
alter table public.finca_equipos             enable row level security;
alter table public.finca_combustible_compras enable row level security;
alter table public.finca_equipo_usos         enable row level security;

create policy "finca_equipos_direccion" on public.finca_equipos
  for all to authenticated
  using (public.is_direccion()) with check (public.is_direccion());
create policy "finca_combustible_compras_direccion" on public.finca_combustible_compras
  for all to authenticated
  using (public.is_direccion()) with check (public.is_direccion());
create policy "finca_equipo_usos_direccion" on public.finca_equipo_usos
  for all to authenticated
  using (public.is_direccion()) with check (public.is_direccion());
