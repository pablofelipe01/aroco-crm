-- ============================================================================
--  AROCO · 0041 — Recomposición del inventario (hoja reestructurada)
--
--  La hoja maestra de inventario cambió de estructura y el parser quedó leyendo
--  columnas equivocadas: las cantidades entraban en 0, la merma tomaba el valor
--  de ORGÁNICO y los bloques de salida (hoy 6 de 8 columnas, antes 5 de 4) caían
--  fuera de rango, dejando fechas dentro de `destination` y cifras dentro de
--  `remision_salida`.
--
--  Esta migración:
--    1. Amplía inventory_lots con todo lo que la hoja registra hoy y no tenía
--       dónde guardarse: ODC, recepción, bultos, cantidad solicitada, cadmio,
--       clasificación (premium/corriente/corriente C/orgánico) tanto ingresada
--       como disponible, selección (merma/pasilla) y medición de calidad.
--    2. Amplía dispatches con el desglose por clasificación y los bultos.
--    3. Purga por única vez los datos derivados de la hoja para recargarlos
--       limpios (las filas creadas por una persona en el CRM se conservan).
--    4. Reescribe import_inventory_sheet para que el sync sea autoritativo:
--       además de insertar/actualizar, borra las filas de hoja que ya no
--       existen en ella.
--
--  Modelo "filas manuales protegidas", igual que en 0040 para inventory_quality:
--    • source = 'sheet'  → la hoja manda, se refresca a diario.
--    • source = 'manual' → creado en el CRM, el sync no lo toca.
-- ============================================================================

-- ── 1. inventory_lots: columnas nuevas ───────────────────────────────────────
alter table public.inventory_lots
  add column if not exists source             text not null default 'sheet',
  add column if not exists odc                text,
  add column if not exists recepcion          text,
  add column if not exists bultos_in          numeric(12,2) not null default 0,
  add column if not exists bultos_out         numeric(12,2) not null default 0,
  add column if not exists bultos_total       numeric(12,2) not null default 0,
  add column if not exists qty_requested_kg   numeric(14,3),
  add column if not exists cadmio             text,
  -- Clasificación de lo que ingresó.
  add column if not exists qty_in_premium_kg      numeric(14,3) not null default 0,
  add column if not exists qty_in_corriente_kg    numeric(14,3) not null default 0,
  add column if not exists qty_in_corriente_c_kg  numeric(14,3) not null default 0,
  add column if not exists qty_in_organico_kg     numeric(14,3) not null default 0,
  -- Clasificación de lo que queda en bodega.
  add column if not exists qty_avail_premium_kg     numeric(14,3) not null default 0,
  add column if not exists qty_avail_corriente_kg   numeric(14,3) not null default 0,
  add column if not exists qty_avail_corriente_c_kg numeric(14,3) not null default 0,
  add column if not exists qty_avail_organico_kg    numeric(14,3) not null default 0,
  -- Selección.
  add column if not exists merma_kg     numeric(14,3) not null default 0,
  add column if not exists pasilla_kg   numeric(14,3) not null default 0,
  add column if not exists merma_pct    numeric(6,2),
  add column if not exists pasilla_pct  numeric(6,2),
  -- Ítems de evaluación (medición de calidad).
  add column if not exists pct_bien_fermentado           numeric(6,2),
  add column if not exists pct_parcialmente_fermentado   numeric(6,2),
  add column if not exists pct_pizarroso                 numeric(6,2),
  add column if not exists pct_purpura                   numeric(6,2),
  add column if not exists pct_sobre_fermentado          numeric(6,2),
  add column if not exists pct_hongos                    numeric(6,2),
  add column if not exists pct_humedad                   numeric(6,2),
  add column if not exists pct_fermentacion_total        numeric(6,2),
  add column if not exists indice_grano_100g             numeric(8,2);

comment on column public.inventory_lots.source is
  '''sheet'' = la hoja manda y el sync lo refresca; ''manual'' = creado en el CRM, intocable por el sync.';

-- Índice para la vista "solo disponible en bodega" (9 de 89 lotes hoy).
create index if not exists inventory_lots_available_idx
  on public.inventory_lots (qty_available_kg)
  where qty_available_kg > 0;

-- ── 2. dispatches: desglose por clasificación ────────────────────────────────
alter table public.dispatches
  add column if not exists qty_premium_kg     numeric(14,3) not null default 0,
  add column if not exists qty_corriente_kg   numeric(14,3) not null default 0,
  add column if not exists qty_corriente_c_kg numeric(14,3) not null default 0,
  add column if not exists qty_organico_kg    numeric(14,3) not null default 0,
  add column if not exists bultos             numeric(12,2);

-- En la hoja hay salidas registradas sin fecha (empresa y cantidad, sin día).
-- Guardarlas con la fecha de hoy las hacía aparecer como despachos recientes,
-- así que la columna pasa a admitir nulos y la UI muestra "—".
alter table public.dispatches
  alter column dispatch_date drop not null,
  alter column dispatch_date drop default;

-- ── 3. Purga por única vez — recarga desde cero ──────────────────────────────
-- Todo el contenido de lots venía de la hoja o del seed inicial del xlsx: no hay
-- lotes con precio, calidad, procedencia ni notas capturados a mano (verificado
-- antes de escribir esta migración). Los despachos que sí tienen un autor
-- (created_by not null) se conservan: esos los tecleó una persona en el CRM.
delete from public.dispatches where created_by is null;
delete from public.inventory_lots;

-- ── 4. import_inventory_sheet — importador autoritativo ──────────────────────
create or replace function public.import_inventory_sheet(
  p_lots       jsonb,
  p_dispatches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lots           int := 0;
  v_dispatches     int := 0;
  v_lots_deleted   int := 0;
  v_disp_deleted   int := 0;
begin
  -- Lotes: inserta o actualiza contra el índice único (code, remisión).
  with up as (
    insert into public.inventory_lots (
      code, entry_date, remision, odc, recepcion,
      qty_in_kg, qty_out_kg, qty_requested_kg,
      bultos_in, bultos_out, bultos_total,
      purchase_price_cop_kg, cadmio, quality,
      qty_in_premium_kg, qty_in_corriente_kg, qty_in_corriente_c_kg, qty_in_organico_kg,
      qty_avail_premium_kg, qty_avail_corriente_kg, qty_avail_corriente_c_kg, qty_avail_organico_kg,
      merma_kg, pasilla_kg, merma_pct, pasilla_pct,
      pct_bien_fermentado, pct_parcialmente_fermentado, pct_pizarroso, pct_purpura,
      pct_sobre_fermentado, pct_hongos, pct_humedad, pct_fermentacion_total,
      indice_grano_100g, samples_pasilla_merma_kg, source
    )
    select
      r.code, r.entry_date, r.remision, r.odc, r.recepcion,
      coalesce(r.qty_in_kg, 0), coalesce(r.qty_out_kg, 0), r.qty_requested_kg,
      coalesce(r.bultos_in, 0), coalesce(r.bultos_out, 0), coalesce(r.bultos_total, 0),
      r.purchase_price_cop_kg, r.cadmio, r.quality,
      coalesce(r.qty_in_premium_kg, 0), coalesce(r.qty_in_corriente_kg, 0),
      coalesce(r.qty_in_corriente_c_kg, 0), coalesce(r.qty_in_organico_kg, 0),
      coalesce(r.qty_avail_premium_kg, 0), coalesce(r.qty_avail_corriente_kg, 0),
      coalesce(r.qty_avail_corriente_c_kg, 0), coalesce(r.qty_avail_organico_kg, 0),
      coalesce(r.merma_kg, 0), coalesce(r.pasilla_kg, 0), r.merma_pct, r.pasilla_pct,
      r.pct_bien_fermentado, r.pct_parcialmente_fermentado, r.pct_pizarroso, r.pct_purpura,
      r.pct_sobre_fermentado, r.pct_hongos, r.pct_humedad, r.pct_fermentacion_total,
      r.indice_grano_100g,
      coalesce(r.merma_kg, 0) + coalesce(r.pasilla_kg, 0),
      'sheet'
    from jsonb_to_recordset(p_lots) as r(
      code                        text,
      entry_date                  date,
      remision                    text,
      odc                         text,
      recepcion                   text,
      qty_in_kg                   numeric,
      qty_out_kg                  numeric,
      qty_requested_kg            numeric,
      bultos_in                   numeric,
      bultos_out                  numeric,
      bultos_total                numeric,
      purchase_price_cop_kg       numeric,
      cadmio                      text,
      quality                     text,
      qty_in_premium_kg           numeric,
      qty_in_corriente_kg         numeric,
      qty_in_corriente_c_kg       numeric,
      qty_in_organico_kg          numeric,
      qty_avail_premium_kg        numeric,
      qty_avail_corriente_kg      numeric,
      qty_avail_corriente_c_kg    numeric,
      qty_avail_organico_kg       numeric,
      merma_kg                    numeric,
      pasilla_kg                  numeric,
      merma_pct                   numeric,
      pasilla_pct                 numeric,
      pct_bien_fermentado         numeric,
      pct_parcialmente_fermentado numeric,
      pct_pizarroso               numeric,
      pct_purpura                 numeric,
      pct_sobre_fermentado        numeric,
      pct_hongos                  numeric,
      pct_humedad                 numeric,
      pct_fermentacion_total      numeric,
      indice_grano_100g           numeric
    )
    where r.code is not null and r.code <> ''
    on conflict (code, coalesce(remision, '')) do update set
      entry_date               = excluded.entry_date,
      odc                      = excluded.odc,
      recepcion                = excluded.recepcion,
      qty_in_kg                = excluded.qty_in_kg,
      qty_out_kg               = excluded.qty_out_kg,
      qty_requested_kg         = excluded.qty_requested_kg,
      bultos_in                = excluded.bultos_in,
      bultos_out               = excluded.bultos_out,
      bultos_total             = excluded.bultos_total,
      purchase_price_cop_kg    = excluded.purchase_price_cop_kg,
      cadmio                   = excluded.cadmio,
      quality                  = excluded.quality,
      qty_in_premium_kg        = excluded.qty_in_premium_kg,
      qty_in_corriente_kg      = excluded.qty_in_corriente_kg,
      qty_in_corriente_c_kg    = excluded.qty_in_corriente_c_kg,
      qty_in_organico_kg       = excluded.qty_in_organico_kg,
      qty_avail_premium_kg     = excluded.qty_avail_premium_kg,
      qty_avail_corriente_kg   = excluded.qty_avail_corriente_kg,
      qty_avail_corriente_c_kg = excluded.qty_avail_corriente_c_kg,
      qty_avail_organico_kg    = excluded.qty_avail_organico_kg,
      merma_kg                 = excluded.merma_kg,
      pasilla_kg               = excluded.pasilla_kg,
      merma_pct                = excluded.merma_pct,
      pasilla_pct              = excluded.pasilla_pct,
      pct_bien_fermentado         = excluded.pct_bien_fermentado,
      pct_parcialmente_fermentado = excluded.pct_parcialmente_fermentado,
      pct_pizarroso               = excluded.pct_pizarroso,
      pct_purpura                 = excluded.pct_purpura,
      pct_sobre_fermentado        = excluded.pct_sobre_fermentado,
      pct_hongos                  = excluded.pct_hongos,
      pct_humedad                 = excluded.pct_humedad,
      pct_fermentacion_total      = excluded.pct_fermentacion_total,
      indice_grano_100g           = excluded.indice_grano_100g,
      samples_pasilla_merma_kg    = excluded.samples_pasilla_merma_kg
    -- Un lote pasado a 'manual' deja de ser refrescado por la hoja.
    where public.inventory_lots.source = 'sheet'
    returning 1
  )
  select count(*) into v_lots from up;

  -- Despachos: una fila por bloque SALIDA con cantidad, clave estable por lote.
  with up as (
    insert into public.dispatches (
      source, source_key, dispatch_date, destination, qty_kg,
      qty_premium_kg, qty_corriente_kg, qty_corriente_c_kg, qty_organico_kg,
      bultos, remision_salida, remision_entrada, origin, lot_id, needs_review
    )
    select
      'sheet', r.source_key, r.dispatch_date, r.destination, r.qty_kg,
      coalesce(r.qty_premium_kg, 0), coalesce(r.qty_corriente_kg, 0),
      coalesce(r.qty_corriente_c_kg, 0), coalesce(r.qty_organico_kg, 0),
      r.bultos, r.remision_salida, r.remision_entrada, r.origin,
      -- lot_id se deja nulo a propósito: el trigger dispatches_to_movement
      -- generaría un movimiento de salida que volvería a descontar lo que la
      -- hoja ya descontó (ver 0018). La trazabilidad va por origin + remisión.
      null, false
    from jsonb_to_recordset(p_dispatches) as r(
      source_key         text,
      dispatch_date      date,
      destination        text,
      qty_kg             numeric,
      qty_premium_kg     numeric,
      qty_corriente_kg   numeric,
      qty_corriente_c_kg numeric,
      qty_organico_kg    numeric,
      bultos             numeric,
      remision_salida    text,
      remision_entrada   text,
      origin             text
    )
    where r.source_key is not null and coalesce(r.qty_kg, 0) > 0
    on conflict (source_key) do update set
      dispatch_date      = excluded.dispatch_date,
      destination        = excluded.destination,
      qty_kg             = excluded.qty_kg,
      qty_premium_kg     = excluded.qty_premium_kg,
      qty_corriente_kg   = excluded.qty_corriente_kg,
      qty_corriente_c_kg = excluded.qty_corriente_c_kg,
      qty_organico_kg    = excluded.qty_organico_kg,
      bultos             = excluded.bultos,
      remision_salida    = excluded.remision_salida,
      remision_entrada   = excluded.remision_entrada,
      origin             = excluded.origin
    returning 1
  )
  select count(*) into v_dispatches from up;

  -- Barrido: lo que desapareció de la hoja desaparece del CRM. Sin esto, una
  -- fila borrada en la hoja o una salida anulada quedaban para siempre.
  delete from public.dispatches d
  where d.source = 'sheet'
    and d.source_key is not null
    and not exists (
      select 1
      from jsonb_to_recordset(p_dispatches) as r(source_key text)
      where r.source_key = d.source_key
    );
  get diagnostics v_disp_deleted = row_count;

  delete from public.inventory_lots l
  where l.source = 'sheet'
    and not exists (
      select 1
      from jsonb_to_recordset(p_lots) as r(code text, remision text)
      where r.code = l.code
        and coalesce(r.remision, '') = coalesce(l.remision, '')
    );
  get diagnostics v_lots_deleted = row_count;

  return jsonb_build_object(
    'lots', v_lots,
    'dispatches', v_dispatches,
    'lots_deleted', v_lots_deleted,
    'dispatches_deleted', v_disp_deleted
  );
end;
$$;

revoke execute on function public.import_inventory_sheet(jsonb, jsonb)
  from anon, authenticated;
grant  execute on function public.import_inventory_sheet(jsonb, jsonb)
  to service_role;
