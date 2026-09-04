-- ============================================================================
--  AROCO · 0080 — Compras: rastro de la aprobación
--
--  De la revisión del 1-sep-2026: «mostrar a quién se le envió la cotización y
--  quién está pendiente de aprobar».
--
--  Hoy el aviso sale (0055 lo manda a cada aprobador) pero no se ve por ninguna
--  parte: quien pidió algo mira una solicitud que dice «Pendiente» y no sabe si
--  le llegó a alguien, a quién, ni desde cuándo. La información existe —está en
--  `notifications`— pero su RLS solo deja ver lo dirigido a uno mismo, que es
--  lo correcto para la campana y lo contrario de lo que hace falta aquí.
--
--  Por eso el rastro se expone con una función SECURITY DEFINER que devuelve
--  solo nombres y fechas: quién recibió el aviso, si lo leyó y quién decidió.
--  Ni el cuerpo de la notificación ni nada ajeno a esta solicitud.
-- ============================================================================

-- ── Desde cuándo espera ─────────────────────────────────────────────────────
--
--  `updated_at` no sirve para esto: se mueve con cualquier edición posterior y
--  convertiría «lleva ocho días esperando» en «se envió hoy».
alter table public.compra_solicitudes
  add column if not exists enviada_en timestamptz;

comment on column public.compra_solicitudes.enviada_en is
  'Cuándo pasó a Pendiente, es decir cuándo se pidió aprobación. Lo mantiene un trigger.';

create or replace function public.compra_marca_envio()
returns trigger
language plpgsql
as $$
begin
  if new.estado = 'Pendiente' and (tg_op = 'INSERT' or old.estado is distinct from 'Pendiente') then
    new.enviada_en = coalesce(new.enviada_en, now());
  -- Volver a Borrador es retirar la petición: la fecha se borra para que no
  -- quede diciendo que algo lleva semanas esperando cuando ya nadie espera.
  elsif tg_op = 'UPDATE' and new.estado = 'Borrador' and old.estado is distinct from 'Borrador' then
    new.enviada_en = null;
  end if;
  return new;
end;
$$;

drop trigger if exists compra_solicitudes_marca_envio on public.compra_solicitudes;
create trigger compra_solicitudes_marca_envio
  before insert or update on public.compra_solicitudes
  for each row execute function public.compra_marca_envio();

-- Rescate de lo existente. Para las que ya pasaron por aprobación, el primer
-- aviso a los aprobadores es el registro más fiel de cuándo se envió; solo si
-- no hubo aviso se cae a `updated_at`, que es una aproximación.
update public.compra_solicitudes s
set enviada_en = coalesce(
  (
    select min(n.created_at) from public.notifications n
    where n.related_table = 'compra_solicitudes'
      and n.related_id = s.id
      and n.type = 'compra_aprobacion'
  ),
  s.updated_at
)
where s.enviada_en is null
  and s.estado in ('Pendiente', 'Aprobada', 'Rechazada');

-- ── Quién tiene que aprobar y quién ya lo hizo ──────────────────────────────
--
--  Devuelve la unión de dos cosas, que casi siempre coinciden pero no tienen
--  por qué: a quién LE LLEGÓ el aviso de esta solicitud, y quién aprueba
--  compras HOY. Si a alguien se le quitó el permiso después de avisarle, sigue
--  apareciendo con su aviso; si a alguien se le dio después, aparece como
--  pendiente aunque nunca recibiera el correo. Las dos cosas son ciertas y
--  esconder cualquiera de ellas dejaría un hueco justo donde se quiere mirar.
create or replace function public.compra_seguimiento_aprobacion(p_solicitud uuid)
returns table (
  profile_id uuid,
  nombre     text,
  avisado_en timestamptz,
  leido      boolean,
  decidio    boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with s as (
    select aprobada_por
    from public.compra_solicitudes
    where id = p_solicitud
  ),
  avisos as (
    -- Un aprobador puede tener varios avisos de la misma solicitud: el dedupe
    -- de 0055 es por día, así que reenviarla la semana entrante genera otro.
    -- Vale el PRIMERO, que es desde cuándo lo sabe.
    select n.for_user,
           min(n.created_at) as avisado_en,
           bool_or(n.read)   as leido
    from public.notifications n
    where n.related_table = 'compra_solicitudes'
      and n.related_id = p_solicitud
      and n.type = 'compra_aprobacion'
      and n.for_user is not null
    group by n.for_user
  )
  select
    p.id,
    p.full_name,
    a.avisado_en,
    coalesce(a.leido, false),
    p.id = (select aprobada_por from s)
  from public.profiles p
  left join avisos a on a.for_user = p.id
  where public.is_active_member()
    and (
      a.for_user is not null
      or (p.active and p.aprueba_compras)
      or p.id = (select aprobada_por from s)
    )
  order by p.full_name;
$$;

comment on function public.compra_seguimiento_aprobacion(uuid) is
  'A quién le llegó la solicitud, si lo leyó y quién decidió. SECURITY DEFINER porque notifications solo deja ver lo propio.';

revoke execute on function public.compra_seguimiento_aprobacion(uuid) from public;
revoke execute on function public.compra_seguimiento_aprobacion(uuid) from anon;
grant execute on function public.compra_seguimiento_aprobacion(uuid) to authenticated;
