-- Notificaciones in-app: avisos dirigidos a un usuario (p. ej. Gerencia
-- Administrativa cuando entra un proveedor en estudio, o el creador cuando se
-- aprueba/rechaza). El canal de email es opcional y se activa por env var.

create table if not exists public.notificaciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.profiles (id) on delete cascade,
  tipo text not null,                 -- 'proveedor_en_estudio' | 'proveedor_resuelto' | ...
  titulo text not null,
  cuerpo text,
  enlace text,                        -- ruta interna, p. ej. /procesos/proveedores/<id>
  entidad text,
  entidad_id uuid,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notificaciones_usuario_idx
  on public.notificaciones (usuario_id, leida, created_at desc);

alter table public.notificaciones enable row level security;

-- El destinatario ve y marca como leídas solo las suyas.
drop policy if exists notificaciones_read on public.notificaciones;
create policy notificaciones_read on public.notificaciones
  for select using (usuario_id = (select auth.uid()));

drop policy if exists notificaciones_update on public.notificaciones;
create policy notificaciones_update on public.notificaciones
  for update using (usuario_id = (select auth.uid()))
  with check (usuario_id = (select auth.uid()));

-- Se crean desde las server actions (a nombre de cualquier miembro activo).
drop policy if exists notificaciones_insert on public.notificaciones;
create policy notificaciones_insert on public.notificaciones
  for insert with check (public.is_active_member());
