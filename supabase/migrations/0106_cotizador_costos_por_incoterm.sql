-- ============================================================================
--  AROCO · 0106 — Costos por defecto del cotizador, uno por incoterm
--
--  Revisión del CRM del 2026-10-09: las cotizaciones de exportación salían con
--  los costos de la pestaña NACIONAL (transporte a bodega 150 en vez de 104).
--  0104 dejó una sola lista de costos para los tres incoterms; la hoja de
--  Nicolás tiene una por pestaña (columna M). Nicolás subió costos_exportacion
--  a 836,15 (el de FOB), con lo que CIF quedó también mal (va en 720).
--
--  Se cambian los 7 costos sueltos por uno por incoterm, con los valores de la
--  hoja leída el 2026-10-13. No se crean los que la hoja anula con `*0`:
--  estibas en FOB, transporte a bodega en CIF, costos de exportación en
--  NACIONAL. Las cotizaciones ya hechas no cambian: guardan sus propios costos.
-- ============================================================================

delete from public.cotizador_parametros
where clave in (
  'transporte_bodega', 'seleccion', 'fumigacion', 'estibas',
  'costales', 'coberturas', 'costos_exportacion'
);

insert into public.cotizador_parametros (clave, valor, unidad, descripcion, orden) values
  ('transporte_bodega_fob',      104,    'cop_kg', 'Transporte a bodega',   200),
  ('seleccion_fob',              83,     'cop_kg', 'Selección en bodega',   201),
  ('fumigacion_fob',             90,     'cop_kg', 'Fumigación',            202),
  ('costales_fob',               226.1,  'cop_kg', 'Costales',              204),
  ('coberturas_fob',             15,     'cop_kg', 'Coberturas',            205),
  ('costos_exportacion_fob',     836.15, 'cop_kg', 'Costos de exportación', 206),

  ('seleccion_cif',              83,     'cop_kg', 'Selección en bodega',   301),
  ('fumigacion_cif',             100,    'cop_kg', 'Fumigación',            302),
  ('estibas_cif',                53,     'cop_kg', 'Estibas / embalaje',    303),
  ('costales_cif',               215,    'cop_kg', 'Costales',              304),
  ('coberturas_cif',             15,     'cop_kg', 'Coberturas',            305),
  ('costos_exportacion_cif',     720,    'cop_kg', 'Costos de exportación', 306),

  ('transporte_bodega_nacional', 150,    'cop_kg', 'Transporte a bodega',   400),
  ('seleccion_nacional',         83,     'cop_kg', 'Selección en bodega',   401),
  ('fumigacion_nacional',        0,      'cop_kg', 'Fumigación',            402),
  ('estibas_nacional',           0,      'cop_kg', 'Estibas / embalaje',    403),
  ('costales_nacional',          0,      'cop_kg', 'Costales',              404),
  ('coberturas_nacional',        0,      'cop_kg', 'Coberturas',            405)
on conflict (clave) do nothing;
