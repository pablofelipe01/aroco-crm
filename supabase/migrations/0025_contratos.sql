-- ============================================================================
--  AROCO · 0025 — Contratos de proveedores
--
--  Un contrato por proveedor: las condiciones de calidad y comerciales que dan
--  origen al contrato y sirven de referencia para validar las órdenes de compra.
--  Las "novedades" son observaciones fechadas (proveedor / AROCO) previas a la
--  aprobación. Estado: Vigente / Cancelado.
-- ============================================================================

create table public.contratos (
  id                     uuid primary key default gen_random_uuid(),
  proveedor_id           uuid not null unique references public.proveedores (id) on delete cascade,
  humedad_maxima         numeric(6,4),         -- % (ej. 0.07)
  granos_enteros_minimo  numeric(6,4),         -- % (ej. 0.90)
  fermentacion_minima    numeric(6,4),         -- % (ej. 0.80)
  libre_olores           text,                 -- Si / No
  lugar_entrega          text,
  forma_pago             text,
  garantia               text,
  sanciones_calidad      text,
  bonificaciones_calidad text,
  novedades_proveedor    text,                 -- observaciones fechadas (append)
  novedades_aroco        text,
  estado                 text not null default 'Vigente',  -- Vigente / Cancelado
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger contratos_set_updated_at
  before update on public.contratos
  for each row execute function public.set_updated_at();

alter table public.contratos enable row level security;

create policy "contratos_select" on public.contratos
  for select using (public.is_active_member());
create policy "contratos_write" on public.contratos
  for all
  using (public.can_write(array['Comercial', 'Administrativo']::public.department[]))
  with check (public.can_write(array['Comercial', 'Administrativo']::public.department[]));
