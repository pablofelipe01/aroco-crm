-- ============================================================================
--  AROCO · 0061 — La recepción entra en la identidad del lote
--
--  El sync de inventario lleva fallando desde el 22-ago, todos los días, con:
--
--      ON CONFLICT DO UPDATE command cannot affect row a second time
--
--  Postgres se niega a que un mismo upsert toque la misma fila dos veces. La
--  clave era (código, remisión) y en la hoja apareció un caso que no encaja:
--
--      COL-MET-GRA-210826(DELEITE), remisión 24
--        ODC 57 · recepción 2414 · 4.499,8 kg
--        ODC 65 · recepción 2415 ·   496,8 kg
--        ODC 64 · recepción 2416 ·      50 kg
--
--  No son un duplicado ni un error de digitación: son tres recepciones
--  distintas, con su ODC y su número de recepción, que llegaron bajo la misma
--  remisión. La clave anterior no podía representarlas.
--
--  Que se cayera fue lo mejor que pudo pasar. Sin la protección de Postgres, el
--  upsert habría dejado una sola de las tres —la última— y el inventario habría
--  perdido 4.996,6 kg en silencio, que es mucho peor que quedarse quieto.
--
--  Con la recepción en la clave, las 110 filas de la hoja dan 110 lotes únicos.
--  Las 65 filas sin recepción siguen resolviéndose por (código, remisión) como
--  hasta ahora, porque coalesce las deja en cadena vacía.
-- ============================================================================

drop index if exists public.inventory_lots_code_remision_key;

create unique index if not exists inventory_lots_code_remision_recepcion_key
  on public.inventory_lots (code, coalesce(remision, ''), coalesce(recepcion, ''));

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
    on conflict (code, coalesce(remision, ''), coalesce(recepcion, '')) do update set
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
