-- ============================================================================
--  AROCO · 0072 — Una cotización puede apuntar a un proveedor registrado
--
--  Era el motivo original del portal. Hoy `compra_cotizaciones.proveedor` es
--  texto suelto: «Alkosto», escrito a mano cada vez, sin NIT, sin cuenta
--  bancaria y sin forma de saber si sus documentos están vigentes. Al aprobar,
--  quien va a pagar tiene que buscar esos datos por fuera del CRM.
--
--  La columna es OPCIONAL y el texto se queda. Dos razones:
--
--    · Las nueve cotizaciones que ya existen no tienen a quién apuntar, y
--      obligar a vincularlas inventaría fichas que nadie verificó.
--    · Se cotiza a diario con proveedores que no están registrados —una
--      ferretería del pueblo, un taller— y exigir registro previo para pedir
--      una cotización pondría el portal en el camino de una compra urgente.
--
--  Cuando hay ficha, el nombre y el NIT se copian solos desde ella: escribirlos
--  a mano al lado de una ficha verificada es cómo aparecen dos «Alkosto» que no
--  se pueden cruzar.
-- ============================================================================

alter table public.compra_cotizaciones
  add column if not exists proveedor_id uuid
    references public.proveedores_insumos (id) on delete set null;

create index if not exists compra_cotizaciones_proveedor_idx
  on public.compra_cotizaciones (proveedor_id);

comment on column public.compra_cotizaciones.proveedor_id is
  'Ficha del proveedor registrado, si la cotización viene de uno. Null = proveedor ocasional, solo con el nombre en `proveedor`.';

-- Copia el nombre y el NIT desde la ficha cuando se vincula.
--
-- Se copian y no se leen por join a propósito: una cotización es un documento
-- de un momento dado, y si el proveedor cambia su razón social mañana, la
-- cotización de hoy debe seguir diciendo con quién se cotizó.
create or replace function public.completar_proveedor_cotizacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  p record;
begin
  if new.proveedor_id is null then
    return new;
  end if;

  select
    coalesce(
      pi.razon_social,
      nullif(trim(coalesce(pi.nombres, '') || ' ' || coalesce(pi.apellidos, '')), '')
    ) as nombre,
    pi.numero_documento
  into p
  from public.proveedores_insumos pi
  where pi.id = new.proveedor_id;

  if found then
    new.proveedor := coalesce(nullif(trim(new.proveedor), ''), p.nombre);
    new.nit := coalesce(nullif(trim(new.nit), ''), p.numero_documento);
  end if;

  return new;
end;
$$;

drop trigger if exists compra_cotizaciones_completa_proveedor on public.compra_cotizaciones;
create trigger compra_cotizaciones_completa_proveedor
  before insert or update of proveedor_id on public.compra_cotizaciones
  for each row execute function public.completar_proveedor_cotizacion();
