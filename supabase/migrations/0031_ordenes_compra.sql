-- Fase 2 — Gestión de Compra: Órdenes de Compra (OC) como entidad real.
-- Estados: Borrador → (En revisión) → Aprobada → Emitida; o Rechazada.
-- El consecutivo se asigna al aprobar. El caso define la ruta de aprobación
-- (ROC/Finca = automática; otros = revisión de Gerencia).

do $$ begin
  create type public.oc_estado as enum ('Borrador', 'En revisión', 'Aprobada', 'Rechazada', 'Emitida');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.oc_caso as enum ('roc', 'otros_sin', 'otros_con');
exception when duplicate_object then null; end $$;

create table if not exists public.ordenes_compra (
  id uuid primary key default gen_random_uuid(),
  consecutivo text unique,
  proveedor_id uuid not null references public.proveedores (id) on delete restrict,
  tipo_caso public.oc_caso not null default 'otros_sin',
  estado public.oc_estado not null default 'Borrador',
  volumen_kg numeric(12, 2),
  precio_kg numeric(12, 2),
  valor_total numeric(16, 2) generated always as (
    coalesce(volumen_kg, 0) * coalesce(precio_kg, 0)
  ) stored,
  fecha_entrega date,
  lugar_entrega text,
  observaciones text,
  motivo_rechazo text,
  created_by uuid references public.profiles (id) on delete set null,
  aprobada_por uuid references public.profiles (id) on delete set null,
  aprobada_en timestamptz,
  emitida_en timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ordenes_compra_proveedor_idx on public.ordenes_compra (proveedor_id);
create index if not exists ordenes_compra_estado_idx on public.ordenes_compra (estado, created_at desc);

alter table public.ordenes_compra enable row level security;

drop policy if exists ordenes_compra_read on public.ordenes_compra;
create policy ordenes_compra_read on public.ordenes_compra
  for select using (public.is_active_member());

drop policy if exists ordenes_compra_write on public.ordenes_compra;
create policy ordenes_compra_write on public.ordenes_compra
  for all
  using (public.can_write(array['Comercial', 'Administrativo']::public.department[]))
  with check (public.can_write(array['Comercial', 'Administrativo']::public.department[]));
