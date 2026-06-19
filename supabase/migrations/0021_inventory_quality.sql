-- ============================================================================
--  AROCO · 0021 — Inventory by quality / location (read-only snapshot)
--
--  Fed daily from the inventory sheet tab gid=1083634413 (procedencia by name,
--  location split, purchase value, quality breakdown, cadmio). It's a current
--  stock snapshot — each sync REPLACES the whole dataset via
--  replace_inventory_quality(). This is a separate view; it does NOT touch the
--  lot/remision/dispatch inventory that powers Despachos.
-- ============================================================================

create table public.inventory_quality (
  id                    uuid primary key default gen_random_uuid(),
  position              int  not null default 0,        -- sheet order, for display
  oc                    text,
  entry_date            date,
  procedencia           text not null,
  licor_kg              numeric(14,3) not null default 0,
  por_llegar_kg         numeric(14,3) not null default 0,
  tolimax_kg            numeric(14,3) not null default 0,
  en_bodega_kg          numeric(14,3) not null default 0,
  purchase_price_cop_kg numeric(14,2),
  qty_b_kg              numeric(14,3) not null default 0,
  qty_c_kg              numeric(14,3) not null default 0,
  qty_premium_kg        numeric(14,3) not null default 0,
  qty_organico_kg       numeric(14,3) not null default 0,
  cadmio                text,
  synced_at             timestamptz not null default now()
);

alter table public.inventory_quality enable row level security;

create policy "inventory_quality_select" on public.inventory_quality
  for select using (public.is_active_member());

-- Full-replace importer: the sheet is the source of truth for current stock.
create or replace function public.replace_inventory_quality(p_rows jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  delete from public.inventory_quality;
  insert into public.inventory_quality
    (position, oc, entry_date, procedencia, licor_kg, por_llegar_kg, tolimax_kg,
     en_bodega_kg, purchase_price_cop_kg, qty_b_kg, qty_c_kg, qty_premium_kg,
     qty_organico_kg, cadmio)
  select
    coalesce(r.position, 0), r.oc, r.entry_date, r.procedencia,
    coalesce(r.licor_kg, 0), coalesce(r.por_llegar_kg, 0), coalesce(r.tolimax_kg, 0),
    coalesce(r.en_bodega_kg, 0), r.purchase_price_cop_kg,
    coalesce(r.qty_b_kg, 0), coalesce(r.qty_c_kg, 0), coalesce(r.qty_premium_kg, 0),
    coalesce(r.qty_organico_kg, 0), r.cadmio
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
