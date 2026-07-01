-- 0034 — Comerciales participantes por Orden de Compra
-- Captura quién participó en cada OC y en qué rol (compra / venta), para
-- alimentar las comisiones desde la base de datos (fuente única) en lugar de
-- llevarlo en Excel. Una operación puede tener varios comerciales (p. ej. uno
-- consigue al proveedor y otro negocia con el cliente → se reparte la comisión).

create table if not exists public.oc_comerciales (
  id           uuid primary key default gen_random_uuid(),
  orden_id     uuid not null references public.ordenes_compra (id) on delete cascade,
  comercial_id uuid not null references public.team_members (id) on delete restrict,
  rol          public.commission_role not null default 'Solo Compra',
  nota         text,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (orden_id, comercial_id)
);

create index if not exists oc_comerciales_orden_idx on public.oc_comerciales (orden_id);
create index if not exists oc_comerciales_comercial_idx on public.oc_comerciales (comercial_id);

alter table public.oc_comerciales enable row level security;

-- Lectura: cualquier miembro activo. La restricción de "historial de comisiones
-- solo para admin / jefes de área" se aplica en la vista de Comisiones, no en la
-- captura operativa dentro de la OC.
drop policy if exists oc_comerciales_read on public.oc_comerciales;
create policy oc_comerciales_read on public.oc_comerciales
  for select using (public.is_active_member());

-- Escritura: Comercial / Administrativo (igual que ordenes_compra).
drop policy if exists oc_comerciales_write on public.oc_comerciales;
create policy oc_comerciales_write on public.oc_comerciales
  for all
  using (public.can_write(array['Comercial', 'Administrativo']::public.department[]))
  with check (public.can_write(array['Comercial', 'Administrativo']::public.department[]));
