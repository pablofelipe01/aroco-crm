-- ============================================================================
--  AROCO · 0023 — Proveedores (gestión de proveedores de cacao, v1 núcleo)
--
--  Módulo dentro de Procesos: crear/buscar/listar proveedores. Esta v1 cubre la
--  TABLA Proveedores (datos + estado) y los catálogos mínimos (departamentos /
--  municipios) para los desplegables dependientes. Documentos PDF, contrato y el
--  flujo de aprobación llegan en incrementos siguientes.
-- ============================================================================

create type public.proveedor_estado as enum (
  'En estudio', 'Habilitado', 'Deshabilitado', 'Rechazado'
);

-- ── Catálogos de ubicación ───────────────────────────────────────────────────
create table public.departamentos (
  id     text primary key,            -- código DANE corto ("01", "05"…)
  nombre text not null unique
);

create table public.municipios (
  id          uuid primary key default gen_random_uuid(),
  departamento text not null,         -- nombre del departamento
  nombre       text not null,
  codigo       text,                  -- código municipio
  unique (departamento, nombre)
);
create index municipios_departamento_idx on public.municipios (departamento);

-- ── Proveedores ──────────────────────────────────────────────────────────────
create table public.proveedores (
  id                      uuid primary key default gen_random_uuid(),
  codigo                  text,                 -- "Código Productor" (010101-0001)
  nombre                  text not null,
  tipo_proveedor          text,                 -- Productor Individual / Asociación / Cooperativa / Comercializador
  tipo_producto           text,
  tipo_documento          text,                 -- CC / NIT / CE…
  numero_documento        text,                 -- id de negocio, sin duplicados
  direccion               text,
  departamento            text,
  municipio               text,
  pertenece_asociacion    text,                 -- Si, a una asociación / Si, a una cooperativa / No
  asociacion              text,
  pertenece_programa      text,                 -- Si / No
  programa                text,
  nit_asociacion          text,
  contacto                text,
  celular                 text,
  whatsapp                text,                 -- Si / No
  email                   text,
  variedad_cacao          text,
  cap_baba_mensual        numeric(14,2),
  cap_baba_anual          numeric(14,2),
  cap_seco_mensual        numeric(14,2),
  cap_seco_anual          numeric(14,2),
  tipo_secado             text,
  humedad                 numeric(6,2),
  libre_deforestacion     text,
  libre_trabajo_infantil  text,
  banco                   text,
  tipo_cuenta             text,                 -- ahorros / corriente / billetera virtual
  numero_cuenta           text,
  cedula_titular          text,
  nombre_titular          text,
  regimen_tributario      text,
  referencia_comercial_1  text,
  referencia_comercial_2  text,
  num_productores_compra  integer,
  certificaciones         text[] not null default '{}',
  sellos                  text[] not null default '{}',
  coordenadas             text,
  acepta_compromisos_eticos text,               -- Si / No
  acepta_politica_datos   text,                 -- Si / No
  estado                  public.proveedor_estado not null default 'En estudio',
  comentarios_estado      text,
  usuario_asignado        uuid references public.team_members (id) on delete set null,
  created_by              uuid references public.profiles (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

-- # de documento es el identificador de negocio: sin duplicados (los nulos/''
-- no chocan entre sí, ya que muchos registros importados aún no lo traen).
create unique index proveedores_numero_documento_key
  on public.proveedores (numero_documento)
  where numero_documento is not null and numero_documento <> '';
create index proveedores_nombre_idx on public.proveedores (nombre);
create index proveedores_estado_idx on public.proveedores (estado);
create index proveedores_departamento_idx on public.proveedores (departamento);

create trigger proveedores_set_updated_at
  before update on public.proveedores
  for each row execute function public.set_updated_at();

-- ── RLS — lectura: miembros activos; escritura: Comercial (y admins) ─────────
alter table public.departamentos enable row level security;
alter table public.municipios    enable row level security;
alter table public.proveedores   enable row level security;

create policy "departamentos_select" on public.departamentos
  for select using (public.is_active_member());
create policy "municipios_select" on public.municipios
  for select using (public.is_active_member());

create policy "proveedores_select" on public.proveedores
  for select using (public.is_active_member());
create policy "proveedores_write" on public.proveedores
  for all
  using (public.can_write(array['Comercial']::public.department[]))
  with check (public.can_write(array['Comercial']::public.department[]));
