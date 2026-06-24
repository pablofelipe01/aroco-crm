-- ============================================================================
--  AROCO · 0027 — Flujo de aprobación de proveedores (Fase 1)
--
--  Bitácora de trazabilidad de los cambios de estado del proveedor
--  (En estudio → Habilitado / Rechazado / Deshabilitado), con fecha, usuario y
--  motivo. Además se amplía el permiso de escritura de proveedores para que el
--  área Administrativa pueda gestionar el estado (el área Comercial crea/edita).
-- ============================================================================

create table public.proveedor_estado_log (
  id              uuid primary key default gen_random_uuid(),
  proveedor_id    uuid not null references public.proveedores (id) on delete cascade,
  estado_anterior text,
  estado_nuevo    text not null,
  motivo          text,
  usuario_id      uuid references public.profiles (id) on delete set null,
  usuario_nombre  text,
  created_at      timestamptz not null default now()
);
create index proveedor_estado_log_idx
  on public.proveedor_estado_log (proveedor_id, created_at desc);

alter table public.proveedor_estado_log enable row level security;

create policy "proveedor_estado_log_select" on public.proveedor_estado_log
  for select using (public.is_active_member());
create policy "proveedor_estado_log_write" on public.proveedor_estado_log
  for all
  using (public.can_write(array['Comercial', 'Administrativo']::public.department[]))
  with check (public.can_write(array['Comercial', 'Administrativo']::public.department[]));

-- Ampliar escritura de proveedores: Comercial (datos) + Administrativo (estado).
drop policy if exists "proveedores_write" on public.proveedores;
create policy "proveedores_write" on public.proveedores
  for all
  using (public.can_write(array['Comercial', 'Administrativo']::public.department[]))
  with check (public.can_write(array['Comercial', 'Administrativo']::public.department[]));
