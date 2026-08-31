-- ============================================================================
--  AROCO · 0069 — Un proveedor no es miembro del CRM
--
--  0068 se apoyaba en que un proveedor no tuviera fila en `profiles`. La
--  verificación con usuarios reales mostró que esa suposición era falsa:
--  `handle_new_user()` es un trigger sobre `auth.users` que crea un perfil
--  ACTIVO para toda cuenta nueva. Existe desde 0003 y es correcto para el
--  equipo —quien recibe una invitación necesita su perfil— pero convierte a
--  cada proveedor que se registre en miembro activo.
--
--  Un proveedor de prueba veía tareas, actas, leads, inventario, perfiles del
--  equipo y las solicitudes de compra. También las fichas y las cuentas de
--  cobro de OTROS proveedores.
--
--  Se arregla por dos vías a la vez, y las dos hacen falta:
--
--    1. El trigger no crea perfil cuando la cuenta se marca como proveedor.
--       Evita acumular perfiles fantasma.
--    2. `is_active_member()` excluye a quien tenga ficha de proveedor. Esta es
--       la garantía de verdad: funciona aunque alguien cree la cuenta sin la
--       marca, que es justo el error que se comete cuando hay prisa.
--
--  Con solo la primera, olvidar un parámetro en el registro abre el CRM entero.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Las cuentas del portal de proveedores no llevan perfil: no son del equipo.
  if coalesce(new.raw_user_meta_data ->> 'es_proveedor', '') = 'true' then
    return new;
  end if;

  insert into public.profiles (id, email, full_name, department, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
    nullif(new.raw_user_meta_data ->> 'department', '')::public.department,
    coalesce(nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role, 'member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- ── La garantía ─────────────────────────────────────────────────────────────
-- Veintinueve políticas cuelgan de esta función. Excluir aquí a los proveedores
-- los deja fuera de TODAS de una vez, sin tener que acordarse de cada una.
--
-- La consulta extra pesa poco: `auth_user_id` tiene índice único.
create or replace function public.is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active
  )
  and not exists (
    select 1 from public.proveedores_insumos
    where auth_user_id = auth.uid()
  );
$$;

-- ── Limpiar los que ya tengan perfil ────────────────────────────────────────
-- Si alguna cuenta de proveedor alcanzó a recibir uno, se le quita: mientras
-- exista, aparece en el directorio del equipo y en los desplegables de
-- responsables de tareas.
delete from public.profiles p
where exists (
  select 1 from public.proveedores_insumos pi
  where pi.auth_user_id = p.id
);
