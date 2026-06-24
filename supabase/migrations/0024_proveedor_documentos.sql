-- ============================================================================
--  AROCO · 0024 — Documentos soporte de Proveedores (PDF/imágenes)
--
--  Según la spec: documentos legales, técnicos y contrato firmado (hasta 10
--  archivos por categoría, 5 MB c/u). Los archivos viven en el bucket privado
--  'proveedores' de Supabase Storage; esta tabla guarda la metadata.
-- ============================================================================

create table public.proveedor_documentos (
  id           uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores (id) on delete cascade,
  categoria    text not null,                 -- 'legales' | 'tecnicos' | 'contrato'
  nombre       text not null,                 -- nombre original del archivo
  file_path    text not null,                 -- ruta en el bucket
  size_bytes   integer,
  content_type text,
  uploaded_by  uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now()
);
create index proveedor_documentos_prov_idx
  on public.proveedor_documentos (proveedor_id, categoria);

alter table public.proveedor_documentos enable row level security;

create policy "proveedor_documentos_select" on public.proveedor_documentos
  for select using (public.is_active_member());
create policy "proveedor_documentos_write" on public.proveedor_documentos
  for all
  using (public.can_write(array['Comercial']::public.department[]))
  with check (public.can_write(array['Comercial']::public.department[]));

-- ── Bucket privado para los archivos ────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('proveedores', 'proveedores', false)
on conflict (id) do nothing;

create policy "proveedores_files_read" on storage.objects
  for select using (bucket_id = 'proveedores' and public.is_active_member());
create policy "proveedores_files_insert" on storage.objects
  for insert
  with check (
    bucket_id = 'proveedores'
    and public.can_write(array['Comercial']::public.department[])
  );
create policy "proveedores_files_delete" on storage.objects
  for delete using (
    bucket_id = 'proveedores'
    and public.can_write(array['Comercial']::public.department[])
  );
