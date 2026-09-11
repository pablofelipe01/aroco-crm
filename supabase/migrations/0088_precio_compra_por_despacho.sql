-- ============================================================================
--  AROCO · 0088 — El precio de compra, en el despacho
--
--  Es la pieza que le falta al CRM para liquidar las comisiones por su cuenta
--  en vez de copiarlas de la hoja (0087). La comisión es un porcentaje de la
--  UTILIDAD, y la utilidad de una operación es lo que se vendió menos lo que
--  costó. Lo vendido ya está en `ventas`; lo que costó no estaba en ninguna
--  parte al nivel de la salida.
--
--  LO QUE HABÍA Y NO SERVÍA. `dispatches.purchase_price_cop_kg` existe desde
--  0006 y está en null en los 191 despachos. `dispatches.lot_id` también, y
--  ESE SE QUEDA EN NULL A PROPÓSITO: ponerlo dispara `dispatches_to_movement`,
--  que genera un movimiento de salida y volvería a descontar lo que la hoja ya
--  descontó (ver 0018). No es un olvido, es una decisión que sigue en pie.
--
--  POR QUÉ NO SE DEDUCE CRUZANDO. Cruzar `origin` con el código del lote
--  parece obvio y es una trampa: el 21-ago hay TRES lotes con el código
--  `COL-MET-GRA-210826(DELEITE)`, misma fecha y misma remisión, con precios de
--  13.435, 14.890 y 18.700. Se distinguen solo por la recepción. Un cruce por
--  código elegiría uno al azar y la utilidad saldría hasta un 40 % desviada.
--
--  Así que el precio se COPIA de la misma fila de la hoja de la que salen el
--  lote y sus despachos. Ahí no hay nada que adivinar.
-- ============================================================================

comment on column public.dispatches.purchase_price_cop_kg is
  'COP/kg que costó el cacao de este despacho. Viene del «VALOR DE COMPRA» del lote, por la misma fila de la hoja.';

-- ── La RPC del sync, ahora con el precio ────────────────────────────────────
create or replace function public.import_inventory_sheet(p_lots jsonb, p_dispatches jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lots           int := 0;
  v_dispatches     int := 0;
  v_lots_deleted   int := 0;
  v_disp_deleted   int := 0;
begin
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
    where public.inventory_lots.source = 'sheet'
    returning 1
  )
  select count(*) into v_lots from up;

  with up as (
    insert into public.dispatches (
      source, source_key, dispatch_date, destination, qty_kg,
      qty_premium_kg, qty_corriente_kg, qty_corriente_c_kg, qty_organico_kg,
      bultos, remision_salida, remision_entrada, origin,
      purchase_price_cop_kg, lot_id, needs_review
    )
    select
      'sheet', r.source_key, r.dispatch_date, r.destination, r.qty_kg,
      coalesce(r.qty_premium_kg, 0), coalesce(r.qty_corriente_kg, 0),
      coalesce(r.qty_corriente_c_kg, 0), coalesce(r.qty_organico_kg, 0),
      r.bultos, r.remision_salida, r.remision_entrada, r.origin,
      -- El precio viene de la MISMA fila de la hoja que el lote: no hay que
      -- cruzar nada y por tanto no hay nada que equivocar.
      r.purchase_price_cop_kg,
      -- lot_id se deja nulo a propósito: el trigger dispatches_to_movement
      -- generaría un movimiento de salida que volvería a descontar lo que la
      -- hoja ya descontó (ver 0018). La trazabilidad va por origin + remisión.
      null, false
    from jsonb_to_recordset(p_dispatches) as r(
      source_key            text,
      dispatch_date         date,
      destination           text,
      qty_kg                numeric,
      qty_premium_kg        numeric,
      qty_corriente_kg      numeric,
      qty_corriente_c_kg    numeric,
      qty_organico_kg       numeric,
      bultos                numeric,
      remision_salida       text,
      remision_entrada      text,
      origin                text,
      purchase_price_cop_kg numeric
    )
    where r.source_key is not null and coalesce(r.qty_kg, 0) > 0
    on conflict (source_key) do update set
      dispatch_date         = excluded.dispatch_date,
      destination           = excluded.destination,
      qty_kg                = excluded.qty_kg,
      qty_premium_kg        = excluded.qty_premium_kg,
      qty_corriente_kg      = excluded.qty_corriente_kg,
      qty_corriente_c_kg    = excluded.qty_corriente_c_kg,
      qty_organico_kg       = excluded.qty_organico_kg,
      bultos                = excluded.bultos,
      remision_salida       = excluded.remision_salida,
      remision_entrada      = excluded.remision_entrada,
      origin                = excluded.origin,
      purchase_price_cop_kg = excluded.purchase_price_cop_kg
    returning 1
  )
  select count(*) into v_dispatches from up;

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
$function$;

-- ── Rescate de lo existente ─────────────────────────────────────────────────
--
--  Los despachos ya guardados se rellenan desde su lote, emparejando por
--  CÓDIGO Y RECEPCIÓN. La recepción sale de la propia `source_key`, que la
--  0061 metió ahí con el formato `código#remisión#recepción#sN`. Es lo que
--  permite acertar con el lote correcto entre los tres del 21-ago.
--
--  OJO CON EL PARSEO: el código PUEDE CONTENER «#» —«CISCA ruta #1»— así que
--  contar campos desde la izquierda sale desviado tantas posiciones como
--  almohadillas tenga el código, y se acaba leyendo la remisión donde debería
--  ir la recepción. Se quita el prefijo conocido (el propio `origin`) y lo que
--  queda sí es «remisión#recepción#sN», pase lo que pase con el código.
update public.dispatches d
set purchase_price_cop_kg = l.purchase_price_cop_kg
from public.inventory_lots l
where d.source = 'sheet'
  and d.purchase_price_cop_kg is null
  and l.purchase_price_cop_kg is not null
  and l.code = d.origin
  and coalesce(l.recepcion, '') = coalesce(
        split_part(substring(d.source_key from length(d.origin) + 2), '#', 2), '');
