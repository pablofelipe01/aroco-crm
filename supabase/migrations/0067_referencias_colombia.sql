-- ============================================================================
--  AROCO · 0067 — Las referencias de Colombia, configurables
--
--  Al leer el reporte real del 20-ago apareció algo que no se veía antes:
--  «Guayaquil grado 2» y «Perú grado 1» NO son comparables tal cual. En el
--  reporte, Ecuador Grade 2 aparece tres veces —CIF N. Europe, ExW US y FOB
--  Guayaquil— y Perú Grade 1 solo como ExW US:
--
--      Ecuador Grade 2 · ExW US          $ 320
--      Ecuador Grade 2 · FOB Guayaquil   $ (30)
--      Peru Grade 1    · ExW US          $ 281
--
--  Entre FOB Guayaquil y ExW US hay 350 dólares de diferencia que son flete y
--  seguro hasta Estados Unidos, no prima de origen. Interpolar entre esos dos
--  metería la logística dentro de lo que debería ser calidad del grano.
--
--  Por eso qué dos filas comparar deja de estar en el código: es un juicio de
--  Comercial y cambia según a qué mercado se venda.
-- ============================================================================

alter table public.ajustes_mercado
  add column if not exists texto text;

-- `valor` deja de ser obligatorio: hay ajustes que son texto y no número.
alter table public.ajustes_mercado
  alter column valor drop not null;

comment on column public.ajustes_mercado.texto is
  'Valor cuando el ajuste no es numérico (p. ej. qué fila del reporte usar).';

insert into public.ajustes_mercado (clave, texto, descripcion)
values
  (
    'ref_baja',
    'Peru Grade 1',
    'Fila del reporte de StoneX que hace de referencia baja del tramo. Debe compartir incoterm con ref_alta: comparar un FOB con un ExW mete el flete en el diferencial.'
  ),
  (
    'ref_alta',
    'Ecuador Grade 2 ExW US',
    'Fila del reporte que hace de referencia alta. Ecuador Grade 2 aparece en tres incoterms; se especifica ExW US para que coincida con Perú Grade 1.'
  )
on conflict (clave) do nothing;
