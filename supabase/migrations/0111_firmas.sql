-- ============================================================================
--  AROCO · 0111 — Firma electrónica de contratos (fase 1)
--
--  Un «sobre» es un PDF que se manda a firmar a una o varias personas. Quien
--  firma no tiene cuenta en el CRM: entra por un enlace único (firma.aroco.co),
--  se identifica con un código de un solo uso y firma.
--
--  Lo que sostiene la validez bajo la Ley 527 de 1999 está en la base, no en la
--  aplicación, para que ni un error ni alguien con acceso al código lo pueda
--  torcer:
--
--   · Art. 7 (quién firmó y que aprobó): cada firmante guarda cómo se verificó
--     su identidad, el nombre y documento con que firmó y la imagen de su
--     firma. Una vez firmado, esas columnas ya no cambian (guardián).
--   · Art. 9 (integridad): el sobre guarda la huella SHA-256 del PDF original
--     y la del firmado. Enviado el sobre, el original queda congelado.
--   · Art. 12 (conservación de origen, destino, fecha y hora): `firmas_eventos`
--     es un registro al que solo se agregan líneas. Nadie lo edita ni lo
--     borra —ni siquiera el service_role, porque lo impide un trigger— y cada
--     línea lleva el hash de la anterior: si alguien borra o cambia una por
--     debajo, la cadena deja de cuadrar (`firmas_cadena_integra`).
--
--  Los archivos viven en el bucket privado `firmas`, sin políticas de
--  actualizar ni borrar.
-- ============================================================================

create sequence if not exists public.firmas_codigo_seq;

create table public.firmas_sobres (
  id               uuid primary key default gen_random_uuid(),
  codigo           text not null unique
                     default 'FIR-' || lpad(nextval('public.firmas_codigo_seq')::text, 4, '0'),
  titulo           text not null check (length(trim(titulo)) >= 3),
  tipo             text not null check (tipo in (
                     'compraventa_internacional', 'compraventa_nacional', 'suministro',
                     'laboral', 'otrosi', 'confidencialidad', 'representacion', 'otro')),
  idioma           text not null default 'es' check (idioma in ('es', 'en')),
  mensaje          text,
  en_orden         boolean not null default true,
  estado           text not null default 'borrador'
                     check (estado in ('borrador', 'enviado', 'completado', 'anulado')),
  original_path    text not null,
  original_nombre  text not null,
  original_sha256  text not null check (original_sha256 ~ '^[0-9a-f]{64}$'),
  original_paginas integer not null check (original_paginas > 0),
  original_bytes   integer not null,
  firmado_path     text,
  firmado_sha256   text check (firmado_sha256 is null or firmado_sha256 ~ '^[0-9a-f]{64}$'),
  vence_en         timestamptz,
  enviado_en       timestamptz,
  completado_en    timestamptz,
  anulado_en       timestamptz,
  motivo_anulacion text,
  created_by       uuid not null default auth.uid() references public.profiles (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index firmas_sobres_estado_idx on public.firmas_sobres (estado, created_at desc);
create index firmas_sobres_creador_idx on public.firmas_sobres (created_by);
create index firmas_sobres_firmado_sha_idx on public.firmas_sobres (firmado_sha256);

comment on table public.firmas_sobres is
  'Documentos enviados a firma electrónica. Ver 0111_firmas.sql.';

create table public.firmas_firmantes (
  id                 uuid primary key default gen_random_uuid(),
  sobre_id           uuid not null references public.firmas_sobres (id) on delete restrict,
  orden              integer not null default 1 check (orden >= 1),
  nombre             text not null check (length(trim(nombre)) >= 3),
  email              text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  documento          text,
  rol                text,
  -- Solo el hash del enlace: el enlace en claro se muestra una vez y viaja por
  -- correo. Regenerarlo invalida el anterior.
  token_hash         text unique,
  estado             text not null default 'pendiente'
                       check (estado in ('pendiente', 'notificado', 'firmado', 'rechazado')),
  notificado_en      timestamptz,
  codigo_hash        text,
  codigo_vence       timestamptz,
  codigo_intentos    integer not null default 0,
  verificado_en      timestamptz,
  verificado_canal   text check (verificado_canal in ('email', 'whatsapp', 'sms')),
  firma_path         text,
  firma_modo         text check (firma_modo in ('dibujada', 'escrita')),
  nombre_firmado     text,
  documento_firmado  text,
  firmado_en         timestamptz,
  firmado_ip         text,
  firmado_user_agent text,
  rechazado_en       timestamptz,
  motivo_rechazo     text,
  created_at         timestamptz not null default now()
);
create index firmas_firmantes_sobre_idx on public.firmas_firmantes (sobre_id, orden);

create table public.firmas_eventos (
  id          bigint generated always as identity primary key,
  sobre_id    uuid not null references public.firmas_sobres (id) on delete restrict,
  firmante_id uuid references public.firmas_firmantes (id) on delete restrict,
  tipo        text not null,
  detalle     jsonb not null default '{}'::jsonb,
  ip          text,
  user_agent  text,
  actor       uuid references public.profiles (id),
  ocurrido_en timestamptz not null default clock_timestamp(),
  hash_previo text,
  hash        text not null default ''
);
create index firmas_eventos_sobre_idx on public.firmas_eventos (sobre_id, id);

-- ── Cadena de hashes del registro ───────────────────────────────────────────
create or replace function public.firmas_hash_evento(
  p_previo text, p_sobre uuid, p_firmante uuid, p_tipo text, p_detalle jsonb,
  p_ip text, p_ocurrido timestamptz
) returns text
language sql immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(
    coalesce(p_previo, '') || '|' || p_sobre::text || '|' || coalesce(p_firmante::text, '') || '|' ||
    p_tipo || '|' || p_detalle::text || '|' || coalesce(p_ip, '') || '|' ||
    to_char(p_ocurrido at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'sha256'), 'hex');
$$;

create or replace function public.firmas_eventos_encadenar()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  -- Un candado por sobre: dos eventos simultáneos no pueden colgar del mismo
  -- eslabón y bifurcar la cadena.
  perform pg_advisory_xact_lock(hashtext('firmas:' || new.sobre_id::text));
  new.ocurrido_en := clock_timestamp();       -- nadie fecha un evento a mano
  select e.hash into new.hash_previo
    from public.firmas_eventos e
   where e.sobre_id = new.sobre_id
   order by e.id desc
   limit 1;
  new.hash := public.firmas_hash_evento(
    new.hash_previo, new.sobre_id, new.firmante_id, new.tipo, new.detalle, new.ip, new.ocurrido_en);
  return new;
end;
$$;

create trigger firmas_eventos_encadenar
  before insert on public.firmas_eventos
  for each row execute function public.firmas_eventos_encadenar();

create or replace function public.firmas_eventos_inmutables()
returns trigger
language plpgsql
as $$
begin
  raise exception 'firmas_eventos es de solo agregar: no se edita ni se borra';
end;
$$;

create trigger firmas_eventos_inmutables
  before update or delete on public.firmas_eventos
  for each row execute function public.firmas_eventos_inmutables();

create trigger firmas_eventos_sin_truncate
  before truncate on public.firmas_eventos
  for each statement execute function public.firmas_eventos_inmutables();

/** true si cada evento del sobre cuelga del anterior y su hash cuadra. */
create or replace function public.firmas_cadena_integra(p_sobre uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, extensions
as $$
declare
  r record;
  previo text := null;
begin
  for r in
    select * from public.firmas_eventos where sobre_id = p_sobre order by id
  loop
    if r.hash_previo is distinct from previo then return false; end if;
    if r.hash <> public.firmas_hash_evento(
         r.hash_previo, r.sobre_id, r.firmante_id, r.tipo, r.detalle, r.ip, r.ocurrido_en) then
      return false;
    end if;
    previo := r.hash;
  end loop;
  return true;
end;
$$;

-- ── Guardianes: lo enviado y lo firmado no se reescribe ─────────────────────
create or replace function public.firmas_sobres_guardian()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  if old.estado <> 'borrador' then
    if new.original_path    is distinct from old.original_path
    or new.original_sha256  is distinct from old.original_sha256
    or new.original_paginas is distinct from old.original_paginas
    or new.original_bytes   is distinct from old.original_bytes
    or new.titulo           is distinct from old.titulo
    or new.tipo             is distinct from old.tipo
    or new.en_orden         is distinct from old.en_orden
    or new.created_by       is distinct from old.created_by
    or new.codigo           is distinct from old.codigo then
      raise exception 'El sobre % ya se envió: su documento no se puede cambiar', old.codigo;
    end if;
  end if;
  if old.estado in ('completado', 'anulado') and new.estado <> old.estado then
    raise exception 'El sobre % está %: no cambia de estado', old.codigo, old.estado;
  end if;
  if old.estado = 'enviado' and new.estado not in ('enviado', 'completado', 'anulado') then
    raise exception 'Un sobre enviado no vuelve a borrador';
  end if;
  if old.firmado_path is not null
     and (new.firmado_path is distinct from old.firmado_path
          or new.firmado_sha256 is distinct from old.firmado_sha256) then
    raise exception 'El PDF firmado del sobre % ya está sellado', old.codigo;
  end if;
  return new;
end;
$$;

create trigger firmas_sobres_guardian
  before update on public.firmas_sobres
  for each row execute function public.firmas_sobres_guardian();

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
     or new.sobre_id is distinct from old.sobre_id then
    select estado into est from public.firmas_sobres where id = old.sobre_id;
    if est <> 'borrador' then
      raise exception 'El firmante de un sobre enviado no cambia de nombre ni de correo';
    end if;
  end if;
  return new;
end;
$$;

create trigger firmas_firmantes_guardian
  before insert or update or delete on public.firmas_firmantes
  for each row execute function public.firmas_firmantes_guardian();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Hay contratos laborales: cada quien ve los sobres que creó, y Dirección
-- todos. Lo que pasa del lado de quien firma (sin cuenta) va por el servidor
-- con service_role, después de comprobar el enlace.
create or replace function public.firmas_puede_ver(p_sobre uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.firmas_sobres s
     where s.id = p_sobre
       and (s.created_by = auth.uid() or public.is_admin())
  ) and public.is_active_member();
$$;

alter table public.firmas_sobres    enable row level security;
alter table public.firmas_firmantes enable row level security;
alter table public.firmas_eventos   enable row level security;

create policy "firmas_sobres_select" on public.firmas_sobres
  for select to authenticated
  using (public.is_active_member() and (created_by = auth.uid() or public.is_admin()));

create policy "firmas_sobres_insert" on public.firmas_sobres
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and estado = 'borrador'
    and public.can_write(array['Comercial', 'Administrativo', 'Financiero']::public.department[])
  );

create policy "firmas_sobres_update" on public.firmas_sobres
  for update to authenticated
  using (public.is_active_member() and (created_by = auth.uid() or public.is_admin()))
  with check (public.is_active_member() and (created_by = auth.uid() or public.is_admin()));

create policy "firmas_firmantes_select" on public.firmas_firmantes
  for select to authenticated using (public.firmas_puede_ver(sobre_id));
create policy "firmas_firmantes_insert" on public.firmas_firmantes
  for insert to authenticated with check (public.firmas_puede_ver(sobre_id));
create policy "firmas_firmantes_update" on public.firmas_firmantes
  for update to authenticated
  using (public.firmas_puede_ver(sobre_id)) with check (public.firmas_puede_ver(sobre_id));
create policy "firmas_firmantes_delete" on public.firmas_firmantes
  for delete to authenticated using (public.firmas_puede_ver(sobre_id));

-- El registro se lee desde el CRM pero solo lo escribe el servidor.
create policy "firmas_eventos_select" on public.firmas_eventos
  for select to authenticated using (public.firmas_puede_ver(sobre_id));

-- ── Bucket privado ──────────────────────────────────────────────────────────
-- Desde el navegador solo se sube el original, en la carpeta propia. Leer,
-- firmar y sellar lo hace el servidor. Sin políticas de update ni delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('firmas', 'firmas', false, 15728640, array['application/pdf', 'image/png'])
on conflict (id) do nothing;

create policy "firmas_files_insert_original" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'firmas'
    and (storage.foldername(name))[1] = 'originales'
    and (storage.foldername(name))[2] = auth.uid()::text
    and public.can_write(array['Comercial', 'Administrativo', 'Financiero']::public.department[])
  );
