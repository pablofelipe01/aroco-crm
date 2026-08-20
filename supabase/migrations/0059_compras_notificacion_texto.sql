-- ============================================================================
--  AROCO · 0059 — Arreglos de texto en los avisos de compras
--
--  Verificando 0055 y 0056 con datos reales salieron tres cosas mal escritas.
--  Son cosméticas, pero es el texto que leen Álvaro, Nicolás y Luis en la
--  campana, y un aviso mal escrito se lee como un sistema descuidado:
--
--    «Temp pide · Finca · Finca · 2 cotizaciónes · desde $1,250,000»
--
--  1. «cotizaciónes». El plural de cotización es cotizaciones, sin tilde: no
--     basta con pegarle «es» al singular.
--  2. «$1,250,000». `to_char` con el patrón 999,999,999 separa los miles con
--     coma, que es el formato de Estados Unidos. En Colombia el separador de
--     miles es el punto, y así escrito se lee como si fueran mil doscientos
--     cincuenta pesos con decimales.
--  3. «Finca · Finca». Categoría y área se repiten cuando coinciden, que es lo
--     normal. Se dice una sola vez.
-- ============================================================================

/** Pesos en formato colombiano: separador de miles con punto. */
create or replace function public.pesos(monto numeric)
returns text
language sql
immutable
as $$
  select '$' || replace(to_char(coalesce(monto, 0), 'FM999,999,999,999'), ',', '.');
$$;

create or replace function public.notificar_aprobadores_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quien   text;
  cuantas int;
  menor   numeric;
  detalle text;
begin
  select coalesce(p.full_name, 'alguien') into quien
  from public.profiles p where p.id = new.created_by;

  select count(*), min(monto) into cuantas, menor
  from public.compra_cotizaciones c where c.solicitud_id = new.id;

  detalle := quien
    || ' · ' || new.categoria::text
    -- El área solo si aporta algo: repetir «Finca · Finca» es ruido.
    || coalesce(
         case when new.area::text is distinct from new.categoria::text
              then ' · ' || new.area::text end,
         '')
    || ' · ' || case when cuantas = 1 then '1 cotización'
                     else cuantas || ' cotizaciones' end
    || coalesce(' · desde ' || public.pesos(menor), '');

  insert into public.notifications
    (type, severity, title, body, related_table, related_id, for_user, dedupe_key)
  select
    'compra_aprobacion', 'warn',
    'Por aprobar: ' || new.consecutivo || ' — ' || new.titulo,
    detalle,
    'compra_solicitudes', new.id, p.id,
    'compra_aprobacion:' || new.id || ':' || p.id || ':' || current_date
  from public.profiles p
  where p.active and p.aprueba_compras
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

create or replace function public.notificar_decision_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  quien     text;
  proveedor text;
  monto     numeric;
  moneda    text;
  detalle   text;
begin
  if new.created_by is null then
    return new;
  end if;

  if new.aprobada_por is not distinct from new.created_by then
    return new;
  end if;

  select coalesce(p.full_name, 'Alguien') into quien
  from public.profiles p where p.id = new.aprobada_por;

  if new.estado = 'Aprobada' then
    select c.proveedor, c.monto, c.moneda into proveedor, monto, moneda
    from public.compra_cotizaciones c where c.id = new.cotizacion_elegida_id;

    detalle := coalesce(quien, 'Aprobada')
      || coalesce(' eligió ' || proveedor, '')
      || coalesce(
           ' por ' || case when moneda = 'USD'
                           then 'US$ ' || to_char(monto, 'FM999,999,999.00')
                           else public.pesos(monto) end,
           '');

    insert into public.notifications
      (type, severity, title, body, related_table, related_id, for_user, dedupe_key)
    values (
      'compra_decision', 'info',
      'Aprobada: ' || new.consecutivo || ' — ' || new.titulo,
      detalle,
      'compra_solicitudes', new.id, new.created_by,
      'compra_decision:' || new.id || ':Aprobada:' || current_date
    )
    on conflict (dedupe_key) do nothing;

  elsif new.estado = 'Rechazada' then
    insert into public.notifications
      (type, severity, title, body, related_table, related_id, for_user, dedupe_key)
    values (
      'compra_decision', 'danger',
      'Rechazada: ' || new.consecutivo || ' — ' || new.titulo,
      coalesce(quien || ': ', '') || coalesce(new.motivo_rechazo, 'Sin motivo registrado.'),
      'compra_solicitudes', new.id, new.created_by,
      'compra_decision:' || new.id || ':Rechazada:' || current_date
    )
    on conflict (dedupe_key) do nothing;
  end if;

  return new;
end;
$$;
