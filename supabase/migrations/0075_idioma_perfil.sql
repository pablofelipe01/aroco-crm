-- Idioma de visualización, por persona.
--
-- Va en el perfil y no en una cookie porque la preferencia es de la persona,
-- no del navegador: quien trabaja en inglés lo hace desde el portátil y desde
-- el teléfono, y no tiene por qué volver a elegirlo en cada uno. La cookie
-- existe igual, pero solo como transporte para las pantallas que corren sin
-- sesión (login, onboarding).
--
-- Por defecto español: es el idioma de la empresa y el de todos los perfiles
-- que ya existen. El inglés se activa uno por uno, a propósito.

alter table public.profiles
  add column if not exists idioma text not null default 'es';

-- Solo dos valores. Sin esto, un update con 'EN' o 'english' se guarda tal cual
-- y la interfaz cae al idioma por defecto sin decir por qué.
alter table public.profiles
  drop constraint if exists profiles_idioma_check;

alter table public.profiles
  add constraint profiles_idioma_check check (idioma in ('es', 'en'));

comment on column public.profiles.idioma is
  'Idioma de la interfaz: es | en. Lo cambia la persona desde su propio menú.';


-- ── Un perfil propio se edita, pero no se asciende ──────────────────────────
--
--  `profiles_update_own` deja actualizar la fila propia entera, y hasta ahora
--  eso era teórico: nadie editaba su perfil desde la aplicación. El idioma lo
--  vuelve un camino de todos los días, así que conviene mirar qué más alcanza
--  ese mismo permiso — y alcanza `role`. Cualquiera con sesión podía llamar a
--  PostgREST y ponerse `role = 'admin'`, o darse `ve_mercado` y abrir las
--  posiciones de broker y el P&L. No hacía falta ningún fallo del CRM: la
--  política lo permitía.
--
--  Estas columnas las decide Dirección desde /equipo. Se congelan cuando uno
--  edita su propia fila; un admin editando a otra persona pasa de largo, y el
--  backend con `service_role` también (ahí `auth.uid()` es NULL).
create or replace function public.guard_perfil_propio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.uid() is distinct from new.id then
    return new;                       -- admin sobre otro, o service_role
  end if;

  if public.is_admin() then
    return new;                       -- Dirección sí puede tocar lo suyo
  end if;

  -- Se devuelven a su valor anterior en vez de lanzar excepción: así guardar el
  -- nombre o el idioma sigue funcionando aunque el cliente mande la fila
  -- completa, que es lo que hace un `update` hecho desde un formulario.
  new.role            := old.role;
  new.active          := old.active;
  new.department      := old.department;
  new.ve_mercado      := old.ve_mercado;
  new.aprueba_compras := old.aprueba_compras;
  new.email           := old.email;
  return new;
end;
$$;

drop trigger if exists profiles_guard_propio on public.profiles;

create trigger profiles_guard_propio
  before update on public.profiles
  for each row execute function public.guard_perfil_propio();
