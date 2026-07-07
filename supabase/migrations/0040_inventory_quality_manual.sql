-- ============================================================================
--  AROCO · 0040 — Edición manual en Inventario por calidad
-- ============================================================================
-- Se permite crear/editar/borrar filas MANUALES desde el CRM sin que el sync
-- diario las pise. Modelo "filas manuales protegidas":
--   • source = 'sheet'  → vienen de la hoja, solo lectura, se refrescan a diario.
--   • source = 'manual' → creadas/editadas en el CRM; el sync no las toca.
-- Escritura de filas manuales: Bodega Central / Administrativo / Operaciones.

alter table public.inventory_quality
  add column if not exists source text not null default 'sheet';

-- El importador ahora reemplaza SOLO las filas de la hoja; conserva las manuales.
create or replace function public.replace_inventory_quality(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.inventory_quality where source = 'sheet';
  insert into public.inventory_quality
    (position, oc, entry_date, procedencia, licor_kg, por_llegar_kg, tolimax_kg,
     en_bodega_kg, purchase_price_cop_kg, qty_b_kg, qty_c_kg, qty_premium_kg,
     qty_organico_kg, cadmio, source)
  select
    coalesce(r.position, 0), r.oc, r.entry_date, r.procedencia,
    coalesce(r.licor_kg, 0), coalesce(r.por_llegar_kg, 0), coalesce(r.tolimax_kg, 0),
    coalesce(r.en_bodega_kg, 0), r.purchase_price_cop_kg,
    coalesce(r.qty_b_kg, 0), coalesce(r.qty_c_kg, 0), coalesce(r.qty_premium_kg, 0),
    coalesce(r.qty_organico_kg, 0), r.cadmio, 'sheet'
  from jsonb_to_recordset(p_rows) as r(
    position              int,
    oc                    text,
    entry_date            date,
    procedencia           text,
    licor_kg              numeric,
    por_llegar_kg         numeric,
    tolimax_kg            numeric,
    en_bodega_kg          numeric,
    purchase_price_cop_kg numeric,
    qty_b_kg              numeric,
    qty_c_kg              numeric,
    qty_premium_kg        numeric,
    qty_organico_kg       numeric,
    cadmio                text
  )
  where r.procedencia is not null and r.procedencia <> '';
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke execute on function public.replace_inventory_quality(jsonb)
  from anon, authenticated;
grant execute on function public.replace_inventory_quality(jsonb) to service_role;

-- ── Escritura solo de filas manuales (Bodega / Administrativo / Operaciones) ──
create policy "inventory_quality_manual_insert" on public.inventory_quality
  for insert to authenticated
  with check (
    source = 'manual'
    and public.can_write(array['Bodega Central','Administrativo','Operaciones']::public.department[])
  );

create policy "inventory_quality_manual_update" on public.inventory_quality
  for update to authenticated
  using (
    source = 'manual'
    and public.can_write(array['Bodega Central','Administrativo','Operaciones']::public.department[])
  )
  with check (
    source = 'manual'
    and public.can_write(array['Bodega Central','Administrativo','Operaciones']::public.department[])
  );

create policy "inventory_quality_manual_delete" on public.inventory_quality
  for delete to authenticated
  using (
    source = 'manual'
    and public.can_write(array['Bodega Central','Administrativo','Operaciones']::public.department[])
  );
