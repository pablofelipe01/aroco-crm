-- ============================================================================
--  0114 · Bodega automática por departamento de origen
--
--  Pedido de Pablo (2026-11-06): la bodega se asigna sola. Regla elegida:
--    Cauca                  → Cauca
--    Cundinamarca y Tolima  → Nilo
--    todo lo demás          → Bogotá
--  Sin departamento, se mira el segundo tramo del código (CO-CAU-…, COL-TOL-…).
--
--  Una bodega elegida a mano (bodega_por no nulo) se respeta siempre. Si se
--  quita (bodega y bodega_por en null, la opción «Automática»), vuelve la regla.
--  La misma regla vive en TypeScript (bodegas.ts → bodegaPorOrigen) para
--  proponerla en el formulario de ingreso; el test ata las dos.
-- ============================================================================

create or replace function public.inventario_bodega_por_origen(p_departamento text, p_code text)
returns text language sql immutable set search_path = public as $$
  select case
    when d like 'CAUCA%' then 'cauca'
    when d like 'CUNDINAMARCA%' or d like 'TOLIMA%' then 'nilo'
    when d <> '' then 'bogota'
    when seg like 'CAU%' then 'cauca'
    when seg like 'CUN%' or seg like 'TOL%' then 'nilo'
    else 'bogota'
  end
  from (select
          upper(trim(coalesce(p_departamento, ''))) d,
          upper(trim(coalesce(split_part(p_code, '-', 2), ''))) seg) x;
$$;

create or replace function public.inventario_tr_bodega()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.bodega_por is null then
    new.bodega := public.inventario_bodega_por_origen(new.departamento, new.code);
  end if;
  return new;
end;
$$;

drop trigger if exists inventario_bodega_auto on public.inventory_lots;
create trigger inventario_bodega_auto
  before insert or update of departamento, code, bodega, bodega_por on public.inventory_lots
  for each row execute function public.inventario_tr_bodega();

-- Los lotes que hoy no tienen bodega elegida a mano toman la de la regla.
update public.inventory_lots
  set bodega = public.inventario_bodega_por_origen(departamento, code)
  where bodega_por is null;
