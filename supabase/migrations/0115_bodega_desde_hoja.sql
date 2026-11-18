-- ============================================================================
--  0115 · Bodega física desde la hoja
--
--  Acta 2026-11-17: el tablero listaba el inventario por la región de ORIGEN
--  del grano y no por la bodega donde está. 888 kg de CISCA (Caloto, Cauca,
--  recepción 2439) están en Bogotá y salían bajo Cauca. La causa es 0114: el
--  archivo no dice dónde está el grano y la regla lo adivinaba por el
--  departamento de origen.
--
--  Decisión de Pablo (2026-11-18): la hoja trae una columna «BODEGA»
--  (Cauca / Bogotá / Nilo) y el sync la lee en `bodega_hoja`. Prioridad:
--    1. bodega elegida a mano en el CRM (bodega_por no nulo)
--    2. bodega_hoja (lo que dice el archivo)
--    3. la regla por origen de 0114 — solo como estimado; la vista lo marca
--       «por confirmar»
--  Mientras la columna no exista en la hoja, bodega_hoja llega nula y todo
--  sigue como antes.
-- ============================================================================

alter table public.inventory_lots
  add column if not exists bodega_hoja text
    check (bodega_hoja is null or bodega_hoja in ('cauca', 'bogota', 'nilo'));

comment on column public.inventory_lots.bodega_hoja is
  'Bodega física según la columna BODEGA del archivo (0115). Gana sobre la regla por origen; pierde contra una elección a mano (bodega_por).';

create or replace function public.inventario_tr_bodega()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.bodega_por is null then
    new.bodega := coalesce(new.bodega_hoja,
                           public.inventario_bodega_por_origen(new.departamento, new.code));
  end if;
  return new;
end;
$$;

drop trigger if exists inventario_bodega_auto on public.inventory_lots;
create trigger inventario_bodega_auto
  before insert or update of departamento, code, bodega, bodega_por, bodega_hoja
  on public.inventory_lots
  for each row execute function public.inventario_tr_bodega();

create or replace function public.import_inventory_sheet(p_lots jsonb, p_dispatches jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_lots int := 0; v_dispatches int := 0; v_lots_deleted int := 0; v_disp_deleted int := 0;
begin
  with up as (
    insert into public.inventory_lots (
      code, clase, codigo_nuevo, proveedor, departamento, municipio,
      entry_date, remision, odc, recepcion, qty_in_kg, qty_out_kg, qty_requested_kg,
      bultos_in, bultos_out, bultos_total, purchase_price_cop_kg, cadmio, quality,
      qty_in_premium_kg, qty_in_estandar_kg, qty_in_corriente_kg, qty_in_corriente_c_kg,
      qty_in_fairtrade_kg, qty_in_rainforest_kg, qty_in_organico_kg, qty_in_pasilla_kg,
      qty_avail_premium_kg, qty_avail_estandar_kg, qty_avail_corriente_kg, qty_avail_corriente_c_kg,
      qty_avail_fairtrade_kg, qty_avail_rainforest_kg, qty_avail_organico_kg, qty_avail_pasilla_kg,
      merma_kg, pasilla_kg, merma_pct, pasilla_pct,
      pct_bien_fermentado, pct_parcialmente_fermentado, pct_pizarroso, pct_purpura,
      pct_sobre_fermentado, pct_hongos, pct_humedad, pct_fermentacion_total,
      indice_grano_100g, samples_pasilla_merma_kg, source, bodega_hoja)
    select r.code, coalesce(r.clase, ''), r.codigo_nuevo, r.proveedor, r.departamento, r.municipio,
      r.entry_date, r.remision, r.odc, r.recepcion,
      coalesce(r.qty_in_kg,0), coalesce(r.qty_out_kg,0), r.qty_requested_kg,
      coalesce(r.bultos_in,0), coalesce(r.bultos_out,0), coalesce(r.bultos_total,0),
      r.purchase_price_cop_kg, r.cadmio, r.quality,
      coalesce(r.qty_in_premium_kg,0), coalesce(r.qty_in_estandar_kg,0),
      coalesce(r.qty_in_corriente_kg,0), coalesce(r.qty_in_corriente_c_kg,0),
      coalesce(r.qty_in_fairtrade_kg,0), coalesce(r.qty_in_rainforest_kg,0),
      coalesce(r.qty_in_organico_kg,0), coalesce(r.qty_in_pasilla_kg,0),
      coalesce(r.qty_avail_premium_kg,0), coalesce(r.qty_avail_estandar_kg,0),
      coalesce(r.qty_avail_corriente_kg,0), coalesce(r.qty_avail_corriente_c_kg,0),
      coalesce(r.qty_avail_fairtrade_kg,0), coalesce(r.qty_avail_rainforest_kg,0),
      coalesce(r.qty_avail_organico_kg,0), coalesce(r.qty_avail_pasilla_kg,0),
      coalesce(r.merma_kg,0), coalesce(r.pasilla_kg,0), r.merma_pct, r.pasilla_pct,
      r.pct_bien_fermentado, r.pct_parcialmente_fermentado, r.pct_pizarroso, r.pct_purpura,
      r.pct_sobre_fermentado, r.pct_hongos, r.pct_humedad, r.pct_fermentacion_total,
      r.indice_grano_100g, coalesce(r.merma_kg,0)+coalesce(r.pasilla_kg,0), 'sheet',
      case when r.bodega_hoja in ('cauca','bogota','nilo') then r.bodega_hoja end
    from jsonb_to_recordset(p_lots) as r(
      code text, clase text, codigo_nuevo text, proveedor text, departamento text, municipio text,
      entry_date date, remision text, odc text, recepcion text,
      qty_in_kg numeric, qty_out_kg numeric, qty_requested_kg numeric,
      bultos_in numeric, bultos_out numeric, bultos_total numeric,
      purchase_price_cop_kg numeric, cadmio text, quality text,
      qty_in_premium_kg numeric, qty_in_estandar_kg numeric, qty_in_corriente_kg numeric,
      qty_in_corriente_c_kg numeric, qty_in_fairtrade_kg numeric, qty_in_rainforest_kg numeric,
      qty_in_organico_kg numeric, qty_in_pasilla_kg numeric,
      qty_avail_premium_kg numeric, qty_avail_estandar_kg numeric, qty_avail_corriente_kg numeric,
      qty_avail_corriente_c_kg numeric, qty_avail_fairtrade_kg numeric, qty_avail_rainforest_kg numeric,
      qty_avail_organico_kg numeric, qty_avail_pasilla_kg numeric,
      merma_kg numeric, pasilla_kg numeric, merma_pct numeric, pasilla_pct numeric,
      pct_bien_fermentado numeric, pct_parcialmente_fermentado numeric, pct_pizarroso numeric,
      pct_purpura numeric, pct_sobre_fermentado numeric, pct_hongos numeric,
      pct_humedad numeric, pct_fermentacion_total numeric, indice_grano_100g numeric,
      bodega_hoja text)
    where r.code is not null and r.code <> ''
    on conflict (code, coalesce(remision,''), coalesce(recepcion,''), clase) do update set
      codigo_nuevo=excluded.codigo_nuevo, proveedor=excluded.proveedor,
      departamento=excluded.departamento, municipio=excluded.municipio,
      entry_date=excluded.entry_date, odc=excluded.odc,
      qty_in_kg=excluded.qty_in_kg, qty_out_kg=excluded.qty_out_kg,
      qty_requested_kg=excluded.qty_requested_kg, bultos_in=excluded.bultos_in,
      bultos_out=excluded.bultos_out, bultos_total=excluded.bultos_total,
      purchase_price_cop_kg=excluded.purchase_price_cop_kg, cadmio=excluded.cadmio,
      quality=excluded.quality,
      qty_in_premium_kg=excluded.qty_in_premium_kg, qty_in_estandar_kg=excluded.qty_in_estandar_kg,
      qty_in_corriente_kg=excluded.qty_in_corriente_kg, qty_in_corriente_c_kg=excluded.qty_in_corriente_c_kg,
      qty_in_fairtrade_kg=excluded.qty_in_fairtrade_kg, qty_in_rainforest_kg=excluded.qty_in_rainforest_kg,
      qty_in_organico_kg=excluded.qty_in_organico_kg, qty_in_pasilla_kg=excluded.qty_in_pasilla_kg,
      qty_avail_premium_kg=excluded.qty_avail_premium_kg, qty_avail_estandar_kg=excluded.qty_avail_estandar_kg,
      qty_avail_corriente_kg=excluded.qty_avail_corriente_kg,
      qty_avail_corriente_c_kg=excluded.qty_avail_corriente_c_kg,
      qty_avail_fairtrade_kg=excluded.qty_avail_fairtrade_kg,
      qty_avail_rainforest_kg=excluded.qty_avail_rainforest_kg,
      qty_avail_organico_kg=excluded.qty_avail_organico_kg,
      qty_avail_pasilla_kg=excluded.qty_avail_pasilla_kg,
      merma_kg=excluded.merma_kg, pasilla_kg=excluded.pasilla_kg,
      merma_pct=excluded.merma_pct, pasilla_pct=excluded.pasilla_pct,
      pct_bien_fermentado=excluded.pct_bien_fermentado,
      pct_parcialmente_fermentado=excluded.pct_parcialmente_fermentado,
      pct_pizarroso=excluded.pct_pizarroso, pct_purpura=excluded.pct_purpura,
      pct_sobre_fermentado=excluded.pct_sobre_fermentado, pct_hongos=excluded.pct_hongos,
      pct_humedad=excluded.pct_humedad, pct_fermentacion_total=excluded.pct_fermentacion_total,
      indice_grano_100g=excluded.indice_grano_100g,
      samples_pasilla_merma_kg=excluded.samples_pasilla_merma_kg,
      bodega_hoja=excluded.bodega_hoja
    where public.inventory_lots.source = 'sheet'
    returning 1)
  select count(*) into v_lots from up;

  with src as (
    select r.*,
      (select l.id from public.inventory_lots l
        where l.code = r.lot_code and coalesce(l.remision,'') = coalesce(r.lot_remision,'')
          and coalesce(l.recepcion,'') = coalesce(r.lot_recepcion,'')
          and l.clase = coalesce(r.lot_clase,'')) as lote_id
    from jsonb_to_recordset(p_dispatches) as r(
      source_key text, dispatch_date date, destination text, oc text, qty_kg numeric,
      qty_premium_kg numeric, qty_estandar_kg numeric, qty_corriente_kg numeric,
      qty_corriente_c_kg numeric, qty_fairtrade_kg numeric, qty_rainforest_kg numeric,
      qty_organico_kg numeric, qty_pasilla_kg numeric, bultos numeric, remision_salida text,
      remision_entrada text, origin text, purchase_price_cop_kg numeric,
      lot_code text, lot_remision text, lot_recepcion text, lot_clase text)
    where r.source_key is not null and coalesce(r.qty_kg,0) > 0),
  up as (
    insert into public.dispatches (
      source, source_key, dispatch_date, destination, oc, qty_kg,
      qty_premium_kg, qty_estandar_kg, qty_corriente_kg, qty_corriente_c_kg,
      qty_fairtrade_kg, qty_rainforest_kg, qty_organico_kg, qty_pasilla_kg,
      bultos, remision_salida, remision_entrada, origin, purchase_price_cop_kg,
      lot_id, lote_origen_id, needs_review)
    select 'sheet', s.source_key, s.dispatch_date, s.destination, s.oc, s.qty_kg,
      coalesce(s.qty_premium_kg,0), coalesce(s.qty_estandar_kg,0),
      coalesce(s.qty_corriente_kg,0), coalesce(s.qty_corriente_c_kg,0),
      coalesce(s.qty_fairtrade_kg,0), coalesce(s.qty_rainforest_kg,0),
      coalesce(s.qty_organico_kg,0), coalesce(s.qty_pasilla_kg,0),
      s.bultos, s.remision_salida, s.remision_entrada, s.origin,
      s.purchase_price_cop_kg, null, s.lote_id, false
    from src s
    on conflict (source_key) do update set
      dispatch_date=excluded.dispatch_date, destination=excluded.destination, oc=excluded.oc,
      qty_kg=excluded.qty_kg, qty_premium_kg=excluded.qty_premium_kg,
      qty_estandar_kg=excluded.qty_estandar_kg, qty_corriente_kg=excluded.qty_corriente_kg,
      qty_corriente_c_kg=excluded.qty_corriente_c_kg, qty_fairtrade_kg=excluded.qty_fairtrade_kg,
      qty_rainforest_kg=excluded.qty_rainforest_kg, qty_organico_kg=excluded.qty_organico_kg,
      qty_pasilla_kg=excluded.qty_pasilla_kg, bultos=excluded.bultos,
      remision_salida=excluded.remision_salida, remision_entrada=excluded.remision_entrada,
      origin=excluded.origin, lote_origen_id=excluded.lote_origen_id,
      purchase_price_cop_kg = coalesce(excluded.purchase_price_cop_kg,
                                       public.dispatches.purchase_price_cop_kg)
    returning 1)
  select count(*) into v_dispatches from up;

  delete from public.dispatches d
  where d.source='sheet' and d.source_key is not null
    and not exists (select 1 from jsonb_to_recordset(p_dispatches) as r(source_key text)
                    where r.source_key = d.source_key);
  get diagnostics v_disp_deleted = row_count;

  -- Con la clave COMPLETA. La anterior comparaba solo código y remisión, así
  -- que un lote cuya recepción cambiaba nunca se borraba.
  delete from public.inventory_lots l
  where l.source='sheet'
    and not exists (
      select 1 from jsonb_to_recordset(p_lots) as r(code text, remision text, recepcion text, clase text)
      where r.code = l.code and coalesce(r.remision,'') = coalesce(l.remision,'')
        and coalesce(r.recepcion,'') = coalesce(l.recepcion,'')
        and coalesce(r.clase,'') = l.clase);
  get diagnostics v_lots_deleted = row_count;

  return jsonb_build_object('lots', v_lots, 'dispatches', v_dispatches,
    'lots_deleted', v_lots_deleted, 'dispatches_deleted', v_disp_deleted);
end;
$$;

revoke execute on function public.import_inventory_sheet(jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.import_inventory_sheet(jsonb, jsonb) to service_role;
