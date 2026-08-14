-- ============================================================================
--  AROCO · 0051 — Compras de insumos (no cacao)
--
--  Cotizaciones de proveedores para lo que necesita la operación: oficina,
--  finca, plantación, bodega… Nada que ver con `/cotizaciones` (venta de cacao
--  a la exportación) ni con `ordenes_compra` de Procesos (compra de cacao a
--  proveedores). Por eso vive aparte y se llama Compras.
--
--  Flujo: alguien crea una SOLICITUD ("fertilizante para la finca") y le
--  cuelga las COTIZACIONES que consiguió. Quien aprueba las ve lado a lado,
--  elige una y aprueba. Después se registra el pago y la entrega.
--
--  Guardar las cotizaciones bajo la solicitud —y no sueltas— es lo que deja
--  constancia de qué alternativas había y por qué se escogió esa.
-- ============================================================================

do $$ begin
  create type public.compra_estado as enum (
    'Borrador',    -- se está armando, aún no pide aprobación
    'Pendiente',   -- enviada, esperando visto bueno
    'Aprobada',
    'Rechazada'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.compra_categoria as enum (
    'Oficina', 'Finca', 'Plantación', 'Bodega', 'Transporte',
    'Mantenimiento', 'Tecnología', 'Otro'
  );
exception when duplicate_object then null; end $$;

-- ── Quién aprueba ───────────────────────────────────────────────────────────
-- Un permiso explícito en vez de deducirlo del rol: los aprobadores son
-- Álvaro, Nicolás y Luis Ernesto, y Luis es `admin_view` mientras que otros
-- `admin` (Ángela, Pablo, Alejo) NO aprueban compras. Ningún rol existente
-- describe ese grupo, y con una marca se puede cambiar sin tocar código.
alter table public.profiles
  add column if not exists aprueba_compras boolean not null default false;

comment on column public.profiles.aprueba_compras is
  'Puede aprobar o rechazar solicitudes de compra de insumos.';

create or replace function public.puede_aprobar_compras()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.aprueba_compras
  );
$$;

revoke execute on function public.puede_aprobar_compras() from anon;
grant execute on function public.puede_aprobar_compras() to authenticated;

-- ── Solicitud ───────────────────────────────────────────────────────────────
create sequence if not exists public.compra_consecutivo_seq;

create table if not exists public.compra_solicitudes (
  id            uuid primary key default gen_random_uuid(),
  consecutivo   text not null default 'SC-' || lpad(nextval('public.compra_consecutivo_seq')::text, 4, '0'),
  titulo        text not null,
  descripcion   text,
  categoria     public.compra_categoria not null default 'Otro',
  -- A qué área se carga el gasto. Puede no coincidir con el área de quien
  -- solicita: bodega puede pedir algo para la finca.
  area          public.department,
  justificacion text,
  estado        public.compra_estado not null default 'Borrador',

  -- Aprobación
  cotizacion_elegida_id uuid,   -- FK diferida: la tabla se crea abajo
  aprobada_por  uuid references public.profiles (id) on delete set null,
  aprobada_en   timestamptz,
  motivo_rechazo text,

  -- Pago y entrega van por separado del estado: no siempre ocurren en ese
  -- orden, y forzar una secuencia obligaría a mentir en el registro.
  pagada_en     timestamptz,
  pago_medio    text,
  pago_referencia text,
  pagada_por    uuid references public.profiles (id) on delete set null,

  recibida_en   timestamptz,
  recibida_por  uuid references public.profiles (id) on delete set null,
  entrega_notas text,

  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists compra_solicitudes_consecutivo_key
  on public.compra_solicitudes (consecutivo);
create index if not exists compra_solicitudes_estado_idx
  on public.compra_solicitudes (estado, created_at desc);

create trigger compra_solicitudes_set_updated_at
  before update on public.compra_solicitudes
  for each row execute function public.set_updated_at();

-- ── Cotizaciones de la solicitud ────────────────────────────────────────────
create table if not exists public.compra_cotizaciones (
  id            uuid primary key default gen_random_uuid(),
  solicitud_id  uuid not null references public.compra_solicitudes (id) on delete cascade,
  proveedor     text not null,
  nit           text,
  descripcion   text,
  monto         numeric(16,2) not null,
  moneda        text not null default 'COP',
  incluye_iva   boolean not null default true,
  valida_hasta  date,
  tiempo_entrega text,
  archivo_path  text,
  archivo_nombre text,
  notas         text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists compra_cotizaciones_solicitud_idx
  on public.compra_cotizaciones (solicitud_id);

alter table public.compra_solicitudes
  add constraint compra_solicitudes_cotizacion_fk
  foreign key (cotizacion_elegida_id)
  references public.compra_cotizaciones (id) on delete set null;

-- ── La cotización elegida debe ser de esta solicitud ────────────────────────
-- Sin esto se podría aprobar una solicitud señalando la cotización de otra.
create or replace function public.guard_cotizacion_elegida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.cotizacion_elegida_id is not null
     and not exists (
       select 1 from public.compra_cotizaciones c
       where c.id = new.cotizacion_elegida_id and c.solicitud_id = new.id
     ) then
    raise exception 'La cotización elegida no pertenece a esta solicitud.'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger compra_solicitudes_guard_cotizacion
  before insert or update of cotizacion_elegida_id on public.compra_solicitudes
  for each row execute function public.guard_cotizacion_elegida();

-- ── Solo los aprobadores aprueban o rechazan ────────────────────────────────
-- La RLS no distingue por columna, así que el candado va en un trigger. Se
-- deja pasar cuando no hay usuario (service_role) para no dejar sin salida a
-- un script de mantenimiento.
create or replace function public.guard_compra_aprobacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado is distinct from old.estado
     and new.estado in ('Aprobada', 'Rechazada')
     and auth.uid() is not null
     and not public.puede_aprobar_compras() then
    raise exception 'Solo quienes aprueban compras pueden aprobar o rechazar una solicitud.'
      using errcode = '42501';
  end if;

  -- Una solicitud aprobada o rechazada no se reabre editándola: se deja
  -- constancia. Volver a Borrador borraría el rastro de quién decidió.
  if old.estado in ('Aprobada', 'Rechazada')
     and new.estado in ('Borrador', 'Pendiente')
     and auth.uid() is not null
     and not public.puede_aprobar_compras() then
    raise exception 'Una solicitud ya decidida solo la puede reabrir quien aprueba compras.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger compra_solicitudes_guard_aprobacion
  before update on public.compra_solicitudes
  for each row execute function public.guard_compra_aprobacion();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Las compras no son información reservada y todo el equipo puede solicitar,
-- así que la lectura y la creación quedan abiertas a miembros activos. Lo que
-- se acota es la decisión, y eso lo hacen los triggers de arriba.
alter table public.compra_solicitudes enable row level security;
alter table public.compra_cotizaciones enable row level security;

create policy "compra_solicitudes_select" on public.compra_solicitudes
  for select to authenticated using (public.is_active_member());
create policy "compra_solicitudes_insert" on public.compra_solicitudes
  for insert to authenticated with check (public.is_active_member());
create policy "compra_solicitudes_update" on public.compra_solicitudes
  for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
-- Borrar solo lo propio y sin decidir; lo demás queda como historial.
create policy "compra_solicitudes_delete" on public.compra_solicitudes
  for delete to authenticated
  using (
    public.is_admin()
    or (created_by = auth.uid() and estado = 'Borrador')
  );

create policy "compra_cotizaciones_select" on public.compra_cotizaciones
  for select to authenticated using (public.is_active_member());
create policy "compra_cotizaciones_insert" on public.compra_cotizaciones
  for insert to authenticated with check (public.is_active_member());
create policy "compra_cotizaciones_update" on public.compra_cotizaciones
  for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
create policy "compra_cotizaciones_delete" on public.compra_cotizaciones
  for delete to authenticated
  using (public.is_admin() or created_by = auth.uid());

-- ── Archivos de las cotizaciones ────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('compras', 'compras', false)
on conflict (id) do nothing;

create policy "compras_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'compras' and public.is_active_member());

create policy "compras_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'compras' and public.is_active_member());

create policy "compras_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'compras' and public.is_admin());

-- ── Los tres aprobadores que se acordaron ───────────────────────────────────
update public.profiles
set aprueba_compras = true
where email in (
  'alvaro.acosta@aroco.co',      -- Gerente General
  'nicolas.rodriguez@aroco.co',  -- Gerente Comercial
  'luis.barrios@aroco.co'        -- Gerente Admin
);
