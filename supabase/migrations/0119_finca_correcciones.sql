-- ============================================================================
--  AROCO · 0119 — Labores Finca: corregir, anular y revisar desde el CRM
--
--  Dirección corrige lo que ya llegó (del celular o de la hoja). Tres reglas:
--
--  1. ANULAR NO BORRA. Una fila de la hoja borrada vuelve en la siguiente
--     recarga; anulada, la carga la reconoce y la deja quieta. Lo anulado sale
--     de las sumas y se puede restaurar.
--  2. LO TOCADO A MANO NO LO PISA LA RECARGA. `editado_en` marca la fila; el
--     script `cargar-finca.ts` salta las filas con esa marca (ver ahí).
--  3. TODO CAMBIO QUEDA ESCRITO en `finca_registros_cambios`: cómo estaba,
--     cómo quedó, quién y cuándo. Son cifras que van a costos.
--
--  La pantalla escribe solo por estas funciones (como 0118), no con UPDATE
--  directo, para no saltarse el historial ni las validaciones. (La política
--  de 0117 sigue dejando a Dirección escribir la tabla; el script de carga
--  usa el service role.)
-- ============================================================================

alter table public.finca_registros
  add column if not exists editado_por      uuid references public.profiles (id) on delete set null,
  add column if not exists editado_en       timestamptz,
  add column if not exists anulado_por      uuid references public.profiles (id) on delete set null,
  add column if not exists anulado_en       timestamptz,
  add column if not exists motivo_anulacion text;

create index if not exists finca_registros_anulado_idx
  on public.finca_registros (fecha) where anulado_en is not null;

create table if not exists public.finca_registros_cambios (
  id           bigint generated always as identity primary key,
  registro_id  uuid not null references public.finca_registros (id) on delete cascade,
  accion       text not null check (accion in ('corregir', 'anular', 'restaurar', 'revisar')),
  antes        jsonb,
  despues      jsonb,
  motivo       text,
  por          uuid default auth.uid() references public.profiles (id) on delete set null,
  en           timestamptz not null default now()
);

create index if not exists finca_registros_cambios_registro_idx
  on public.finca_registros_cambios (registro_id, en);

alter table public.finca_registros_cambios enable row level security;

-- Solo lectura para Dirección. Se escribe únicamente desde las funciones.
create policy "finca_registros_cambios_direccion" on public.finca_registros_cambios
  for select to authenticated
  using (public.is_direccion());

-- Las columnas que se pueden corregir, en el orden en que se guardan en el
-- historial. Lo demás (origen, ref_hoja, original…) no se toca desde el CRM.
create or replace function public.finca_registro_datos(r public.finca_registros)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'fecha', r.fecha,
    'empleado_id', r.empleado_id,
    'labor_id', r.labor_id,
    'valvulas', to_jsonb(r.valvulas),
    'sitio', r.sitio,
    'hora_inicio', r.hora_inicio,
    'hora_fin', r.hora_fin,
    'horas', r.horas,
    'cantidad', r.cantidad,
    'unidad', r.unidad,
    'sanas', r.sanas,
    'pasador_monilia', r.pasador_monilia,
    'negras', r.negras,
    'observaciones', r.observaciones,
    'dudoso', r.dudoso
  );
$$;

-- ── Corregir ────────────────────────────────────────────────────────────────
--
--  Recibe la fila COMPLETA como debe quedar (no un parche): así lo que se ve
--  en el formulario es exactamente lo que se guarda.
--
--  Validaciones: las de la subida del celular, salvo la ventana de 45 días
--  (aquí se corrige historia). «Sin trabajador» y «sin horas» solo se aceptan
--  si la fila ya venía así de la hoja (los 14 resúmenes de desgrane de mayo):
--  una corrección puede dejar algo igual, nunca empeorarlo.
--
--  Corregir resuelve la duda: `dudoso` pasa a false salvo que se pida dejarla
--  (`seguir_dudoso`). `motivo_duda` se conserva como historia.
create or replace function public.finca_corregir_registro(p_id uuid, p jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  hoy date := (now() at time zone 'America/Bogota')::date;
  viejo public.finca_registros;
  nuevo public.finca_registros;
  v_valvulas text[];
  v_unidad text;
begin
  if not public.is_direccion() then
    raise exception 'Solo Dirección corrige labores de la finca' using errcode = '42501';
  end if;

  select * into viejo from public.finca_registros where id = p_id for update;
  if not found then raise exception 'El registro no existe'; end if;
  if viejo.anulado_en is not null then
    raise exception 'El registro está anulado: restáurelo antes de corregirlo';
  end if;

  nuevo := viejo;
  begin
    nuevo.fecha := (p ->> 'fecha')::date;
    nuevo.empleado_id := nullif(p ->> 'empleado_id', '')::uuid;
    nuevo.labor_id := (p ->> 'labor_id')::uuid;
    nuevo.sitio := nullif(trim(p ->> 'sitio'), '');
    nuevo.hora_inicio := nullif(p ->> 'hora_inicio', '')::time;
    nuevo.hora_fin := nullif(p ->> 'hora_fin', '')::time;
    nuevo.horas := nullif(p ->> 'horas', '')::numeric;
    nuevo.cantidad := nullif(p ->> 'cantidad', '')::numeric;
    nuevo.sanas := nullif(p ->> 'sanas', '')::numeric;
    nuevo.pasador_monilia := nullif(p ->> 'pasador_monilia', '')::numeric;
    nuevo.negras := nullif(p ->> 'negras', '')::numeric;
    nuevo.observaciones := nullif(trim(p ->> 'observaciones'), '');
    v_valvulas := coalesce(
      (select array_agg(x) from jsonb_array_elements_text(coalesce(p -> 'valvulas', '[]'::jsonb)) x),
      '{}'
    );
    nuevo.valvulas := v_valvulas;
  exception when others then
    raise exception 'Datos con formato inválido';
  end;

  if nuevo.fecha is null then raise exception 'Falta la fecha'; end if;
  if nuevo.fecha > hoy then raise exception 'La fecha no puede ser futura'; end if;
  if nuevo.fecha < date '2025-01-01' then raise exception 'Fecha anterior a 2025'; end if;

  if nuevo.empleado_id is null then
    if viejo.empleado_id is not null then raise exception 'Falta el trabajador'; end if;
  elsif not exists (select 1 from public.finca_empleados e where e.id = nuevo.empleado_id) then
    raise exception 'Trabajador desconocido';
  end if;

  select l.unidad into v_unidad from public.finca_labores l where l.id = nuevo.labor_id;
  if not found then raise exception 'Labor desconocida'; end if;
  nuevo.unidad := v_unidad;

  if nuevo.horas is null then
    if viejo.horas is not null then raise exception 'Faltan las horas'; end if;
  elsif nuevo.horas <= 0 or nuevo.horas > 16 then
    raise exception 'Horas fuera de rango (0 a 16)';
  end if;

  if exists (
    select 1 from unnest(nuevo.valvulas) x
    where not exists (select 1 from public.finca_valvulas fv where fv.codigo = x)
  ) then
    raise exception 'Válvula que no está en el catálogo';
  end if;

  if coalesce(nuevo.cantidad, 0) < 0 or coalesce(nuevo.sanas, 0) < 0
     or coalesce(nuevo.pasador_monilia, 0) < 0 or coalesce(nuevo.negras, 0) < 0 then
    raise exception 'Cifras negativas';
  end if;

  nuevo.dudoso := coalesce((p ->> 'seguir_dudoso')::boolean, false) and viejo.dudoso;

  if public.finca_registro_datos(nuevo) = public.finca_registro_datos(viejo) then
    return; -- nada cambió: ni marca ni historial
  end if;

  update public.finca_registros set
    fecha = nuevo.fecha,
    empleado_id = nuevo.empleado_id,
    labor_id = nuevo.labor_id,
    valvulas = nuevo.valvulas,
    sitio = nuevo.sitio,
    hora_inicio = nuevo.hora_inicio,
    hora_fin = nuevo.hora_fin,
    horas = nuevo.horas,
    cantidad = nuevo.cantidad,
    unidad = nuevo.unidad,
    sanas = nuevo.sanas,
    pasador_monilia = nuevo.pasador_monilia,
    negras = nuevo.negras,
    observaciones = nuevo.observaciones,
    dudoso = nuevo.dudoso,
    editado_por = auth.uid(),
    editado_en = now()
  where id = p_id;

  insert into public.finca_registros_cambios (registro_id, accion, antes, despues)
  values (p_id, 'corregir', public.finca_registro_datos(viejo), public.finca_registro_datos(nuevo));
end;
$$;

-- ── Anular y restaurar ──────────────────────────────────────────────────────
create or replace function public.finca_anular_registro(p_id uuid, p_anular boolean, p_motivo text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  viejo public.finca_registros;
begin
  if not public.is_direccion() then
    raise exception 'Solo Dirección anula labores de la finca' using errcode = '42501';
  end if;
  select * into viejo from public.finca_registros where id = p_id for update;
  if not found then raise exception 'El registro no existe'; end if;

  if p_anular then
    if viejo.anulado_en is not null then return; end if;
    if nullif(trim(p_motivo), '') is null then raise exception 'Diga por qué se anula'; end if;
    update public.finca_registros
      set anulado_en = now(), anulado_por = auth.uid(), motivo_anulacion = trim(p_motivo),
          editado_en = now(), editado_por = auth.uid()
      where id = p_id;
    insert into public.finca_registros_cambios (registro_id, accion, antes, motivo)
    values (p_id, 'anular', public.finca_registro_datos(viejo), trim(p_motivo));
  else
    if viejo.anulado_en is null then return; end if;
    -- `editado_en` se queda: la fila ya fue tocada a mano y la recarga no
    -- debe pisarla, ni siquiera restaurada.
    update public.finca_registros
      set anulado_en = null, anulado_por = null, motivo_anulacion = null,
          editado_en = now(), editado_por = auth.uid()
      where id = p_id;
    insert into public.finca_registros_cambios (registro_id, accion, motivo)
    values (p_id, 'restaurar', viejo.motivo_anulacion);
  end if;
end;
$$;

-- ── Revisado sin cambios ────────────────────────────────────────────────────
--
--  Para «Por revisar» cuando la lectura de la hoja estaba bien: quita la duda
--  y protege la fila de la recarga, que volvería a marcarla.
create or replace function public.finca_marcar_revisado(p_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  viejo public.finca_registros;
begin
  if not public.is_direccion() then
    raise exception 'Solo Dirección revisa labores de la finca' using errcode = '42501';
  end if;
  select * into viejo from public.finca_registros where id = p_id for update;
  if not found then raise exception 'El registro no existe'; end if;
  if not viejo.dudoso then return; end if;
  update public.finca_registros
    set dudoso = false, editado_en = now(), editado_por = auth.uid()
    where id = p_id;
  insert into public.finca_registros_cambios (registro_id, accion, motivo)
  values (p_id, 'revisar', viejo.motivo_duda);
end;
$$;

revoke all on function public.finca_corregir_registro(uuid, jsonb) from public, anon;
revoke all on function public.finca_anular_registro(uuid, boolean, text) from public, anon;
revoke all on function public.finca_marcar_revisado(uuid) from public, anon;
grant execute on function public.finca_corregir_registro(uuid, jsonb) to authenticated;
grant execute on function public.finca_anular_registro(uuid, boolean, text) to authenticated;
grant execute on function public.finca_marcar_revisado(uuid) to authenticated;

-- La subida del celular (0118) confirma un id que ya existe sin tocarlo. Con
-- la anulación eso sigue bien: un reintento de algo anulado no lo revive.
