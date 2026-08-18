-- ============================================================================
--  AROCO · 0056 — Avisarle al que pidió cómo terminó
--
--  La otra mitad de 0055. Ya se le avisa a quien aprueba que hay algo
--  esperando, pero quien pidió no se entera de en qué quedó: tiene que volver
--  a entrar a mirar, y si lo rechazaron con un motivo, ese motivo se queda
--  guardado sin que nadie lo lea.
--
--  El aviso de rechazo lleva el motivo en el cuerpo. Rechazar es pedir que se
--  corrija algo, y eso no sirve de nada si el que tiene que corregirlo no lo ve.
-- ============================================================================

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
  -- Sin autor no hay a quién avisarle (solicitudes sembradas por un script).
  if new.created_by is null then
    return new;
  end if;

  -- Si quien decide es el mismo que pidió, ya lo sabe: avisarle de su propia
  -- acción solo entrena a ignorar la campana.
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
           ' por ' || case when moneda = 'USD' then 'US$ ' else '$' end
             || to_char(monto, 'FM999,999,999'),
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

create trigger compra_solicitudes_notifica_decision
  after update of estado on public.compra_solicitudes
  for each row
  when (
    new.estado in ('Aprobada', 'Rechazada')
    and old.estado is distinct from new.estado
  )
  execute function public.notificar_decision_compra();
