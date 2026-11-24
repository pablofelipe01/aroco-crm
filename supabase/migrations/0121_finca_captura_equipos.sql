-- ============================================================================
--  AROCO · 0121 — /campo: riego, uso de equipos y compras de combustible
--
--  Lo mismo que 0118 hizo para las labores, para las tablas de 0120: el
--  teléfono guarda sin señal y sube por estas funciones, idempotentes por el
--  `id` que pone el teléfono.
--
--  QUIÉN:
--   - Uso de equipos y riego: quien puede capturar (0118). Dirección y Finca
--     por cualquiera; una cuenta enlazada a un trabajador, solo lo suyo.
--   - Compras de combustible: solo Dirección y Finca (es plata).
--
--  `finca_catalogo_captura` suma los equipos. Un teléfono con la página vieja
--  guardada no los trae: la pantalla pide abrirla con señal.
-- ============================================================================

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
    -- 0121. Sin el consumo por hora: eso es para el tablero de Dirección.
    'equipos', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id, 'codigo', q.codigo, 'nombre', q.nombre, 'combustible', q.combustible
      ) order by (q.codigo <> 'motor-riego'), q.nombre)
      from public.finca_equipos q
      where q.activo
    ), '[]'::jsonb),
    'hoy', (now() at time zone 'America/Bogota')::date
  );
end;
$$;

-- ── Uso de equipos (incluido el riego) ──────────────────────────────────────
--
--  Un uso trae horas, o carga de combustible, o las dos: el día que se
--  tanquea sin regar también se anota.
create or replace function public.finca_subir_usos(p_usos jsonb)
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
  v_equipo uuid;
  v_empleado uuid;
  v_valvulas text[];
  v_horas numeric;
  v_carga numeric;
  v_ini time;
  v_fin time;
  aceptados uuid[] := '{}';
  rechazados jsonb := '[]'::jsonb;
  motivo text;
begin
  if not public.finca_puede_capturar() then
    raise exception 'Sin permiso para registrar en la finca' using errcode = '42501';
  end if;
  if jsonb_typeof(p_usos) <> 'array' then raise exception 'Se esperaba una lista'; end if;
  if jsonb_array_length(p_usos) > 500 then raise exception 'Máximo 500 por envío'; end if;

  for r in select * from jsonb_array_elements(p_usos) loop
    motivo := null;
    begin
      v_id := (r ->> 'id')::uuid;
    exception when others then
      rechazados := rechazados || jsonb_build_object('id', r ->> 'id', 'motivo', 'id inválido');
      continue;
    end;
    if exists (select 1 from public.finca_equipo_usos where id = v_id) then
      aceptados := aceptados || v_id;
      continue;
    end if;

    begin
      v_fecha := (r ->> 'fecha')::date;
      v_equipo := (r ->> 'equipo_id')::uuid;
      v_empleado := nullif(r ->> 'empleado_id', '')::uuid;
      v_ini := nullif(r ->> 'hora_inicio', '')::time;
      v_fin := nullif(r ->> 'hora_fin', '')::time;
      v_horas := nullif(r ->> 'horas', '')::numeric;
      v_carga := nullif(r ->> 'carga_galones', '')::numeric;
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
    elsif v_equipo is null
       or not exists (select 1 from public.finca_equipos q where q.id = v_equipo and q.activo) then
      motivo := 'equipo desconocido';
    elsif v_empleado is not null
       and not exists (select 1 from public.finca_empleados e where e.id = v_empleado and e.activo) then
      motivo := 'trabajador desconocido';
    elsif not por_otros and v_empleado is distinct from yo then
      motivo := 'solo puede registrar sus propios usos';
    elsif v_horas is null and coalesce(v_carga, 0) = 0 then
      motivo := 'sin horas ni combustible';
    elsif v_horas is not null and (v_horas <= 0 or v_horas > 16) then
      motivo := 'horas fuera de rango';
    elsif v_carga is not null and (v_carga < 0 or v_carga > 200) then
      motivo := 'galones fuera de rango';
    elsif exists (
      select 1 from unnest(v_valvulas) x
      where not exists (select 1 from public.finca_valvulas fv where fv.codigo = x and fv.activo)
    ) then
      motivo := 'válvula que no está en el catálogo';
    end if;

    if motivo is not null then
      rechazados := rechazados || jsonb_build_object('id', v_id, 'motivo', motivo);
      continue;
    end if;

    insert into public.finca_equipo_usos (
      id, fecha, equipo_id, actividad, valvulas, sitio, hora_inicio, hora_fin, horas,
      carga_galones, empleado_id, observaciones, origen, registrado_por, registrado_en
    ) values (
      v_id, v_fecha, v_equipo, nullif(trim(r ->> 'actividad'), ''), v_valvulas,
      nullif(trim(r ->> 'sitio'), ''), v_ini, v_fin, v_horas,
      nullif(v_carga, 0), v_empleado, nullif(trim(r ->> 'observaciones'), ''),
      'app', auth.uid(),
      coalesce(nullif(r ->> 'registrado_en', '')::timestamptz, now())
    )
    on conflict (id) do nothing;

    aceptados := aceptados || v_id;
  end loop;

  return jsonb_build_object('aceptados', to_jsonb(aceptados), 'rechazados', rechazados);
end;
$$;

-- ── Compras de combustible ──────────────────────────────────────────────────
create or replace function public.finca_subir_compras(p_compras jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Bogota')::date;
  r jsonb;
  v_id uuid;
  v_fecha date;
  v_comb text;
  v_gal numeric;
  v_precio numeric;
  v_valor numeric;
  aceptados uuid[] := '{}';
  rechazados jsonb := '[]'::jsonb;
  motivo text;
begin
  if not public.finca_captura_por_otros() then
    raise exception 'Las compras de combustible las registran Dirección y Finca'
      using errcode = '42501';
  end if;
  if jsonb_typeof(p_compras) <> 'array' then raise exception 'Se esperaba una lista'; end if;
  if jsonb_array_length(p_compras) > 500 then raise exception 'Máximo 500 por envío'; end if;

  for r in select * from jsonb_array_elements(p_compras) loop
    motivo := null;
    begin
      v_id := (r ->> 'id')::uuid;
    exception when others then
      rechazados := rechazados || jsonb_build_object('id', r ->> 'id', 'motivo', 'id inválido');
      continue;
    end;
    if exists (select 1 from public.finca_combustible_compras where id = v_id) then
      aceptados := aceptados || v_id;
      continue;
    end if;

    begin
      v_fecha := (r ->> 'fecha')::date;
      v_comb := r ->> 'combustible';
      v_gal := nullif(r ->> 'galones', '')::numeric;
      v_precio := nullif(r ->> 'precio_galon', '')::numeric;
      v_valor := nullif(r ->> 'valor', '')::numeric;
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
    elsif v_comb is null or v_comb not in ('acpm', 'gasolina') then
      motivo := 'combustible desconocido';
    elsif v_gal is null and v_valor is null then
      motivo := 'sin galones ni valor';
    elsif coalesce(v_gal, 0) < 0 or coalesce(v_valor, 0) < 0 or coalesce(v_precio, 0) < 0 then
      motivo := 'cifras negativas';
    elsif coalesce(v_gal, 0) > 1000 then
      motivo := 'más de 1.000 galones';
    end if;

    if motivo is not null then
      rechazados := rechazados || jsonb_build_object('id', v_id, 'motivo', motivo);
      continue;
    end if;

    insert into public.finca_combustible_compras (
      id, fecha, combustible, recibo, galones, precio_galon, valor,
      proveedor, destino, observaciones, origen, created_by
    ) values (
      v_id, v_fecha, v_comb, nullif(trim(r ->> 'recibo'), ''), v_gal, v_precio, v_valor,
      nullif(trim(r ->> 'proveedor'), ''), nullif(trim(r ->> 'destino'), ''),
      nullif(trim(r ->> 'observaciones'), ''), 'app', auth.uid()
    )
    on conflict (id) do nothing;

    aceptados := aceptados || v_id;
  end loop;

  return jsonb_build_object('aceptados', to_jsonb(aceptados), 'rechazados', rechazados);
end;
$$;

revoke all on function public.finca_subir_usos(jsonb) from public, anon;
revoke all on function public.finca_subir_compras(jsonb) from public, anon;
grant execute on function public.finca_subir_usos(jsonb) to authenticated;
grant execute on function public.finca_subir_compras(jsonb) to authenticated;
