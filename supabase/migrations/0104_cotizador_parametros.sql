-- Cotizador: parámetros que solo edita un admin, la Bonificación Calidad como
-- porcentaje repartible con el proveedor, y precio del cacao/TRM desde Mercado.
--
-- Port de la hoja «Cotizador Comercial Aroco» de Nicolás (leída 2026-10-09).
-- Los porcentajes se guardan como fracción (0,03 = 3 %); el resto en COP/kg.

create table if not exists public.cotizador_parametros (
  clave       text primary key,
  valor       numeric not null,
  unidad      text not null check (unidad in ('ratio', 'cop_kg')),
  descripcion text not null,
  orden       int not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles (id) on delete set null default auth.uid()
);

alter table public.cotizador_parametros enable row level security;

create policy "cotizador_parametros_select" on public.cotizador_parametros
  for select to authenticated using (true);

-- Sin INSERT/DELETE desde el cliente: las claves las fija esta migración.
create policy "cotizador_parametros_update" on public.cotizador_parametros
  for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

insert into public.cotizador_parametros (clave, valor, unidad, descripcion, orden) values
  ('fnc_pct',                     0.03,   'ratio',  'FNC sobre el precio de compra (solo FOB/CIF).', 10),
  ('merma_pct',                   0.005,  'ratio',  'Merma sobre el precio de compra.', 20),
  ('factor_nacional',             0.97,   'ratio',  'NACIONAL: precio final = compra ÷ este factor.', 30),
  ('comision_fob',                0.08,   'ratio',  'Comisión por defecto FOB (sobre la utilidad).', 40),
  ('comision_cif',                0.10,   'ratio',  'Comisión por defecto CIF (sobre la utilidad).', 50),
  ('comision_nacional',           0.05,   'ratio',  'Comisión por defecto NACIONAL (sobre la utilidad).', 60),
  ('umbral_viable',               0.10,   'ratio',  'Utilidad mínima para marcar la cotización como viable.', 70),
  ('bonif_calidad_pct',           0.0495, 'ratio',  'Bonificación Calidad sobre el precio final: 3,85 % + 1,75 % + 1 % − 1,65 % (componentes por confirmar).', 80),
  ('bonif_calidad_proveedor_pct', 0,      'ratio',  'Parte de la Bonificación Calidad que se cede al proveedor, por defecto. Se ajusta en cada cotización.', 90),
  ('bonif_cadmio',                280,    'cop_kg', 'Bonificación Cadmio por defecto.', 100),
  ('bonif_trazabilidad',          120,    'cop_kg', 'Bonificación Trazabilidad por defecto.', 110),
  ('bonif_transporte',            180,    'cop_kg', 'Bonificación de Transporte por defecto.', 120),
  ('transporte_bodega',           150,    'cop_kg', 'Transporte a bodega por defecto.', 130),
  ('seleccion',                   83,     'cop_kg', 'Selección en bodega por defecto.', 140),
  ('fumigacion',                  90,     'cop_kg', 'Fumigación por defecto.', 150),
  ('estibas',                     53,     'cop_kg', 'Estibas / embalaje por defecto.', 160),
  ('costales',                    226.1,  'cop_kg', 'Costales por defecto.', 170),
  ('coberturas',                  15,     'cop_kg', 'Coberturas por defecto.', 180),
  ('costos_exportacion',          720,    'cop_kg', 'Costos de exportación por defecto (FOB/CIF).', 190)
on conflict (clave) do nothing;

-- Cada cotización guarda los parámetros con que se calculó, para que un cambio
-- del admin no altere lo ya enviado. bonif_calidad pasa a ser el valor
-- calculado (USD/TM, parte de AROCO); target_utility_pct queda sin uso.
alter table public.quotes
  add column if not exists fnc_pct                     numeric not null default 0.03,
  add column if not exists merma_pct                   numeric not null default 0.005,
  add column if not exists factor_nacional             numeric not null default 0.97,
  add column if not exists bonif_calidad_pct           numeric not null default 0,
  add column if not exists bonif_calidad_proveedor_pct numeric not null default 0
    check (bonif_calidad_proveedor_pct between 0 and 1);

-- Precio del cacao (ICE NY) y TRM más recientes, sin abrir market_data ni
-- trm_data, que son solo para quien tiene el permiso de Mercado.
create or replace function public.cotizador_referencias()
returns table (cocoa_usd_t numeric, cocoa_fecha date, trm numeric, trm_fecha date)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select close_price from market_data
      where ticker = 'CC=F' and close_price is not null
      order by date desc limit 1),
    (select date from market_data
      where ticker = 'CC=F' and close_price is not null
      order by date desc limit 1),
    (select t.trm from trm_data t order by t.date desc limit 1),
    (select t.date from trm_data t order by t.date desc limit 1);
$$;

revoke execute on function public.cotizador_referencias() from public, anon;
grant execute on function public.cotizador_referencias() to authenticated;
