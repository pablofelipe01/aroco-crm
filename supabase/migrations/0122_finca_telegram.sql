-- ============================================================================
--  AROCO · 0122 — Labores Finca por Telegram (audios)
--
--  Reemplaza a /campo como camino principal (/campo queda de respaldo, fuera
--  del menú). Cada trabajador le habla al bot: manda un audio contando qué
--  hizo, el servidor lo pasa a texto (OpenAI), Claude saca labor, válvulas,
--  horas y cantidades contra el catálogo, el bot le lee el resumen y el
--  trabajador toca «Está bien». Solo entonces se escribe en `finca_registros`
--  / `finca_equipo_usos`, con origen 'telegram'.
--
--  Telegram resuelve lo de la señal: el audio grabado en la plantación queda
--  en el teléfono y sale solo cuando hay internet.
--
--  QUIÉN ES QUIÉN: un bot no puede escribirle a un número. La persona abre el
--  bot una vez y toca «Compartir mi número»; si el número está en
--  `finca_telegram_usuarios`, queda enlazado su `chat_id`. Los números los
--  pone Dirección desde /labores-finca.
--
--  Todo lo escribe el servidor con service role (webhook y crons). La RLS
--  deja a Dirección leer todo y editar los números.
-- ============================================================================

-- ── Quién habla con el bot ──────────────────────────────────────────────────
--
--  trabajador: registra lo suyo (empleado_id obligatorio).
--  supervisor: registra por cualquiera (Angela anota por quien no tenga
--  Telegram) y, con recibe_avisos, recibe a las 5 p. m. la lista de quién no
--  ha enviado.
create table if not exists public.finca_telegram_usuarios (
  id                uuid primary key default gen_random_uuid(),
  nombre            text not null,
  -- Solo dígitos, con indicativo: 573174304429. Así se compara con lo que
  -- manda Telegram al compartir el contacto (a veces con «+», a veces sin).
  telefono          text not null unique check (telefono ~ '^\d{10,15}$'),
  empleado_id       uuid unique references public.finca_empleados (id) on delete cascade,
  rol               text not null default 'trabajador' check (rol in ('trabajador', 'supervisor')),
  recibe_avisos     boolean not null default false,
  chat_id           bigint unique,
  telegram_user_id  bigint,
  vinculado_en      timestamptz,
  activo            boolean not null default true,
  created_by        uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (rol = 'supervisor' or empleado_id is not null)
);

create trigger finca_telegram_usuarios_set_updated_at
  before update on public.finca_telegram_usuarios
  for each row execute function public.set_updated_at();

insert into public.finca_telegram_usuarios (nombre, telefono, rol, recibe_avisos)
values ('Angela Acosta', '573174304429', 'supervisor', true)
on conflict (telefono) do nothing;

-- ── Cada mensaje que llega ──────────────────────────────────────────────────
--
--  Bitácora completa: el audio (Storage, bucket finca-audios), lo que se
--  entendió, lo que se propuso y en qué terminó. Si un dato queda mal, se
--  oye el audio y se corrige desde «Registros».
--
--  `update_id` único: Telegram reintenta el webhook si no contestamos a
--  tiempo; el segundo intento choca aquí y no se procesa dos veces.
--
--  Estados:
--    recibido       → llegó, se está procesando
--    por_confirmar  → el bot mandó el resumen y espera «Está bien»
--    confirmado     → se escribió en la base (registros / usos)
--    reemplazado    → llegó otro audio que lo corrige (anterior_id)
--    descartado     → el trabajador tocó «Borrar»
--    ignorado       → no era un reporte (saludo, pregunta)
--    error          → falló la transcripción o la extracción
create table if not exists public.finca_telegram_mensajes (
  id             uuid primary key default gen_random_uuid(),
  update_id      bigint unique,
  chat_id        bigint not null,
  usuario_id     uuid references public.finca_telegram_usuarios (id) on delete set null,
  tipo           text not null check (tipo in ('voz', 'texto')),
  file_id        text,
  audio_path     text,
  duracion_s     integer,
  texto          text,
  extraccion     jsonb,
  propuesta      jsonb,
  estado         text not null default 'recibido' check (estado in (
                   'recibido', 'por_confirmar', 'confirmado', 'reemplazado',
                   'descartado', 'ignorado', 'error')),
  error          text,
  fecha_labor    date,
  anterior_id    uuid references public.finca_telegram_mensajes (id) on delete set null,
  registros      uuid[] not null default '{}',
  usos           uuid[] not null default '{}',
  confirmado_en  timestamptz,
  -- El resumen que mandó el bot, para quitarle los botones cuando se
  -- reemplaza o confirma.
  bot_message_id bigint,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists finca_telegram_mensajes_chat_idx
  on public.finca_telegram_mensajes (chat_id, created_at desc);
create index if not exists finca_telegram_mensajes_pendientes_idx
  on public.finca_telegram_mensajes (chat_id) where estado = 'por_confirmar';

create trigger finca_telegram_mensajes_set_updated_at
  before update on public.finca_telegram_mensajes
  for each row execute function public.set_updated_at();

-- ── Recordatorios y avisos ya enviados ──────────────────────────────────────
--
--  Si el cron corre dos veces (reintento de Vercel), el segundo no vuelve a
--  escribirle a nadie.
create table if not exists public.finca_telegram_envios (
  id          uuid primary key default gen_random_uuid(),
  fecha       date not null,
  tipo        text not null check (tipo in ('recordatorio', 'insistencia', 'aviso')),
  usuario_id  uuid not null references public.finca_telegram_usuarios (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (fecha, tipo, usuario_id)
);

-- ── Lo que entra por Telegram ───────────────────────────────────────────────
alter table public.finca_registros drop constraint if exists finca_registros_origen_check;
alter table public.finca_registros add constraint finca_registros_origen_check
  check (origen in ('app', 'hoja', 'telegram'));
alter table public.finca_registros
  add column if not exists telegram_mensaje_id uuid
  references public.finca_telegram_mensajes (id) on delete set null;

alter table public.finca_equipo_usos drop constraint if exists finca_equipo_usos_origen_check;
alter table public.finca_equipo_usos add constraint finca_equipo_usos_origen_check
  check (origen in ('app', 'hoja', 'telegram'));
alter table public.finca_equipo_usos
  add column if not exists telegram_mensaje_id uuid
  references public.finca_telegram_mensajes (id) on delete set null;

-- ── RLS ─────────────────────────────────────────────────────────────────────
alter table public.finca_telegram_usuarios enable row level security;
alter table public.finca_telegram_mensajes enable row level security;
alter table public.finca_telegram_envios   enable row level security;

create policy "finca_telegram_usuarios_direccion" on public.finca_telegram_usuarios
  for all to authenticated
  using (public.is_direccion()) with check (public.is_direccion());
create policy "finca_telegram_mensajes_direccion" on public.finca_telegram_mensajes
  for select to authenticated
  using (public.is_direccion());
create policy "finca_telegram_envios_direccion" on public.finca_telegram_envios
  for select to authenticated
  using (public.is_direccion());

-- ── Audios ──────────────────────────────────────────────────────────────────
--
--  Privado. Lo escribe el webhook con service role; la página firma la URL
--  en el servidor después de comprobar que es Dirección.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('finca-audios', 'finca-audios', false, 20971520,
        array['audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav', 'audio/webm'])
on conflict (id) do nothing;
