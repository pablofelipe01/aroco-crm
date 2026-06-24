-- ============================================================================
--  AROCO · 0032 — Fase 3: Recepción de Órdenes de Compra en Bodega
--
--  Una recepción por OC (emitida): tipo de envío, pesaje (solicitado vs real),
--  evaluación de calidad (humedad, fermentación, impurezas, sensorial) y cierre
--  del reporte. El registro fotográfico (bultos, camión, corte, remisiones) vive
--  en el bucket privado 'recepciones'.
-- ============================================================================

do $$ begin
  create type public.recepcion_estado as enum ('En proceso', 'Cerrada');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.recepcion_envio as enum ('Cauca', 'Finca', 'Otros');
exception when duplicate_object then null; end $$;

create table if not exists public.recepciones (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null unique references public.ordenes_compra (id) on delete cascade,
  estado public.recepcion_estado not null default 'En proceso',
  tipo_envio public.recepcion_envio,
  peso_solicitado_kg numeric(12, 2),
  peso_recibido_kg numeric(12, 2),
  humedad_pct numeric(5, 2),
  fermentacion_pct numeric(5, 2),
  impurezas_pct numeric(5, 2),
  analisis_sensorial text,
  remisiones text,
  observaciones text,
  recibido_por uuid references public.profiles (id) on delete set null,
  cerrada_en timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recepcion_fotos (
  id uuid primary key default gen_random_uuid(),
  recepcion_id uuid not null references public.recepciones (id) on delete cascade,
  categoria text not null,             -- 'bultos' | 'camion' | 'corte' | 'remision'
  nombre text not null,
  file_path text not null,
  size_bytes integer,
  content_type text,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists recepcion_fotos_idx on public.recepcion_fotos (recepcion_id, categoria);

alter table public.recepciones enable row level security;
alter table public.recepcion_fotos enable row level security;

-- Escritura: Bodega Central, Dirección y Administrativo (Jefe de Bodega / Operaciones).
drop policy if exists recepciones_read on public.recepciones;
create policy recepciones_read on public.recepciones
  for select using (public.is_active_member());
drop policy if exists recepciones_write on public.recepciones;
create policy recepciones_write on public.recepciones
  for all
  using (public.can_write(array['Bodega Central', 'Dirección', 'Administrativo']::public.department[]))
  with check (public.can_write(array['Bodega Central', 'Dirección', 'Administrativo']::public.department[]));

drop policy if exists recepcion_fotos_read on public.recepcion_fotos;
create policy recepcion_fotos_read on public.recepcion_fotos
  for select using (public.is_active_member());
drop policy if exists recepcion_fotos_write on public.recepcion_fotos;
create policy recepcion_fotos_write on public.recepcion_fotos
  for all
  using (public.can_write(array['Bodega Central', 'Dirección', 'Administrativo']::public.department[]))
  with check (public.can_write(array['Bodega Central', 'Dirección', 'Administrativo']::public.department[]));

-- ── Bucket privado para el registro fotográfico ─────────────────────────────
insert into storage.buckets (id, name, public)
values ('recepciones', 'recepciones', false)
on conflict (id) do nothing;

drop policy if exists "recepciones_files_read" on storage.objects;
create policy "recepciones_files_read" on storage.objects
  for select using (bucket_id = 'recepciones' and public.is_active_member());
drop policy if exists "recepciones_files_insert" on storage.objects;
create policy "recepciones_files_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'recepciones'
    and public.can_write(array['Bodega Central', 'Dirección', 'Administrativo']::public.department[])
  );
drop policy if exists "recepciones_files_delete" on storage.objects;
create policy "recepciones_files_delete" on storage.objects
  for delete using (
    bucket_id = 'recepciones'
    and public.can_write(array['Bodega Central', 'Dirección', 'Administrativo']::public.department[])
  );
