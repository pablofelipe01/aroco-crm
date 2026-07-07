-- ============================================================================
--  AROCO · 0039 — Operaciones puede escribir en Inventario y Despachos
-- ============================================================================
-- Agrega 'Operaciones' a las políticas RLS de escritura de inventory_lots,
-- inventory_movements y dispatches (antes solo Bodega/Administrativo/Comercial).
-- Los WRITE_DEPTS del UI se ajustan en paralelo en las páginas correspondientes.

drop policy if exists "inventory_lots_write" on public.inventory_lots;
create policy "inventory_lots_write" on public.inventory_lots
  for all to authenticated
  using (public.can_write(array['Bodega Central','Administrativo','Operaciones']::public.department[]))
  with check (public.can_write(array['Bodega Central','Administrativo','Operaciones']::public.department[]));

drop policy if exists "inventory_movements_write" on public.inventory_movements;
create policy "inventory_movements_write" on public.inventory_movements
  for all to authenticated
  using (public.can_write(array['Bodega Central','Administrativo','Operaciones']::public.department[]))
  with check (public.can_write(array['Bodega Central','Administrativo','Operaciones']::public.department[]));

drop policy if exists "dispatches_write" on public.dispatches;
create policy "dispatches_write" on public.dispatches
  for all to authenticated
  using (public.can_write(array['Bodega Central','Comercial','Operaciones']::public.department[]))
  with check (public.can_write(array['Bodega Central','Comercial','Operaciones']::public.department[]));
