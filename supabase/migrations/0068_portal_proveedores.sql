-- ============================================================================
--  AROCO · 0068 — Portal de proveedores de insumos
--
--  Un sitio aparte donde los proveedores de oficina, finca, cultivo, bodega y
--  demás se registran solos, suben sus documentos y radican cuentas de cobro.
--
--  No toca los 239 proveedores de cacao: esos viven en `proveedores`, con su
--  esquema de variedad, capacidad y deforestación. Son dos poblaciones
--  distintas y mezclarlas obligaría a que una tabla sirva para dos cosas.
--
--  Sí llena un hueco del módulo de Compras: hoy `compra_cotizaciones.proveedor`
--  es texto suelto —«Alkosto», escrito a mano cada vez— sin NIT, sin cuenta
--  bancaria y sin forma de saber si sus documentos están vigentes.
--
--  ── LA DECISIÓN QUE SOSTIENE TODO ─────────────────────────────────────────
--
--  Un proveedor tiene cuenta de Supabase Auth pero NUNCA una fila en
--  `profiles`. Veintinueve migraciones de RLS cuelgan de `is_active_member()`,
--  que comprueba justamente esa tabla: sin fila ahí, un proveedor autenticado
--  no ve tareas, ni actas, ni comisiones, ni márgenes, ni posiciones del
--  bróker. Su identidad vive en `auth_user_id` de su propia ficha.
--
--  Darle un `profiles` a un proveedor, aunque fuera «solo para que entre»,
--  abriría todo el CRM de una vez.
-- ============================================================================

-- Los nombres llevan «insumo» porque `proveedor_estado` y `proveedor_documentos`
-- YA EXISTEN para los proveedores de cacao, con otros valores ('En estudio',
-- 'Habilitado'…) y otro propósito. Reusarlos obligaría a que un mismo tipo
-- signifique dos cosas según qué tabla lo use.
do $$ begin
  create type public.proveedor_insumo_estado as enum (
    'Pendiente',   -- se registró, falta verificar documentos
    'Activo',      -- verificado: puede radicar cuentas de cobro
    'Rechazado',
    'Inactivo'     -- se le suspende sin borrar su historia
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.persona_tipo as enum ('Natural', 'Jurídica');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.documento_tipo as enum ('CC', 'CE', 'NIT', 'PA');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.cuenta_cobro_estado as enum (
    'Radicada',    -- el proveedor la envió
    'Aprobada',
    'Rechazada',
    'Pagada'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.documento_proveedor_tipo as enum (
    'RUT',
    'Documento de identidad',
    'Certificado bancario',
    'Cámara de comercio',
    'Otro'
  );
exception when duplicate_object then null; end $$;

-- ── Quién verifica ──────────────────────────────────────────────────────────
-- Bandera por persona, como `aprueba_compras` y `ve_mercado`: no existe un rol
-- que describa «quien revisa documentos tributarios y bancarios». Milena Soto
-- es Aux. Contratos y Compras — es literalmente su cargo.
alter table public.profiles
  add column if not exists verifica_proveedores boolean not null default false;

comment on column public.profiles.verifica_proveedores is
  'Puede activar, rechazar o suspender proveedores de insumos, y decidir sobre sus cuentas de cobro.';

create or replace function public.verifica_proveedores()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.verifica_proveedores
  );
$$;

revoke execute on function public.verifica_proveedores() from anon;
grant execute on function public.verifica_proveedores() to authenticated;

-- ── La ficha del proveedor ──────────────────────────────────────────────────
create sequence if not exists public.proveedor_insumo_seq;

create table if not exists public.proveedores_insumos (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null default 'PI-' || lpad(nextval('public.proveedor_insumo_seq')::text, 4, '0'),

  -- Su cuenta de acceso. NO es un `profiles`: ver la cabecera.
  auth_user_id  uuid unique references auth.users (id) on delete set null,

  tipo_persona     public.persona_tipo not null,
  tipo_documento   public.documento_tipo not null,
  numero_documento text not null,
  -- Natural: nombres + apellidos. Jurídica: razón social. Lo valida un trigger.
  nombres        text,
  apellidos      text,
  razon_social   text,

  email      text not null,
  telefono   text not null,
  direccion  text,
  departamento text,
  municipio    text,

  -- Qué vende, con las mismas categorías del módulo de Compras para que las
  -- dos listas hablen el mismo idioma.
  categorias   public.compra_categoria[] not null default '{}',
  descripcion  text,

  banco             text,
  tipo_cuenta       text,          -- 'Ahorros' | 'Corriente'
  numero_cuenta     text,
  titular_cuenta    text,
  documento_titular text,

  estado          public.proveedor_insumo_estado not null default 'Pendiente',
  motivo_rechazo  text,
  verificado_por  uuid references public.profiles (id) on delete set null,
  verificado_en   timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists proveedores_insumos_documento_key
  on public.proveedores_insumos (numero_documento);
create unique index if not exists proveedores_insumos_email_key
  on public.proveedores_insumos (lower(email));
create index if not exists proveedores_insumos_estado_idx
  on public.proveedores_insumos (estado, created_at desc);

create trigger proveedores_insumos_set_updated_at
  before update on public.proveedores_insumos
  for each row execute function public.set_updated_at();

-- ── Documentos ──────────────────────────────────────────────────────────────
-- Con fecha de vencimiento: el RUT, el certificado bancario y la cámara de
-- comercio caducan, y descubrirlo el día del pago es tarde.
create table if not exists public.proveedor_insumo_documentos (
  id           uuid primary key default gen_random_uuid(),
  proveedor_id uuid not null references public.proveedores_insumos (id) on delete cascade,
  tipo         public.documento_proveedor_tipo not null,
  archivo_path text not null,
  archivo_nombre text,
  vence_el     date,
  subido_en    timestamptz not null default now()
);

create index if not exists proveedor_insumo_docs_idx
  on public.proveedor_insumo_documentos (proveedor_id, tipo);

-- ── Cuentas de cobro ────────────────────────────────────────────────────────
create sequence if not exists public.cuenta_cobro_seq;

create table if not exists public.cuentas_cobro (
  id           uuid primary key default gen_random_uuid(),
  consecutivo  text not null default 'CC-' || lpad(nextval('public.cuenta_cobro_seq')::text, 4, '0'),
  proveedor_id uuid not null references public.proveedores_insumos (id) on delete cascade,

  -- Opcional a propósito: no todo pago nace de una solicitud de compra. Un
  -- arriendo o un servicio recurrente nunca pasa por ahí, y exigirlo obligaría
  -- a inventar solicitudes para poder cobrar.
  solicitud_id uuid references public.compra_solicitudes (id) on delete set null,

  fecha    date not null default current_date,
  concepto text,

  estado         public.cuenta_cobro_estado not null default 'Radicada',
  motivo_rechazo text,
  decidida_por   uuid references public.profiles (id) on delete set null,
  decidida_en    timestamptz,

  pagada_en       timestamptz,
  pago_referencia text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cuentas_cobro_consecutivo_key
  on public.cuentas_cobro (consecutivo);
create index if not exists cuentas_cobro_prov_idx
  on public.cuentas_cobro (proveedor_id, created_at desc);
create index if not exists cuentas_cobro_estado_idx
  on public.cuentas_cobro (estado, created_at desc);

create trigger cuentas_cobro_set_updated_at
  before update on public.cuentas_cobro
  for each row execute function public.set_updated_at();

-- Tabla hija y no `item1…item10`: eso era una limitación de Airtable, no un
-- diseño. Con diez columnas fijas, la cuenta número once no cabe y sumar el
-- total obliga a escribir diez sumandos.
create table if not exists public.cuenta_cobro_items (
  id        uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas_cobro (id) on delete cascade,
  orden     integer not null default 0,
  descripcion    text not null,
  cantidad       numeric(12,2) not null default 1,
  valor_unitario numeric(16,2) not null,
  created_at timestamptz not null default now()
);

create index if not exists cuenta_cobro_items_cuenta_idx
  on public.cuenta_cobro_items (cuenta_id, orden);

-- ── Quién es el proveedor que está preguntando ──────────────────────────────
create or replace function public.proveedor_actual()
returns uuid
language sql stable security definer set search_path = public
as $$
  select id from public.proveedores_insumos
  where auth_user_id = auth.uid()
  limit 1;
$$;

revoke execute on function public.proveedor_actual() from anon;
grant execute on function public.proveedor_actual() to authenticated;

-- ── Candados de estado ──────────────────────────────────────────────────────
-- Un proveedor no puede activarse solo. La RLS no distingue por columna, así
-- que el candado va en un trigger.
create or replace function public.guard_proveedor_estado()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  -- service_role (los scripts y el servidor) pasa: no tiene auth.uid().
  if auth.uid() is null then
    return new;
  end if;

  if (new.estado is distinct from old.estado
      or new.verificado_por is distinct from old.verificado_por
      or new.verificado_en is distinct from old.verificado_en)
     and not public.verifica_proveedores() then
    raise exception 'Solo quien verifica proveedores puede cambiar el estado.'
      using errcode = '42501';
  end if;

  -- Cambiar la cuenta bancaria devuelve la ficha a verificación.
  --
  -- Es EL vector de fraude de un portal de proveedores: alguien entra a la
  -- cuenta, cambia el número, radica una cuenta de cobro y el pago se va a otra
  -- parte. Volver a 'Pendiente' cuesta una revisión y evita perder la plata.
  if public.proveedor_actual() = new.id
     and old.estado = 'Activo'
     and (new.numero_cuenta is distinct from old.numero_cuenta
          or new.banco is distinct from old.banco
          or new.titular_cuenta is distinct from old.titular_cuenta
          or new.documento_titular is distinct from old.documento_titular) then
    new.estado := 'Pendiente';
    new.verificado_por := null;
    new.verificado_en := null;
    new.motivo_rechazo := 'Cambió los datos bancarios: requiere verificación de nuevo.';
  end if;

  return new;
end;
$$;

create trigger proveedores_insumos_guard
  before update on public.proveedores_insumos
  for each row execute function public.guard_proveedor_estado();

-- Persona natural necesita nombre y apellido; jurídica, razón social.
create or replace function public.guard_proveedor_nombre()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if new.tipo_persona = 'Natural'
     and (coalesce(trim(new.nombres), '') = '' or coalesce(trim(new.apellidos), '') = '') then
    raise exception 'Una persona natural necesita nombres y apellidos.';
  end if;
  if new.tipo_persona = 'Jurídica' and coalesce(trim(new.razon_social), '') = '' then
    raise exception 'Una persona jurídica necesita razón social.';
  end if;
  return new;
end;
$$;

create trigger proveedores_insumos_nombre
  before insert or update on public.proveedores_insumos
  for each row execute function public.guard_proveedor_nombre();

create or replace function public.guard_cuenta_cobro()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- El proveedor radica; decidir es de la casa.
  if (new.estado is distinct from old.estado
      or new.decidida_por is distinct from old.decidida_por
      or new.pagada_en is distinct from old.pagada_en)
     and not public.verifica_proveedores() then
    raise exception 'Solo quien verifica proveedores puede decidir sobre una cuenta de cobro.'
      using errcode = '42501';
  end if;

  -- Una cuenta ya decidida no se edita: lo aprobado tiene que seguir diciendo
  -- qué se aprobó.
  if old.estado <> 'Radicada'
     and public.proveedor_actual() = new.proveedor_id
     and not public.verifica_proveedores() then
    raise exception 'Esta cuenta de cobro ya fue decidida y no se puede modificar.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger cuentas_cobro_guard
  before update on public.cuentas_cobro
  for each row execute function public.guard_cuenta_cobro();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Nada de `for all`: incluye SELECT, y las políticas permisivas se combinan con
-- OR. Ese descuido ya dejó pasar dos restricciones en este proyecto.
alter table public.proveedores_insumos enable row level security;
alter table public.proveedor_insumo_documentos enable row level security;
alter table public.cuentas_cobro enable row level security;
alter table public.cuenta_cobro_items enable row level security;

-- Ficha: el proveedor ve la suya; el equipo las ve todas.
create policy "proveedores_insumos_select" on public.proveedores_insumos
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_active_member());

-- Registro: cada quien crea SU ficha, atada a su propia cuenta.
create policy "proveedores_insumos_insert" on public.proveedores_insumos
  for insert to authenticated
  with check (auth_user_id = auth.uid());

create policy "proveedores_insumos_update" on public.proveedores_insumos
  for update to authenticated
  using (auth_user_id = auth.uid() or public.verifica_proveedores())
  with check (auth_user_id = auth.uid() or public.verifica_proveedores());

-- Documentos: los suyos.
create policy "proveedor_insumo_docs_select" on public.proveedor_insumo_documentos
  for select to authenticated
  using (proveedor_id = public.proveedor_actual() or public.is_active_member());

create policy "proveedor_insumo_docs_insert" on public.proveedor_insumo_documentos
  for insert to authenticated
  with check (proveedor_id = public.proveedor_actual());

create policy "proveedor_insumo_docs_delete" on public.proveedor_insumo_documentos
  for delete to authenticated
  using (proveedor_id = public.proveedor_actual() or public.verifica_proveedores());

-- Cuentas de cobro: solo un proveedor ACTIVO puede radicar. Si no se ha
-- verificado, no debería poder cobrar.
create policy "cuentas_cobro_select" on public.cuentas_cobro
  for select to authenticated
  using (proveedor_id = public.proveedor_actual() or public.is_active_member());

create policy "cuentas_cobro_insert" on public.cuentas_cobro
  for insert to authenticated
  with check (
    proveedor_id = public.proveedor_actual()
    and exists (
      select 1 from public.proveedores_insumos p
      where p.id = proveedor_id and p.estado = 'Activo'
    )
  );

create policy "cuentas_cobro_update" on public.cuentas_cobro
  for update to authenticated
  using (proveedor_id = public.proveedor_actual() or public.verifica_proveedores())
  with check (proveedor_id = public.proveedor_actual() or public.verifica_proveedores());

-- Ítems: cuelgan de su cuenta.
create policy "cuenta_cobro_items_select" on public.cuenta_cobro_items
  for select to authenticated
  using (
    exists (
      select 1 from public.cuentas_cobro c
      where c.id = cuenta_id
        and (c.proveedor_id = public.proveedor_actual() or public.is_active_member())
    )
  );

create policy "cuenta_cobro_items_insert" on public.cuenta_cobro_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.cuentas_cobro c
      where c.id = cuenta_id
        and c.proveedor_id = public.proveedor_actual()
        and c.estado = 'Radicada'
    )
  );

create policy "cuenta_cobro_items_delete" on public.cuenta_cobro_items
  for delete to authenticated
  using (
    exists (
      select 1 from public.cuentas_cobro c
      where c.id = cuenta_id
        and c.proveedor_id = public.proveedor_actual()
        and c.estado = 'Radicada'
    )
  );

-- ── Archivos ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('proveedores', 'proveedores', false)
on conflict (id) do nothing;

-- Cada proveedor escribe SOLO en su carpeta, que se llama como su ficha. Sin
-- esta comprobación, cualquiera con cuenta podría subir archivos a la carpeta
-- de otro o sobrescribir sus documentos.
create policy "proveedores_files_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proveedores'
    and (storage.foldername(name))[1] = public.proveedor_actual()::text
  );

create policy "proveedores_files_select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proveedores'
    and (
      (storage.foldername(name))[1] = public.proveedor_actual()::text
      or public.is_active_member()
    )
  );

create policy "proveedores_files_delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'proveedores'
    and (
      (storage.foldername(name))[1] = public.proveedor_actual()::text
      or public.verifica_proveedores()
    )
  );

-- ── Quien verifica ──────────────────────────────────────────────────────────
update public.profiles
set verifica_proveedores = true
where email = 'info@aroco.co';   -- Milena Soto · Aux. Contratos y Compras
