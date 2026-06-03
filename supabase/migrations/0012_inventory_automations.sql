-- ============================================================================
--  AROCO · 0012 — Inventory automations (SPEC §10)
--
--   • Lot invariant: qty_available_kg = qty_in_kg − qty_out_kg.
--   • Each inventory_movement adjusts its parent lot's totals (entrada→in,
--     salida→out) as a delta, which re-triggers the invariant.
--   • A dispatch linked to a lot auto-generates the corresponding 'salida'
--     movement (which then discounts the lot).
--
--  The movement/dispatch trigger functions are SECURITY DEFINER so a user who
--  may create a dispatch (Comercial) but not write movements directly still
--  produces the ledger entry; the logic itself is controlled here.
-- ============================================================================

-- Invariant: available = in − out (recomputed on any quantity change).
create or replace function public.lot_recompute_available()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.qty_available_kg := coalesce(new.qty_in_kg, 0) - coalesce(new.qty_out_kg, 0);
  return new;
end;
$$;

create trigger lots_recompute_available
  before insert or update of qty_in_kg, qty_out_kg on public.inventory_lots
  for each row execute function public.lot_recompute_available();

-- Apply a movement (or its reversal/change) to the parent lot totals.
create or replace function public.movement_apply_to_lot()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta_in  numeric := 0;
  delta_out numeric := 0;
begin
  if (tg_op = 'UPDATE' or tg_op = 'DELETE') then
    if old.kind = 'entrada' then delta_in := delta_in - old.qty_kg;
    else delta_out := delta_out - old.qty_kg; end if;
  end if;
  if (tg_op = 'INSERT' or tg_op = 'UPDATE') then
    if new.kind = 'entrada' then delta_in := delta_in + new.qty_kg;
    else delta_out := delta_out + new.qty_kg; end if;
  end if;

  update public.inventory_lots
    set qty_in_kg  = coalesce(qty_in_kg, 0)  + delta_in,
        qty_out_kg = coalesce(qty_out_kg, 0) + delta_out
    where id = coalesce(new.lot_id, old.lot_id);

  return coalesce(new, old);
end;
$$;

create trigger movements_apply_to_lot
  after insert or update or delete on public.inventory_movements
  for each row execute function public.movement_apply_to_lot();

-- A dispatch linked to a lot generates its 'salida' movement.
create or replace function public.dispatch_to_movement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.lot_id is not null then
    insert into public.inventory_movements
      (lot_id, date, kind, remision, company, qty_kg, notes, created_by)
    values
      (new.lot_id, new.dispatch_date, 'salida', new.remision_salida,
       new.destination, new.qty_kg, 'Generado por despacho', new.created_by);
  end if;
  return new;
end;
$$;

create trigger dispatches_to_movement
  after insert on public.dispatches
  for each row execute function public.dispatch_to_movement();

-- Internal triggers shouldn't be RPC-callable by anon.
revoke execute on function public.movement_apply_to_lot() from anon, authenticated;
revoke execute on function public.dispatch_to_movement() from anon, authenticated;
revoke execute on function public.lot_recompute_available() from anon, authenticated;
