-- ============================================================================
--  AROCO · 0083 — `search_path` fijo en los disparadores nuevos
--
--  El linter de Supabase marcó tres funciones de 0079, 0080 y 0082 con
--  «role mutable search_path». Ninguna es SECURITY DEFINER, así que corren con
--  los permisos de quien dispara y el riesgo real es bajo — pero una función
--  sin `search_path` resuelve los nombres de tabla con el del llamante, y basta
--  con que alguien cree un esquema por delante para que `public.tasks` deje de
--  ser la tabla que uno cree.
--
--  Se arregla en una migración nueva y no editando las tres anteriores: esas ya
--  corrieron, y cambiarlas dejaría el archivo diciendo una cosa y la base
--  teniendo otra.
--
--  Solo cambia la cabecera de cada función. El cuerpo es idéntico al que ya
--  estaba, a propósito: una corrección de seguridad no es el momento de
--  aprovechar y cambiar el comportamiento.
-- ============================================================================

-- 0079 — fecha de completado de una tarea
create or replace function public.task_set_completed_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.status = 'done' then
      new.completed_at = coalesce(new.completed_at, now());
    end if;
    return new;
  end if;

  if new.status is distinct from old.status then
    if new.status = 'done' then
      new.completed_at = coalesce(new.completed_at, now());
    else
      new.completed_at = null;
    end if;
  end if;
  return new;
end;
$$;

-- 0080 — cuándo se envió una solicitud de compra a aprobación
create or replace function public.compra_marca_envio()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.estado = 'Pendiente' and (tg_op = 'INSERT' or old.estado is distinct from 'Pendiente') then
    new.enviada_en = coalesce(new.enviada_en, now());
  elsif tg_op = 'UPDATE' and new.estado = 'Borrador' and old.estado is distinct from 'Borrador' then
    new.enviada_en = null;
  end if;
  return new;
end;
$$;

-- 0082 — quién enlazó un acopio con un lote
create or replace function public.trazabilidad_marca_enlace()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.lote_id is distinct from old.lote_id then
    if new.lote_id is null then
      new.enlazado_por = null;
      new.enlazado_en = null;
    else
      new.enlazado_por = coalesce(new.enlazado_por, auth.uid());
      new.enlazado_en = now();
    end if;
  end if;
  return new;
end;
$$;
