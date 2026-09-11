-- ============================================================================
--  AROCO · 0087 — La liquidación de comisiones, dentro del CRM
--
--  Nicolás liquida las comisiones en una pestaña del mismo archivo de ventas
--  que el CRM ya lee. El archivo está protegido y solo se edita por una página
--  web para que nadie rompa las fórmulas, y cada comercial ve únicamente lo
--  suyo. Eso funciona, pero deja la liquidación fuera del CRM.
--
--  Primer paso: el CRM la LEE y la enseña con sus propios permisos. Calcularla
--  aquí —la meta de Nicolás— necesita una pieza que hoy no existe en ninguna
--  tabla: la utilidad por operación. La hoja la saca de «col AZ de VENTAS
--  2026»; el CRM guarda kilos, valor y bonificación de cada venta pero no el
--  costo de compra de ese despacho, así que todavía no puede reconstruir el
--  margen. Mientras tanto, la hoja es la fuente y esto es su reflejo.
--
--  SE ACUMULA, NO SE REEMPLAZA. La hoja liquida UN MES A LA VEZ: Nicolás
--  cierra cada mes cambiando el parámetro «Mes a liquidar» y toda la pestaña
--  se recalcula. Por eso cada corrida guarda el mes que esté puesto SIN tocar
--  los anteriores. Un reemplazo total —que es lo que hacen los otros syncs del
--  CRM— borraría el histórico cada vez que alguien mueve ese desplegable.
-- ============================================================================

-- ── Quién ve todas las liquidaciones ────────────────────────────────────────
--
--  Álvaro, Nicolás y Pablo ven todo; el resto, solo lo suyo. Va como permiso
--  por PERSONA y no por rol porque ningún rol describe ese grupo: Alejo y
--  Ángela también son `admin` y no están, y Luis es `admin_view`. Es el mismo
--  patrón de `aprueba_compras` y `ve_mercado`.
alter table public.profiles
  add column if not exists ve_comisiones_todas boolean not null default false;

comment on column public.profiles.ve_comisiones_todas is
  'Ve la liquidación de comisiones de todo el equipo, no solo la propia.';

create or replace function public.ve_comisiones_todas()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active and p.ve_comisiones_todas
  );
$$;

revoke execute on function public.ve_comisiones_todas() from public;
revoke execute on function public.ve_comisiones_todas() from anon;
grant execute on function public.ve_comisiones_todas() to authenticated;

update public.profiles set ve_comisiones_todas = true
where email in (
  'alvaro.acosta@aroco.co',
  'nicolas.rodriguez@aroco.co',
  'pablofelipe@me.com'
);

-- ── Quién es quién ──────────────────────────────────────────────────────────
--
--  La hoja identifica al comercial por su nombre de pila: «Alvaro», «John»,
--  «AROCO». Eso NO se puede resolver adivinando contra `profiles`: hay dos
--  Johns activos —John Muñoz en Comercial y John Saenz en Operaciones— y un
--  match por nombre le enseñaría a uno la comisión del otro.
--
--  Así que la correspondencia es una tabla, explícita y corregible. Un nombre
--  que aparezca en la hoja y no esté aquí entra con `profile_id` nulo: su
--  liquidación se guarda y se ve en el total, pero no se le atribuye a nadie
--  hasta que alguien diga de quién es. Es preferible a atribuirla mal.
create table if not exists public.comision_comerciales (
  nombre     text primary key,
  profile_id uuid references public.profiles (id) on delete set null,
  -- «AROCO» es la casa: mueve toneladas y no cobra comisión. No es una
  -- persona y no debe quedar esperando a que alguien la asigne.
  es_casa    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists comision_comerciales_set_updated_at on public.comision_comerciales;
create trigger comision_comerciales_set_updated_at
  before update on public.comision_comerciales
  for each row execute function public.set_updated_at();

insert into public.comision_comerciales (nombre, profile_id, es_casa)
select 'Alvaro', id, false from public.profiles where email = 'alvaro.acosta@aroco.co'
on conflict (nombre) do nothing;

-- John Muñoz y no John Saenz: es el de Comercial y su correo es
-- comercial@aroco.co. Si alguna vez fuera el otro, se corrige aquí sin tocar
-- código.
insert into public.comision_comerciales (nombre, profile_id, es_casa)
select 'John', id, false from public.profiles where email = 'comercial@aroco.co'
on conflict (nombre) do nothing;

insert into public.comision_comerciales (nombre, profile_id, es_casa)
values ('AROCO', null, true)
on conflict (nombre) do nothing;

-- ── El mes liquidado ────────────────────────────────────────────────────────
create table if not exists public.comision_periodos (
  id            uuid primary key default gen_random_uuid(),
  anio          integer not null,
  mes           integer not null check (mes between 1 and 12),
  mes_nombre    text,

  mercado_por_defecto text,
  umbral_senior_ton   numeric(10,2),
  share_vendedor      numeric(6,4),
  share_comprador     numeric(6,4),
  transporte_kg       numeric(12,2),
  seleccion_kg        numeric(12,2),

  toneladas        numeric(12,2) not null default 0,
  utilidad         numeric(16,2) not null default 0,
  total_comisiones numeric(16,2) not null default 0,
  -- La suma de las líneas, para poder contrastarla con el total de la hoja.
  -- En agosto difieren en 1 peso por redondeo de la propia hoja; guardando las
  -- dos, una diferencia que NO sea de redondeo se puede ver.
  suma_lineas      numeric(16,2) not null default 0,

  synced_at  timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (anio, mes)
);

drop trigger if exists comision_periodos_set_updated_at on public.comision_periodos;
create trigger comision_periodos_set_updated_at
  before update on public.comision_periodos
  for each row execute function public.set_updated_at();

create table if not exists public.comision_lineas (
  id          uuid primary key default gen_random_uuid(),
  periodo_id  uuid not null references public.comision_periodos (id) on delete cascade,
  comercial   text not null,
  -- Resuelto contra `comision_comerciales` al sincronizar. Null cuando el
  -- nombre todavía no está asignado: es lo que decide quién puede ver la fila.
  profile_id  uuid references public.profiles (id) on delete set null,
  -- El periodo, repetido aquí a propósito. Un comercial NO puede leer
  -- `comision_periodos` —ahí está el total a pagar de todo el equipo, que no
  -- es «lo suyo»— así que necesita saber de qué mes es su línea sin tener que
  -- ir a buscarlo a una tabla que no puede abrir.
  anio        integer not null,
  mes         integer not null check (mes between 1 and 12),
  ton_venta   numeric(12,2) not null default 0,
  ton_compra  numeric(12,2) not null default 0,
  ton_total   numeric(12,2) not null default 0,
  nivel       text,
  pct_techo   numeric(6,4),
  utilidad_venta  numeric(16,2) not null default 0,
  utilidad_compra numeric(16,2) not null default 0,
  comision_venta  numeric(16,2) not null default 0,
  comision_compra numeric(16,2) not null default 0,
  total_pagar     numeric(16,2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (periodo_id, comercial)
);

create index if not exists comision_lineas_periodo_idx on public.comision_lineas (periodo_id);
create index if not exists comision_lineas_profile_idx on public.comision_lineas (profile_id);
create index if not exists comision_lineas_periodo_mes_idx on public.comision_lineas (anio desc, mes desc);

-- ── El respaldo de cada cifra ───────────────────────────────────────────────
--
--  Sin el detalle, «te tocan $103.509» no se puede explicar y la liquidación
--  vuelve a ser una caja negra, que es justo lo que se quiere dejar atrás.
create table if not exists public.comision_operaciones (
  id          uuid primary key default gen_random_uuid(),
  periodo_id  uuid not null references public.comision_periodos (id) on delete cascade,
  fila        integer not null,
  fecha       date,
  cliente     text,
  odc         text,
  descripcion text,
  kg          numeric(14,2) not null default 0,
  utilidad_bruta numeric(16,2) not null default 0,
  proveedor   text,
  vendedor    text,
  comprador   text,
  kg_aroco    numeric(14,2) not null default 0,
  costo_transp_selec numeric(16,2) not null default 0,
  utilidad_neta numeric(16,2) not null default 0,
  remision    text,
  destino     text,
  mercado     text,
  comision_vendedor numeric(16,2) not null default 0,
  comision_comprador numeric(16,2) not null default 0,
  created_at  timestamptz not null default now(),
  unique (periodo_id, fila)
);

create index if not exists comision_operaciones_periodo_idx
  on public.comision_operaciones (periodo_id);

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
--  Cada comercial ve lo suyo; Álvaro, Nicolás y Pablo ven todo. Nadie escribe
--  desde el cliente: el sync corre con service_role, y sin políticas de
--  INSERT/UPDATE/DELETE la RLS los bloquea a todos.
alter table public.comision_comerciales enable row level security;
alter table public.comision_periodos enable row level security;
alter table public.comision_lineas enable row level security;
alter table public.comision_operaciones enable row level security;

-- El catálogo de nombres no es sensible y hace falta para entender la pantalla.
drop policy if exists "comision_comerciales_select" on public.comision_comerciales;
create policy "comision_comerciales_select" on public.comision_comerciales
  for select to authenticated using (public.is_active_member());

-- Corregir a quién corresponde un nombre es de administración.
drop policy if exists "comision_comerciales_write" on public.comision_comerciales;
create policy "comision_comerciales_write" on public.comision_comerciales
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- El resumen del mes trae la utilidad y el total a pagar de TODO el equipo:
-- eso no es «lo suyo» de nadie, así que solo lo ve quien ve todo. Un comercial
-- no pasa por aquí — su línea lleva el año y el mes repetidos justamente para
-- que no le haga falta.
drop policy if exists "comision_periodos_select" on public.comision_periodos;
create policy "comision_periodos_select" on public.comision_periodos
  for select to authenticated
  using (public.ve_comisiones_todas());

drop policy if exists "comision_lineas_select" on public.comision_lineas;
create policy "comision_lineas_select" on public.comision_lineas
  for select to authenticated
  using (public.ve_comisiones_todas() or profile_id = auth.uid());

-- Una operación la ve quien participó en ella, como vendedor o como comprador.
drop policy if exists "comision_operaciones_select" on public.comision_operaciones;
create policy "comision_operaciones_select" on public.comision_operaciones
  for select to authenticated
  using (
    public.ve_comisiones_todas()
    or exists (
      select 1 from public.comision_comerciales c
      where c.profile_id = auth.uid()
        and (c.nombre = comision_operaciones.vendedor
          or c.nombre = comision_operaciones.comprador)
    )
  );
