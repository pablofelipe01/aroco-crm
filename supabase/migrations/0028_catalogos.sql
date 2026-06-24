-- Catálogos administrables (certificaciones, sellos, …)
-- Reemplazan a las listas "quemadas" en src/lib/procesos/proveedor-opts.ts,
-- permitiendo que Gerencia agregue/edite opciones sin un deploy.

create table if not exists public.catalogos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,                 -- 'certificacion' | 'sello' | ...
  valor text not null,                -- texto mostrado y guardado en el proveedor
  descripcion text,
  orden int not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo, valor)
);

create index if not exists catalogos_tipo_idx on public.catalogos (tipo, orden);

alter table public.catalogos enable row level security;

drop policy if exists catalogos_read on public.catalogos;
create policy catalogos_read on public.catalogos
  for select using (public.is_active_member());

drop policy if exists catalogos_write on public.catalogos;
create policy catalogos_write on public.catalogos
  for all using (public.is_admin()) with check (public.is_admin());

-- Seed con los valores actuales (idempotente).
insert into public.catalogos (tipo, valor, orden) values
  ('certificacion', 'Orgánico (USDA)', 1),
  ('certificacion', 'Orgánico (EU)', 2),
  ('certificacion', 'Rainforest Alliance', 3),
  ('certificacion', 'Fairtrade', 4),
  ('certificacion', 'Ninguna', 5),
  ('sello', 'Cacao desminado', 1),
  ('sello', 'Frutos de paz', 2),
  ('sello', 'Cacao por coca', 3),
  ('sello', 'Mujer rural', 4)
on conflict (tipo, valor) do nothing;
