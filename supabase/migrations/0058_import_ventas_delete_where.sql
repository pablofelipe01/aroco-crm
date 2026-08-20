-- ============================================================================
--  AROCO · 0058 — `import_ventas_sheet`: DELETE con WHERE
--
--  La primera corrida del sync falló con «DELETE requires a WHERE clause».
--  Supabase corre con `sql_safe_updates` activo, que rechaza un DELETE o un
--  UPDATE sin WHERE — una red de seguridad contra el borrado accidental de una
--  tabla entera.
--
--  Aquí borrar todo es intencional: la hoja es la fuente de verdad y cada
--  corrida reemplaza el contenido completo. Se escribe `where true` para
--  decirlo explícitamente, que es justo lo que la protección quiere: que
--  vaciar la tabla sea una decisión escrita y no un WHERE que se olvidó.
-- ============================================================================

create or replace function public.import_ventas_sheet(filas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  insertadas integer;
begin
  if jsonb_array_length(filas) = 0 then
    raise exception 'La hoja no trajo filas; no se reemplaza nada.';
  end if;

  delete from public.ventas where true;

  insert into public.ventas
    (fecha, cliente, odc, kg, valor_total, bonificacion, valor_pagar,
     origen, bultos, mercado, fila)
  select
    (f->>'fecha')::date,
    f->>'cliente',
    nullif(f->>'odc', ''),
    coalesce((f->>'kg')::numeric, 0),
    coalesce((f->>'valor_total')::numeric, 0),
    coalesce((f->>'bonificacion')::numeric, 0),
    coalesce((f->>'valor_pagar')::numeric, 0),
    nullif(f->>'origen', ''),
    nullif(f->>'bultos', '')::integer,
    nullif(f->>'mercado', ''),
    (f->>'fila')::integer
  from jsonb_array_elements(filas) as f;

  get diagnostics insertadas = row_count;
  return insertadas;
end;
$$;

revoke execute on function public.import_ventas_sheet(jsonb) from anon, authenticated;
