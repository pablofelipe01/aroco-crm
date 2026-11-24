-- ============================================================================
--  AROCO · 0118 — Labores Finca: captura desde el celular (sin conexión)
--
--  La pantalla /campo guarda cada registro en el teléfono y lo sube cuando hay
--  señal (en la finca solo hay internet en la oficina). Todo entra por dos
--  funciones, no por la tabla:
--
--    finca_catalogo_captura()  → trabajadores (solo nombre), labores, válvulas
--    finca_subir_registros(j)  → valida e inserta; idempotente por `id`
--
--  Por qué funciones y no RLS sobre la tabla: `finca_empleados` trae el jornal
--  y eso lo ve solo Dirección. Abrir el SELECT al área Finca lo abriría con
--  él. Y la subida tiene que validar más de lo que una política sabe decir
--  (fecha en ventana, válvulas del catálogo, horas posibles).
--
--  QUIÉN CAPTURA: Dirección y el área Finca, para cualquier trabajador (así
--  el mayordomo puede anotar la cuadrilla). Un trabajador con cuenta en otra
--  área, solo para sí mismo (`finca_empleados.profile_id`).
-- ============================================================================

create or replace function public.finca_captura_por_otros()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_direccion() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.department = 'Finca'
  );
$$;

create or replace function public.finca_mi_empleado()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select e.id from public.finca_empleados e
  where e.profile_id = auth.uid() and e.activo
  limit 1;
$$;

create or replace function public.finca_puede_capturar()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (public.finca_captura_por_otros() or public.finca_mi_empleado() is not null);
$$;

-- ── Catálogo para el teléfono ───────────────────────────────────────────────
create or replace function public.finca_catalogo_captura()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  por_otros boolean := public.finca_captura_por_otros();
  yo uuid := public.finca_mi_empleado();
begin
  if not public.finca_puede_capturar() then
    raise exception 'Sin permiso para registrar labores de la finca'
      using errcode = '42501';
  end if;

  return jsonb_build_object(
    'yo', yo,
    'porOtros', por_otros,
    'empleados', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'nombre', e.nombre) order by e.nombre)
      from public.finca_empleados e
      where e.activo and (por_otros or e.id = yo)
    ), '[]'::jsonb),
    'labores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'nombre', l.nombre, 'categoria', l.categoria, 'unidad', l.unidad
      ) order by l.nombre)
      from public.finca_labores l
      where l.activo
    ), '[]'::jsonb),
    'valvulas', coalesce((
      select jsonb_agg(v.codigo order by v.orden)
      from public.finca_valvulas v
      where v.activo
    ), '[]'::jsonb),
    'hoy', (now() at time zone 'America/Bogota')::date
  );
end;
$$;

-- ── Subida de la cola del teléfono ──────────────────────────────────────────
--
--  Recibe un arreglo de registros. Cada uno trae su `id` (uuid del teléfono):
--  si ya existe, se da por recibido sin tocarlo — así un reintento tras una
--  subida cortada no duplica. Devuelve qué ids quedaron en la base y cuáles se
--  rechazaron y por qué, para que el teléfono borre solo lo que llegó.
--
--  Un rechazo no frena a los demás: el teléfono guarda el rechazado con su
--  motivo y el trabajador lo corrige.
create or replace function public.finca_subir_registros(p_registros jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  por_otros boolean := public.finca_captura_por_otros();
  yo uuid := public.finca_mi_empleado();
  hoy date := (now() at time zone 'America/Bogota')::date;
  r jsonb;
  v_id uuid;
  v_fecha date;
  v_empleado uuid;
  v_labor uuid;
  v_unidad_labor text;
  v_valvulas text[];
  v_horas numeric;
  v_ini time;
  v_fin time;
  aceptados uuid[] := '{}';
  rechazados jsonb := '[]'::jsonb;
  motivo text;
begin
  if not public.finca_puede_capturar() then
    raise exception 'Sin permiso para registrar labores de la finca'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_registros) <> 'array' then
    raise exception 'Se esperaba una lista de registros';
  end if;
  if jsonb_array_length(p_registros) > 500 then
    raise exception 'Máximo 500 registros por envío';
  end if;

  for r in select * from jsonb_array_elements(p_registros) loop
    motivo := null;
    begin
      v_id := (r ->> 'id')::uuid;
    exception when others then
      rechazados := rechazados || jsonb_build_object('id', r ->> 'id', 'motivo', 'id inválido');
      continue;
    end;

    -- Ya está: reintento de algo que llegó. Se confirma sin tocarlo.
    if exists (select 1 from public.finca_registros where id = v_id) then
      aceptados := aceptados || v_id;
      continue;
    end if;

    begin
      v_fecha := (r ->> 'fecha')::date;
      v_empleado := (r ->> 'empleado_id')::uuid;
      v_labor := (r ->> 'labor_id')::uuid;
      v_ini := nullif(r ->> 'hora_inicio', '')::time;
      v_fin := nullif(r ->> 'hora_fin', '')::time;
      v_horas := nullif(r ->> 'horas', '')::numeric;
      v_valvulas := coalesce(
        (select array_agg(x) from jsonb_array_elements_text(coalesce(r -> 'valvulas', '[]'::jsonb)) x),
        '{}'
      );
    exception when others then
      rechazados := rechazados || jsonb_build_object('id', v_id, 'motivo', 'datos con formato inválido');
      continue;
    end;

    if v_fecha is null then
      motivo := 'sin fecha';
    elsif v_fecha > hoy then
      motivo := 'fecha futura';
    elsif v_fecha < hoy - 45 then
      motivo := 'fecha de hace más de 45 días';
    elsif v_empleado is null
       or not exists (select 1 from public.finca_empleados e where e.id = v_empleado and e.activo) then
      motivo := 'trabajador desconocido';
    elsif not por_otros and v_empleado is distinct from yo then
      motivo := 'solo puede registrar sus propias labores';
    elsif v_labor is null then
      motivo := 'sin labor';
    else
      select l.unidad into v_unidad_labor
      from public.finca_labores l where l.id = v_labor and l.activo;
      if not found then
        motivo := 'labor desconocida';
      elsif v_horas is null or v_horas <= 0 or v_horas > 16 then
        motivo := 'horas fuera de rango';
      elsif exists (
        select 1 from unnest(v_valvulas) x
        where not exists (select 1 from public.finca_valvulas fv where fv.codigo = x and fv.activo)
      ) then
        motivo := 'válvula que no está en el catálogo';
      end if;
    end if;

    if motivo is not null then
      rechazados := rechazados || jsonb_build_object('id', v_id, 'motivo', motivo);
      continue;
    end if;

    insert into public.finca_registros (
      id, fecha, empleado_id, labor_id, valvulas, sitio,
      hora_inicio, hora_fin, horas, cantidad, unidad,
      sanas, pasador_monilia, negras, observaciones,
      origen, registrado_por, registrado_en
    ) values (
      v_id, v_fecha, v_empleado, v_labor, v_valvulas, nullif(trim(r ->> 'sitio'), ''),
      v_ini, v_fin, v_horas,
      nullif(r ->> 'cantidad', '')::numeric,
      coalesce(nullif(r ->> 'unidad', ''), v_unidad_labor),
      nullif(r ->> 'sanas', '')::numeric,
      nullif(r ->> 'pasador_monilia', '')::numeric,
      nullif(r ->> 'negras', '')::numeric,
      nullif(trim(r ->> 'observaciones'), ''),
      'app', auth.uid(),
      coalesce(nullif(r ->> 'registrado_en', '')::timestamptz, now())
    )
    on conflict (id) do nothing;

    aceptados := aceptados || v_id;
  end loop;

  return jsonb_build_object('aceptados', to_jsonb(aceptados), 'rechazados', rechazados);
end;
$$;

revoke all on function public.finca_catalogo_captura() from public, anon;
revoke all on function public.finca_subir_registros(jsonb) from public, anon;
grant execute on function public.finca_catalogo_captura() to authenticated;
grant execute on function public.finca_subir_registros(jsonb) to authenticated;

-- Lo que subió cada quien, para que el teléfono muestre «ya llegó». Se suma a
-- la política de Dirección (las políticas permisivas se combinan con OR).
create policy "finca_registros_propios" on public.finca_registros
  for select to authenticated
  using (registrado_por = auth.uid() and public.finca_puede_capturar());

-- ── Enlazar las cuentas que ya existen ──────────────────────────────────────
--
--  Juan Carlos García ya tiene perfil en el área Finca. Se enlaza por nombre
--  normalizado (la misma `clave` de la carga: sin tildes, minúsculas, un solo
--  espacio), solo si hay exactamente un perfil que case.
update public.finca_empleados e
set profile_id = p.id
from public.profiles p
where e.profile_id is null
  and e.clave = regexp_replace(
        lower(translate(trim(p.full_name), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
        '\s+', ' ', 'g')
  and (select count(*) from public.profiles p2
       where regexp_replace(
               lower(translate(trim(p2.full_name), 'ÁÉÍÓÚÜÑáéíóúüñ', 'AEIOUUNaeiouun')),
               '\s+', ' ', 'g') = e.clave) = 1;
