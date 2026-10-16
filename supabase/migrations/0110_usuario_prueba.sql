-- ============================================================================
--  AROCO · 0110 — Cuenta de prueba que cambia de perfil
--
--  Nicolás necesita ver el CRM como lo ve cada persona: Comercial, Bodega,
--  Financiero, un admin_view… Todo lo que se muestra (menú, botones de
--  escritura y RLS) cuelga de `profiles.role` y `profiles.department`, así que
--  la vista fiel no es una simulación en el cliente: es cambiar esas dos
--  columnas de verdad en una cuenta aparte.
--
--  `es_prueba` marca esa cuenta. Solo ella puede cambiarse a sí misma el rol y
--  el área; nada más de su fila (permisos especiales, activo, correo). La marca
--  la pone el backend con service_role, nunca la persona.
--
--  De paso se congelan también `ve_uso`, `ve_comisiones_todas` y
--  `verifica_proveedores`: llegaron después de 0075 y el guardián no las
--  conocía, así que cualquier miembro podía dárselas a sí mismo.
-- ============================================================================

alter table public.profiles
  add column if not exists es_prueba boolean not null default false;

comment on column public.profiles.es_prueba is
  'Cuenta de prueba: puede cambiarse a sí misma el rol y el área para ver el CRM como cada perfil.';

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

  -- La cuenta de prueba va antes que el chequeo de admin: cuando está puesta
  -- como admin tampoco debe poder darse permisos especiales ni quitarse la marca.
  if old.es_prueba then
    new.es_prueba            := true;
    new.active               := old.active;
    new.email                := old.email;
    new.ve_mercado           := old.ve_mercado;
    new.aprueba_compras      := old.aprueba_compras;
    new.ve_uso               := old.ve_uso;
    new.ve_comisiones_todas  := old.ve_comisiones_todas;
    new.verifica_proveedores := old.verifica_proveedores;
    return new;                       -- role y department pasan
  end if;

  if public.is_admin() then
    return new;                       -- Dirección sí puede tocar lo suyo
  end if;

  -- Se devuelven a su valor anterior en vez de lanzar excepción: así guardar el
  -- nombre o el idioma sigue funcionando aunque el cliente mande la fila
  -- completa, que es lo que hace un `update` hecho desde un formulario.
  new.role                 := old.role;
  new.active               := old.active;
  new.department           := old.department;
  new.ve_mercado           := old.ve_mercado;
  new.aprueba_compras      := old.aprueba_compras;
  new.ve_uso               := old.ve_uso;
  new.ve_comisiones_todas  := old.ve_comisiones_todas;
  new.verifica_proveedores := old.verifica_proveedores;
  new.es_prueba            := old.es_prueba;
  new.email                := old.email;
  return new;
end;
$$;

-- ── Fuera del tablero de uso ────────────────────────────────────────────────
-- La cuenta de prueba no es una persona del equipo: contarla en /uso ensucia
-- los días activos. Se parchea el cuerpo vigente de `uso_crm` (0102) en vez de
-- copiarlo entero aquí, para no pisar nada si alguien lo toca antes.
do $$
declare
  v_def text := pg_get_functiondef('public.uso_crm(int)'::regprocedure);
begin
  if position('not p.es_prueba' in v_def) = 0 then
    execute replace(v_def, 'where p.active', 'where p.active and not p.es_prueba');
  end if;
end;
$$;
