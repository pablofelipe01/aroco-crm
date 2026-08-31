-- ============================================================================
--  AROCO · 0070 — Avisar cuando llega un proveedor o una cuenta de cobro
--
--  Sin esto, un proveedor se registra y su solicitud queda esperando a que a
--  alguien se le ocurra abrir el módulo. Es el mismo hueco que tenía Compras
--  antes de 0055: pedir verificación sin avisarle a nadie no es pedir
--  verificación.
--
--  Va en triggers y no en las acciones del servidor porque `notifications` no
--  tiene política de INSERT —solo escriben funciones SECURITY DEFINER— y así el
--  aviso sale aunque el registro entre por otro camino.
-- ============================================================================

create or replace function public.notificar_proveedor_nuevo()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  quien text;
begin
  quien := coalesce(new.razon_social, trim(coalesce(new.nombres, '') || ' ' || coalesce(new.apellidos, '')));

  insert into public.notifications
    (type, severity, title, body, related_table, related_id, for_user, dedupe_key)
  select
    'proveedor_nuevo', 'warn',
    'Proveedor por verificar: ' || quien,
    quien || ' · ' || new.tipo_documento::text || ' ' || new.numero_documento
      || coalesce(' · ' || array_to_string(new.categorias::text[], ', '), '')
      || ' · ' || new.email,
    'proveedores_insumos', new.id, p.id,
    'proveedor_nuevo:' || new.id || ':' || p.id
  from public.profiles p
  where p.active and p.verifica_proveedores
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists proveedores_insumos_avisa on public.proveedores_insumos;
create trigger proveedores_insumos_avisa
  after insert on public.proveedores_insumos
  for each row execute function public.notificar_proveedor_nuevo();

-- Volver a 'Pendiente' por un cambio de datos bancarios también avisa: es
-- justamente el caso que hay que mirar con más cuidado.
create or replace function public.notificar_proveedor_revision()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  quien text;
begin
  if new.estado <> 'Pendiente' or old.estado = 'Pendiente' then
    return new;
  end if;
  quien := coalesce(new.razon_social, trim(coalesce(new.nombres, '') || ' ' || coalesce(new.apellidos, '')));

  insert into public.notifications
    (type, severity, title, body, related_table, related_id, for_user, dedupe_key)
  select
    'proveedor_nuevo', 'danger',
    'Vuelve a verificación: ' || quien,
    coalesce(new.motivo_rechazo, 'Cambió datos que requieren verificación.'),
    'proveedores_insumos', new.id, p.id,
    'proveedor_revision:' || new.id || ':' || p.id || ':' || current_date
  from public.profiles p
  where p.active and p.verifica_proveedores
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists proveedores_insumos_avisa_revision on public.proveedores_insumos;
create trigger proveedores_insumos_avisa_revision
  after update of estado on public.proveedores_insumos
  for each row execute function public.notificar_proveedor_revision();

-- ── Cuentas de cobro ────────────────────────────────────────────────────────
create or replace function public.notificar_cuenta_cobro()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  quien text;
begin
  select coalesce(pi.razon_social, trim(coalesce(pi.nombres, '') || ' ' || coalesce(pi.apellidos, '')))
  into quien
  from public.proveedores_insumos pi where pi.id = new.proveedor_id;

  insert into public.notifications
    (type, severity, title, body, related_table, related_id, for_user, dedupe_key)
  select
    'cuenta_cobro', 'warn',
    'Cuenta de cobro radicada: ' || new.consecutivo,
    coalesce(quien, 'Un proveedor') || coalesce(' · ' || new.concepto, ''),
    'cuentas_cobro', new.id, p.id,
    'cuenta_cobro:' || new.id || ':' || p.id
  from public.profiles p
  where p.active and p.verifica_proveedores
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists cuentas_cobro_avisa on public.cuentas_cobro;
create trigger cuentas_cobro_avisa
  after insert on public.cuentas_cobro
  for each row execute function public.notificar_cuenta_cobro();
