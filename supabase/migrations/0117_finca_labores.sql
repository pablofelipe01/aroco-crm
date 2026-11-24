-- ============================================================================
--  AROCO · 0117 — Labores Finca: catálogos, registro diario y poscosecha
--
--  Reemplaza el «REPORTE DIARIO 2026 FINCA» (Drive). La hoja deja de ser la
--  fuente: la historia entra una vez con `scripts/cargar-finca.ts` y de ahí en
--  adelante cada trabajador registra desde el celular.
--
--  LA CAPTURA SERÁ SIN CONEXIÓN. En la finca hay internet en la oficina y no en
--  la plantación: el teléfono guarda el registro y lo sube al volver. Por eso
--  el `id` de cada registro lo genera el teléfono (uuid), no la base — así un
--  reintento después de una subida cortada choca con la llave primaria en vez
--  de duplicar la fila. Y por eso `registrado_en` es la hora del teléfono,
--  distinta de `created_at`, que es cuando llegó al servidor.
--
--  ACCESO: por ahora solo Dirección (pedido del cliente 2026-11-23), incluidos
--  los costos. Cuando los trabajadores tengan cuenta se abre la inserción de lo
--  propio para el área Finca.
-- ============================================================================

-- ── Trabajadores ────────────────────────────────────────────────────────────
--
--  No son `profiles`: hoy ninguno tiene cuenta en el CRM. `profile_id` queda
--  para cuando la tengan. `clave` es el nombre sin tildes, mayúsculas ni
--  espacios dobles — la hoja traía 24 escrituras para 7 personas.
create table if not exists public.finca_empleados (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  clave       text not null unique,
  profile_id  uuid unique references public.profiles (id) on delete set null,
  -- Valor del jornal (7,5 h) en COP. Null hasta que la finca lo entregue: un
  -- costo con jornal inventado es peor que no mostrar costo.
  jornal_cop  numeric(12,2),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger finca_empleados_set_updated_at
  before update on public.finca_empleados
  for each row execute function public.set_updated_at();

-- ── Válvulas (lotes de riego) ───────────────────────────────────────────────
--
--  Lista oficial del cliente: 1, 2, 3, 8, 9, 10, 14–21 y «1 Frutal». «Quinta»
--  y «Vivero» NO son lotes: son sitios de una actividad y van en
--  `finca_registros.sitio`.
create table if not exists public.finca_valvulas (
  codigo      text primary key,
  orden       integer not null,
  hectareas   numeric(8,2),
  arboles     integer,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

insert into public.finca_valvulas (codigo, orden) values
  ('1', 1), ('1 Frutal', 2), ('2', 3), ('3', 4), ('8', 5), ('9', 6), ('10', 7),
  ('14', 8), ('15', 9), ('16', 10), ('17', 11), ('18', 12), ('19', 13),
  ('20', 14), ('21', 15)
on conflict (codigo) do nothing;

-- ── Labores ─────────────────────────────────────────────────────────────────
--
--  `categoria` decide cómo cuenta en el tablero. Una `ausencia` (vacaciones,
--  incapacidad, compensatorio) ocupa horas en la hoja pero no es jornal
--  trabajado, y sumarla inflaría el costo por labor.
do $$ begin
  create type public.finca_categoria as enum (
    'cosecha', 'poscosecha', 'cultivo', 'riego', 'sanidad', 'mantenimiento',
    'administracion', 'ausencia'
  );
exception when duplicate_object then null; end $$;

create table if not exists public.finca_labores (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null unique,
  categoria   public.finca_categoria not null,
  -- Unidad en que se mide la cantidad (mazorcas, kg, árboles…). Null cuando
  -- la labor se mide solo en horas.
  unidad      text,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── Registro diario ─────────────────────────────────────────────────────────
--
--  Una fila = una persona, una labor, un tramo del día.
--
--  COSECHA EN CUADRILLA SE SUMA. Varias filas del mismo día traen la misma
--  cifra para todos los de la cuadrilla; el cliente confirmó que es lo de cada
--  uno, y el cruce lo respalda: sumando todas las filas de desgrane da el peso
--  baba de Poscosecha al kilo (marzo 2.145, abril 6.486).
--
--  `sanas` / `pasador_monilia` / `negras` son las columnas de la hoja. En
--  cosecha son mazorcas; en desgrane, kg baba calidad A (sanas) y C (negras).
create table if not exists public.finca_registros (
  id               uuid primary key default gen_random_uuid(),
  fecha            date not null,
  -- Null solo en el resumen diario de mayo, que la hoja trae sin trabajador.
  empleado_id      uuid references public.finca_empleados (id) on delete restrict,
  labor_id         uuid not null references public.finca_labores (id) on delete restrict,
  valvulas         text[] not null default '{}',
  -- Sitio que no es válvula: Quinta, Vivero, Lago, Invernadero…
  sitio            text,
  hora_inicio      time,
  hora_fin         time,
  horas            numeric(5,2),
  cantidad         numeric(12,2),
  unidad           text,
  sanas            numeric(12,2),
  pasador_monilia  numeric(12,2),
  negras           numeric(12,2),
  observaciones    text,

  origen           text not null default 'app' check (origen in ('app', 'hoja')),
  -- De dónde salió en el Excel, para recargar sin duplicar: «diario:83» (fila
  -- 83 del reporte) o «mayo:2026-05-06» (resumen de desgrane de mayo). El
  -- consecutivo «Cons» de la hoja no sirve de llave: se repite (el 985
  -- aparece 28 veces).
  ref_hoja         text unique,
  -- Lo que la carga no pudo resolver con seguridad (fecha corregida, horas
  -- imposibles, válvula fuera de la lista). Queda en «Por revisar».
  dudoso           boolean not null default false,
  motivo_duda      text,
  -- Texto original de la hoja, para revisar contra lo que se interpretó.
  original         jsonb,

  registrado_por   uuid default auth.uid() references public.profiles (id) on delete set null,
  registrado_en    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  check (horas is null or (horas >= 0 and horas <= 24))
);

create index if not exists finca_registros_fecha_idx on public.finca_registros (fecha);
create index if not exists finca_registros_empleado_idx on public.finca_registros (empleado_id, fecha);
create index if not exists finca_registros_labor_idx on public.finca_registros (labor_id, fecha);
create index if not exists finca_registros_dudoso_idx on public.finca_registros (fecha) where dudoso;

create trigger finca_registros_set_updated_at
  before update on public.finca_registros
  for each row execute function public.set_updated_at();

-- ── Poscosecha por bache ────────────────────────────────────────────────────
--
--  Baba → fermentado → seco, y el despacho. Calidad A o C por bache. El enlace
--  con el Inventario queda pendiente: depende de si la finca también alimenta
--  los archivos de Drive que sincroniza el inventario.
create table if not exists public.finca_baches (
  numero               integer primary key,
  valvulas_texto       text,
  variedad             text,
  calidad              text check (calidad in ('A', 'C')),
  fecha_inicio         date,
  peso_baba            numeric(10,2),
  fecha_salida_secado  date,
  peso_fermentado      numeric(10,2),
  peso_final           numeric(10,2),
  fecha_fin            date,
  fecha_despacho       date,
  peso_salida          numeric(10,2),
  observaciones        text,
  origen               text not null default 'app' check (origen in ('app', 'hoja')),
  dudoso               boolean not null default false,
  motivo_duda          text,
  original             jsonb,
  created_by           uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create trigger finca_baches_set_updated_at
  before update on public.finca_baches
  for each row execute function public.set_updated_at();

-- ── RLS: solo Dirección ─────────────────────────────────────────────────────
alter table public.finca_empleados enable row level security;
alter table public.finca_valvulas  enable row level security;
alter table public.finca_labores   enable row level security;
alter table public.finca_registros enable row level security;
alter table public.finca_baches    enable row level security;

create policy "finca_empleados_direccion" on public.finca_empleados
  for all to authenticated
  using (public.is_direccion()) with check (public.is_direccion());
create policy "finca_valvulas_direccion" on public.finca_valvulas
  for all to authenticated
  using (public.is_direccion()) with check (public.is_direccion());
create policy "finca_labores_direccion" on public.finca_labores
  for all to authenticated
  using (public.is_direccion()) with check (public.is_direccion());
create policy "finca_registros_direccion" on public.finca_registros
  for all to authenticated
  using (public.is_direccion()) with check (public.is_direccion());
create policy "finca_baches_direccion" on public.finca_baches
  for all to authenticated
  using (public.is_direccion()) with check (public.is_direccion());
