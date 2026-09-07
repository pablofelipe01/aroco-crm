-- ============================================================================
--  AROCO · 0084 — Borrar una solicitud de compra la borra entera
--
--  Al borrar una solicitud, sus cotizaciones se van con ella —la llave foránea
--  de 0051 ya lo hace en cascada— pero los AVISOS no. `notifications` no tiene
--  llave foránea contra `compra_solicitudes`: guarda `related_table` y
--  `related_id` sueltos, a propósito, para poder apuntar a cualquier tabla.
--
--  El resultado era que a Álvaro, Nicolás y Luis les quedaba en la campana un
--  «Por aprobar: SC-0007» que al abrirlo no llevaba a ninguna parte. Un aviso
--  que apunta a algo que ya no existe es peor que ningún aviso: obliga a
--  averiguar si se borró o si la pantalla está rota.
--
--  Va en un DISPARADOR y no en la acción del servidor por dos razones. La
--  primera es que `notifications` no tiene política de borrado —solo escriben
--  en ella funciones SECURITY DEFINER— así que desde la sesión de un usuario no
--  se puede limpiar. La segunda es la de siempre: así también queda limpio si
--  alguien borra desde un script o desde el editor de Supabase.
-- ============================================================================

create or replace function public.compra_limpia_avisos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.notifications
  where related_table = 'compra_solicitudes'
    and related_id = old.id;
  return old;
end;
$$;

comment on function public.compra_limpia_avisos() is
  'Al borrar una solicitud, se lleva sus avisos. SECURITY DEFINER porque notifications no admite borrado desde una sesión.';

drop trigger if exists compra_solicitudes_limpia_avisos on public.compra_solicitudes;
create trigger compra_solicitudes_limpia_avisos
  before delete on public.compra_solicitudes
  for each row execute function public.compra_limpia_avisos();

-- Rescate de lo existente: avisos de compras cuya solicitud ya no está. Son
-- los que dejaron los borrados anteriores a este disparador.
delete from public.notifications n
where n.related_table = 'compra_solicitudes'
  and not exists (
    select 1 from public.compra_solicitudes s where s.id = n.related_id
  );
