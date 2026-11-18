-- ============================================================================
--  0116 · Lugar de la firma en el documento
--
--  Revisión de Nicolás (2026-11-17): la firma no quedaba en la línea de firma
--  del contrato sino en el certificado de evidencias, al final. Quien crea el
--  sobre ahora ubica un recuadro por firmante sobre el PDF y el sellado dibuja
--  ahí la firma; el certificado sigue igual, como evidencia.
--
--  posicion = {"pagina": 1.., "x", "y", "w", "h"} en fracciones de la página
--  (0–1, origen arriba a la izquierda). Nula = sin ubicar: la firma va solo en
--  el certificado, como antes. Como el documento, queda fija al enviar el
--  sobre (guardián).
-- ============================================================================

alter table public.firmas_firmantes
  add column if not exists posicion jsonb
    check (posicion is null or (
      jsonb_typeof(posicion) = 'object'
      and (posicion->>'pagina')::int >= 1
      and (posicion->>'x')::numeric between 0 and 1
      and (posicion->>'y')::numeric between 0 and 1
      and (posicion->>'w')::numeric between 0 and 1
      and (posicion->>'h')::numeric between 0 and 1));

create or replace function public.firmas_firmantes_guardian()
returns trigger
language plpgsql
as $$
declare
  est text;
begin
  if tg_op = 'DELETE' then
    select estado into est from public.firmas_sobres where id = old.sobre_id;
    if est <> 'borrador' then
      raise exception 'No se quita un firmante de un sobre ya enviado';
    end if;
    return old;
  end if;

  if tg_op = 'INSERT' then
    select estado into est from public.firmas_sobres where id = new.sobre_id;
    if est <> 'borrador' then
      raise exception 'No se agrega un firmante a un sobre ya enviado';
    end if;
    return new;
  end if;

  if old.estado in ('firmado', 'rechazado') then
    if new.estado             is distinct from old.estado
    or new.firma_path         is distinct from old.firma_path
    or new.firma_modo         is distinct from old.firma_modo
    or new.nombre_firmado     is distinct from old.nombre_firmado
    or new.documento_firmado  is distinct from old.documento_firmado
    or new.firmado_en         is distinct from old.firmado_en
    or new.firmado_ip         is distinct from old.firmado_ip
    or new.firmado_user_agent is distinct from old.firmado_user_agent
    or new.verificado_en      is distinct from old.verificado_en
    or new.verificado_canal   is distinct from old.verificado_canal
    or new.rechazado_en       is distinct from old.rechazado_en
    or new.motivo_rechazo     is distinct from old.motivo_rechazo then
      raise exception 'La firma de % ya quedó registrada y no se modifica', old.nombre;
    end if;
  end if;
  if new.email is distinct from old.email or new.nombre is distinct from old.nombre
     or new.sobre_id is distinct from old.sobre_id
     or new.posicion is distinct from old.posicion then
    select estado into est from public.firmas_sobres where id = old.sobre_id;
    if est <> 'borrador' then
      raise exception 'El firmante de un sobre enviado no cambia de nombre, correo ni lugar de firma';
    end if;
  end if;
  return new;
end;
$$;
