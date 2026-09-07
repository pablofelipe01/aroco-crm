-- ============================================================================
--  AROCO · 0082 — Prueba piloto de trazabilidad
--
--  Poder responder, para un lote de la bodega de Bogotá, de qué veredas y de
--  qué manos salió el grano.
--
--  LO QUE YA HABÍA Y NO ALCANZABA. El inventario sabe que un lote se llama
--  «CISCA ruta #3 (Guachene - villa rica )» y cuántos kilos tiene. La hoja de
--  ruta sabe que un acopio lo entregaron 86 productores de 20 veredas, con
--  cédula y con lo que se le pagó a cada uno. Las dos cosas existían y no se
--  tocaban en ninguna parte.
--
--  POR QUÉ NO SE CUELGA DE `proveedores`. Se probaron 12 de las cédulas de la
--  hoja contra los 239 proveedores registrados: no coincide ninguna. CISCA es
--  la asociación con la que AROCO contrata; estos son sus asociados, gente que
--  nunca pasó por el registro de proveedores y que no tiene por qué pasar. Son
--  otra población y viven en su propia tabla.
--
--  LO QUE NO SE COPIA. La hoja trae banco, número de cuenta, tipo de cuenta y
--  la cédula del titular. Nada de eso entra aquí. Para trazar un grano hasta
--  su vereda no hace falta saber a qué cuenta se le pagó, y copiar datos
--  bancarios a una segunda base solo multiplica dónde pueden filtrarse.
-- ============================================================================

-- ── Lugares ─────────────────────────────────────────────────────────────────
--
--  Un solo catálogo para la bodega, los municipios y las veredas, porque el
--  mapa los pinta igual: un nombre y un punto.
--
--  `lat`/`lng` admiten null Y ESO ES LO NORMAL AL EMPEZAR. Hoy no existe una
--  sola coordenada en toda la base —los 239 proveedores tienen el campo
--  vacío— así que las veredas entran sin ubicar y alguien las va colocando. Un
--  mapa que dice «12 de 20 veredas ubicadas» es útil; uno con puntos
--  inventados para que se vea lleno es peor que no tener mapa.
--
--  `fuente` obliga a declarar de dónde salió cada punto. Una coordenada sin
--  procedencia, en un sistema que puede terminar respaldando una declaración
--  de origen, no vale nada.
do $$ begin
  create type public.lugar_tipo as enum ('bodega', 'municipio', 'vereda');
exception when duplicate_object then null; end $$;

create table if not exists public.trazabilidad_lugares (
  id           uuid primary key default gen_random_uuid(),
  tipo         public.lugar_tipo not null,
  nombre       text not null,
  -- Clave comparable: sin tildes, sin el prefijo «vereda», palabras ordenadas
  -- y juntas. La hoja del 3-sep traía 25 escrituras para 20 veredas.
  clave        text not null,
  -- Municipio al que pertenece una vereda. Null mientras nadie lo asigne: la
  -- hoja de ruta trae la vereda pero no dice de qué municipio es.
  municipio_id uuid references public.trazabilidad_lugares (id) on delete set null,
  departamento text,
  lat          numeric(9,6),
  lng          numeric(9,6),
  fuente       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Índice y no restricción de tabla: hace falta `coalesce` porque el municipio
-- puede ser nulo, y en SQL null nunca es igual a null — sin eso, dos veredas
-- del mismo nombre sin municipio asignado no chocarían.
create unique index if not exists trazabilidad_lugares_clave
  on public.trazabilidad_lugares (tipo, clave, coalesce(municipio_id::text, ''));

create trigger trazabilidad_lugares_set_updated_at
  before update on public.trazabilidad_lugares
  for each row execute function public.set_updated_at();

-- ── Rutas ───────────────────────────────────────────────────────────────────
--
--  Las cuatro rutas de CISCA, tal como aparecen dentro del nombre del lote de
--  inventario. El número es la clave: es lo único que la hoja de ruta y el
--  código del lote tienen en común.
create table if not exists public.trazabilidad_rutas (
  numero     integer primary key,
  etiqueta   text not null,
  nota       text,
  created_at timestamptz not null default now()
);

create table if not exists public.trazabilidad_ruta_municipios (
  ruta       integer not null references public.trazabilidad_rutas (numero) on delete cascade,
  lugar_id   uuid not null references public.trazabilidad_lugares (id) on delete cascade,
  primary key (ruta, lugar_id)
);

-- ── Acopios ─────────────────────────────────────────────────────────────────
--
--  Una fecha y una ruta: lo que se recogió ese día en ese recorrido, y la
--  unidad que se enlaza con un lote de bodega.
--
--  La ruta sola no sirve como clave —la misma ruta se recorre cada quincena— y
--  la fecha sola tampoco: el mismo día pueden salir varias rutas.
--
--  EL ENLACE CON EL LOTE ES A MANO, a propósito. Hoy la hoja tiene el acopio
--  del 3-sep de la ruta 3 y el inventario tiene lotes del 19-jun y del 12-ago:
--  no hay una sola fecha en común. Un emparejamiento automático no encontraría
--  nada hoy y, el día que encontrara algo, un acierto silencioso y un error
--  silencioso se verían igual. Quien enlaza deja su nombre.
create table if not exists public.trazabilidad_acopios (
  id           uuid primary key default gen_random_uuid(),
  fecha        date not null,
  ruta         integer not null references public.trazabilidad_rutas (numero),
  kg_primera   numeric(12,2) not null default 0,
  kg_segunda   numeric(12,2) not null default 0,
  kg_total     numeric(12,2) not null default 0,
  productores  integer not null default 0,
  veredas      integer not null default 0,
  total_venta  numeric(14,2) not null default 0,

  lote_id      uuid references public.inventory_lots (id) on delete set null,
  enlazado_por uuid references public.profiles (id) on delete set null,
  enlazado_en  timestamptz,

  synced_at    timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (fecha, ruta)
);

create index if not exists trazabilidad_acopios_lote_idx
  on public.trazabilidad_acopios (lote_id);

create trigger trazabilidad_acopios_set_updated_at
  before update on public.trazabilidad_acopios
  for each row execute function public.set_updated_at();

-- Enlazar y desenlazar dejan rastro solos. Ponerlo en la aplicación
-- significaría que un cambio hecho desde un script o desde el editor de
-- Supabase quedaría sin autor.
create or replace function public.trazabilidad_marca_enlace()
returns trigger
language plpgsql
as $$
begin
  if new.lote_id is distinct from old.lote_id then
    if new.lote_id is null then
      new.enlazado_por = null;
      new.enlazado_en = null;
    else
      new.enlazado_por = coalesce(new.enlazado_por, auth.uid());
      new.enlazado_en = now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trazabilidad_acopios_enlace on public.trazabilidad_acopios;
create trigger trazabilidad_acopios_enlace
  before update on public.trazabilidad_acopios
  for each row execute function public.trazabilidad_marca_enlace();

-- ── Entregas ────────────────────────────────────────────────────────────────
--
--  Una fila por productor y acopio: el eslabón final de la cadena.
create table if not exists public.trazabilidad_entregas (
  id            uuid primary key default gen_random_uuid(),
  acopio_id     uuid not null references public.trazabilidad_acopios (id) on delete cascade,
  -- Fila de la hoja, para poder ir a corregirla cuando algo no cuadre.
  fila          integer not null,
  productor     text not null,
  cedula        text,
  tipo_productor text,
  -- Se guardan las dos: la escritura original para no perder lo que dijo la
  -- hoja, y la clave para agrupar. Solo con la clave nadie podría comprobar de
  -- dónde salió la agrupación.
  vereda_cruda  text,
  vereda_clave  text,
  vereda_id     uuid references public.trazabilidad_lugares (id) on delete set null,
  calidad       text,
  kg_primera    numeric(12,2) not null default 0,
  kg_segunda    numeric(12,2) not null default 0,
  precio_base   numeric(14,2),
  bonificacion_calidad numeric(14,2),
  precio_kg_primera numeric(14,2),
  total_primera numeric(14,2),
  precio_kg_segunda numeric(14,2),
  total_segunda numeric(14,2),
  total_venta   numeric(14,2),
  created_at    timestamptz not null default now(),
  unique (acopio_id, fila)
);

create index if not exists trazabilidad_entregas_acopio_idx
  on public.trazabilidad_entregas (acopio_id);
create index if not exists trazabilidad_entregas_vereda_idx
  on public.trazabilidad_entregas (vereda_id);
create index if not exists trazabilidad_entregas_cedula_idx
  on public.trazabilidad_entregas (cedula);

-- ── Semilla ─────────────────────────────────────────────────────────────────
--
--  Las coordenadas NO salen de la memoria de nadie: son las de las cabeceras
--  municipales publicadas en Wikipedia, consultadas el 7-sep-2026, y cada fila
--  lo dice en `fuente`. Un punto sin procedencia no sirve para respaldar una
--  declaración de origen.
--
--  La bodega lleva la ubicación de la CIUDAD, no la de la dirección: nadie ha
--  dado la dirección exacta y ponerla aproximada sin decirlo sería justo el
--  error que este campo `fuente` existe para evitar.
insert into public.trazabilidad_lugares (tipo, nombre, clave, departamento, lat, lng, fuente)
values
  ('bodega',    'Bodega AROCO · Bogotá',   'arocobodegabogota', 'Bogotá D.C.', 4.609710, -74.081750, 'Bogotá D.C. (Wikipedia, 7-sep-2026) — ubicación de ciudad, falta la dirección de la bodega'),
  ('municipio', 'Guachené',                'guachene',     'Cauca',       3.133611, -76.392500, 'Wikipedia, 7-sep-2026'),
  ('municipio', 'Villa Rica',              'ricavilla',    'Cauca',       3.173611, -76.463056, 'Wikipedia, 7-sep-2026'),
  ('municipio', 'Padilla',                 'padilla',      'Cauca',       3.221944, -76.313056, 'Wikipedia, 7-sep-2026'),
  ('municipio', 'Miranda',                 'miranda',      'Cauca',       3.250278, -76.228611, 'Wikipedia, 7-sep-2026'),
  ('municipio', 'Caloto',                  'caloto',       'Cauca',       3.035556, -76.407778, 'Wikipedia, 7-sep-2026'),
  ('municipio', 'Santander de Quilichao',  'dequilichaosantander', 'Cauca', 3.008333, -76.483889, 'Wikipedia, 7-sep-2026')
on conflict do nothing;

insert into public.trazabilidad_rutas (numero, etiqueta, nota)
values
  (1, 'Padilla – Miranda',      'Del nombre del lote: «CISCA ruta #1 (Padilla - Miranda)»'),
  (2, 'Guachené – centro sur',  '«Centro sur» es una zona, no un municipio: falta precisar cuáles cubre'),
  (3, 'Guachené – Villa Rica',  'Del nombre del lote: «CISCA ruta #3 (Guachene - villa rica )»'),
  (4, 'Caloto – Santander',     'Del nombre del lote: «CISCA ruta #4 (Caloto - Santander)»')
on conflict (numero) do nothing;

-- Qué municipios toca cada ruta, deducido del nombre del lote. La ruta 2 dice
-- «centro sur», que es una zona y no un municipio, así que solo se le cuelga
-- Guachené hasta que alguien precise el resto.
insert into public.trazabilidad_ruta_municipios (ruta, lugar_id)
select r.numero, l.id
from public.trazabilidad_rutas r
join public.trazabilidad_lugares l on l.tipo = 'municipio' and l.clave = m.clave
join (values
  (1, 'padilla'), (1, 'miranda'),
  (2, 'guachene'),
  (3, 'guachene'), (3, 'ricavilla'),
  (4, 'caloto'), (4, 'dequilichaosantander')
) as m(ruta, clave) on m.ruta = r.numero
on conflict do nothing;

-- ── RLS ─────────────────────────────────────────────────────────────────────
--
--  Leer: cualquier miembro activo. La trazabilidad es justo lo que Comercial
--  necesita poder contarle a un cliente.
--
--  Escribir: Bodega Central y Administrativo, igual que el inventario del que
--  cuelga. La ingesta de la hoja corre con service_role y no pasa por aquí.
alter table public.trazabilidad_lugares enable row level security;
alter table public.trazabilidad_rutas enable row level security;
alter table public.trazabilidad_ruta_municipios enable row level security;
alter table public.trazabilidad_acopios enable row level security;
alter table public.trazabilidad_entregas enable row level security;

create policy "trazabilidad_lugares_select" on public.trazabilidad_lugares
  for select to authenticated using (public.is_active_member());
create policy "trazabilidad_lugares_write" on public.trazabilidad_lugares
  for all to authenticated
  using (public.can_write(array['Bodega Central','Administrativo']::public.department[]))
  with check (public.can_write(array['Bodega Central','Administrativo']::public.department[]));

create policy "trazabilidad_rutas_select" on public.trazabilidad_rutas
  for select to authenticated using (public.is_active_member());
create policy "trazabilidad_rutas_write" on public.trazabilidad_rutas
  for all to authenticated
  using (public.can_write(array['Bodega Central','Administrativo']::public.department[]))
  with check (public.can_write(array['Bodega Central','Administrativo']::public.department[]));

create policy "trazabilidad_ruta_municipios_select" on public.trazabilidad_ruta_municipios
  for select to authenticated using (public.is_active_member());
create policy "trazabilidad_ruta_municipios_write" on public.trazabilidad_ruta_municipios
  for all to authenticated
  using (public.can_write(array['Bodega Central','Administrativo']::public.department[]))
  with check (public.can_write(array['Bodega Central','Administrativo']::public.department[]));

create policy "trazabilidad_acopios_select" on public.trazabilidad_acopios
  for select to authenticated using (public.is_active_member());
create policy "trazabilidad_acopios_write" on public.trazabilidad_acopios
  for all to authenticated
  using (public.can_write(array['Bodega Central','Administrativo']::public.department[]))
  with check (public.can_write(array['Bodega Central','Administrativo']::public.department[]));

create policy "trazabilidad_entregas_select" on public.trazabilidad_entregas
  for select to authenticated using (public.is_active_member());
create policy "trazabilidad_entregas_write" on public.trazabilidad_entregas
  for all to authenticated
  using (public.can_write(array['Bodega Central','Administrativo']::public.department[]))
  with check (public.can_write(array['Bodega Central','Administrativo']::public.department[]));
