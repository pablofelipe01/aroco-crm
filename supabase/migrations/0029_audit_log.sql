-- Log de auditoría (aplicación): traza acciones de escritura del módulo Procesos.
-- Cada mutación relevante (proveedores, contratos, documentos, catálogos…) deja
-- aquí un registro: quién, qué entidad, qué acción, descripción y metadatos.

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  entidad text not null,              -- 'proveedor' | 'contrato' | 'documento' | 'catalogo' | ...
  entidad_id uuid,
  accion text not null,               -- 'crear' | 'actualizar' | 'eliminar' | 'estado' | ...
  descripcion text not null,
  meta jsonb,
  usuario_id uuid references public.profiles (id) on delete set null,
  usuario_nombre text,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entidad_idx on public.audit_log (entidad, entidad_id);

alter table public.audit_log enable row level security;

-- Lectura: solo administradores (herramienta de administración).
drop policy if exists audit_log_read on public.audit_log;
create policy audit_log_read on public.audit_log
  for select using (public.is_admin());

-- Escritura: cualquier miembro activo (se inserta desde las server actions).
drop policy if exists audit_log_insert on public.audit_log;
create policy audit_log_insert on public.audit_log
  for insert with check (public.is_active_member());
