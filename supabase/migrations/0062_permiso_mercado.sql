-- ============================================================================
--  AROCO · 0062 — Permiso para ver Mercado
--
--  CacaoQ —posiciones de broker, márgenes, P&L, cobertura— pasa a ser un módulo
--  del CRM. Esa información no es de todo el equipo ni siquiera de todos los
--  administradores: hoy la ven Álvaro y Pablo.
--
--  Va como bandera por persona y no por rol o área, por la misma razón que
--  `aprueba_compras`: no existe un rol que describa a ese grupo. Ángela y Alejo
--  son SuperAdmin y no la ven; Luis Ernesto es `admin_view` y podría verla el
--  día que se decida. Con una marca eso se cambia sin tocar código.
--
--  Importante: el menú le muestra TODOS los módulos a quien es `admin`. Este
--  permiso tiene que ganarle a esa regla, o darle acceso de administrador a
--  alguien lo metería de rebote en las posiciones del broker.
-- ============================================================================

alter table public.profiles
  add column if not exists ve_mercado boolean not null default false;

comment on column public.profiles.ve_mercado is
  'Puede ver el módulo Mercado (posiciones, cobertura y P&L). Gana sobre el rol.';

create or replace function public.ve_mercado()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.ve_mercado
  );
$$;

revoke execute on function public.ve_mercado() from anon;
grant execute on function public.ve_mercado() to authenticated;

-- Los dos que se acordaron.
update public.profiles
set ve_mercado = true
where email in (
  'alvaro.acosta@aroco.co',   -- Gerente General
  'pablofelipe@me.com'        -- Plataforma / CRM
);
