-- ============================================================================
--  AROCO · 0055 — Avisarle a quien tiene que aprobar
--
--  Hasta ahora una solicitud pasaba a Pendiente y ahí se quedaba: el que la
--  mandó creía haber pedido algo y Álvaro, Nicolás o Luis no se enteraban
--  hasta que alguien abría el módulo por su cuenta. Pedir aprobación sin
--  avisarle a nadie no es pedir aprobación.
--
--  Va en un trigger y no en la acción del servidor por dos razones: la tabla
--  `notifications` no tiene política de INSERT —solo escriben en ella
--  funciones SECURITY DEFINER— y así el aviso sale pase lo que pase, aunque
--  el estado se cambie desde un script o desde el editor de Supabase.
-- ============================================================================

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

  -- El cuerpo trae lo mínimo para decidir si vale la pena abrirlo ahora: quién
  -- pide, de qué área, y con cuánto arranca. Un aviso que solo dice "hay algo
  -- pendiente" obliga a entrar para saber si urge.
  detalle := quien || ' · ' || new.categoria::text
    || coalesce(' · ' || new.area::text, '')
    || ' · ' || cuantas || ' cotización' || case when cuantas = 1 then '' else 'es' end
    || coalesce(' · desde $' || to_char(menor, 'FM999,999,999'), '');

  insert into public.notifications
    (type, severity, title, body, related_table, related_id, for_user, dedupe_key)
  select
    'compra_aprobacion', 'warn',
    'Por aprobar: ' || new.consecutivo || ' — ' || new.titulo,
    detalle,
    'compra_solicitudes', new.id, p.id,
    -- Acotado al día: si alguien la manda dos veces seguidas no llegan dos
    -- avisos iguales, pero si vuelve a pedirse la semana entrante sí llega uno
    -- nuevo, que es cuando de verdad hay algo distinto que mirar.
    'compra_aprobacion:' || new.id || ':' || p.id || ':' || current_date
  from public.profiles p
  where p.active and p.aprueba_compras
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

-- Solo al ENTRAR en Pendiente: editar una solicitud que ya está esperando no
-- vuelve a sonar la campana.
create trigger compra_solicitudes_notifica_aprobadores
  after update of estado on public.compra_solicitudes
  for each row
  when (new.estado = 'Pendiente' and old.estado is distinct from 'Pendiente')
  execute function public.notificar_aprobadores_compra();

-- Una solicitud puede nacer directamente en Pendiente (por ejemplo desde un
-- script de carga), y ese caso el trigger de UPDATE no lo ve.
create trigger compra_solicitudes_notifica_aprobadores_ins
  after insert on public.compra_solicitudes
  for each row
  when (new.estado = 'Pendiente')
  execute function public.notificar_aprobadores_compra();
