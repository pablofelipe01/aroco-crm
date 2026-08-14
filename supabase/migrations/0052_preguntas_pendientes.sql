-- ============================================================================
--  AROCO · 0052 — Preguntas pendientes
--
--  Las dudas que quedan abiertas entre reunión y reunión. Hoy viven en notas
--  sueltas, en chats y en la cabeza de quien las detectó: llega la reunión con
--  AROCO y se pregunta lo que uno alcanza a recordar. Lo demás se arrastra
--  meses. La fórmula de Bonificación Calidad del cotizador nacional lleva
--  pendiente desde que se escribió la especificación.
--
--  Por eso esto es una lista corta y viva, para abrirla EN la reunión: qué se
--  pregunta, por qué importa y qué está esperando esa respuesta. Cuando llega
--  la respuesta se guarda aquí mismo, junto a la pregunta, que es lo que
--  después nadie encuentra.
-- ============================================================================

do $$ begin
  create type public.pregunta_estado as enum (
    'Pendiente',
    'Respondida',
    'Descartada'   -- ya no aplica: cambió el proceso, se resolvió por otro lado
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pregunta_prioridad as enum ('Alta', 'Media', 'Baja');
exception when duplicate_object then null; end $$;

create table if not exists public.preguntas (
  id          uuid primary key default gen_random_uuid(),
  pregunta    text not null,

  -- Por qué importa y qué está frenando. Sin esto, en la reunión hay que
  -- reconstruir de memoria por qué se anotó la pregunta hace seis semanas.
  contexto    text,
  bloquea     text,

  -- A quién hay que preguntarle. Texto libre a propósito: casi siempre es
  -- alguien de AROCO que no tiene usuario en el CRM.
  para_quien  text,

  area        public.department,
  prioridad   public.pregunta_prioridad not null default 'Media',
  estado      public.pregunta_estado not null default 'Pendiente',

  -- La respuesta vive pegada a la pregunta. Guardarla en un acta aparte es
  -- justamente cómo se pierden.
  respuesta     text,
  respondida_en timestamptz,
  respondida_por uuid references public.profiles (id) on delete set null,

  -- De qué reunión salió, si salió de una.
  meeting_id  uuid references public.meetings (id) on delete set null,

  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists preguntas_estado_idx
  on public.preguntas (estado, prioridad, created_at);
create index if not exists preguntas_meeting_idx
  on public.preguntas (meeting_id);

create trigger preguntas_set_updated_at
  before update on public.preguntas
  for each row execute function public.set_updated_at();

-- Marcar la fecha y el autor de la respuesta desde el servidor: si dependiera
-- del cliente, una respuesta guardada sin fecha no se distingue de una vieja.
create or replace function public.stamp_pregunta_respuesta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'Respondida' and old.estado is distinct from 'Respondida' then
    new.respondida_en := coalesce(new.respondida_en, now());
    new.respondida_por := coalesce(new.respondida_por, auth.uid());
  end if;

  -- Si se reabre, se limpia el sello: dejarlo sería afirmar que sigue
  -- respondida.
  if new.estado = 'Pendiente' and old.estado is distinct from 'Pendiente' then
    new.respondida_en := null;
    new.respondida_por := null;
  end if;

  return new;
end;
$$;

create trigger preguntas_stamp_respuesta
  before update on public.preguntas
  for each row execute function public.stamp_pregunta_respuesta();

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Una pregunta pendiente no es información reservada y cualquiera del equipo
-- puede detectar una, así que leer y crear queda abierto a miembros activos.
alter table public.preguntas enable row level security;

create policy "preguntas_select" on public.preguntas
  for select to authenticated using (public.is_active_member());
create policy "preguntas_insert" on public.preguntas
  for insert to authenticated with check (public.is_active_member());
create policy "preguntas_update" on public.preguntas
  for update to authenticated
  using (public.is_active_member()) with check (public.is_active_member());
-- Borrar solo lo propio y sin responder. Una pregunta ya respondida es
-- historial: para sacarla de la lista está «Descartada».
create policy "preguntas_delete" on public.preguntas
  for delete to authenticated
  using (
    public.is_admin()
    or (created_by = auth.uid() and estado = 'Pendiente')
  );

-- ── Las que ya están abiertas ───────────────────────────────────────────────
-- El módulo no arranca vacío: estas tres son preguntas reales, verificadas
-- contra la hoja el 14-ago-2026, que hoy están esperando respuesta.
insert into public.preguntas (pregunta, contexto, bloquea, para_quien, area, prioridad)
select v.pregunta, v.contexto, v.bloquea, v.para_quien,
       v.area::public.department, v.prioridad::public.pregunta_prioridad
from (values
  (
    'Del cacao que entra por báscula, ¿de verdad el 99,8 % es Premium?',
    'La hoja registra 348.617 de 349.268 kg de ingreso como PREMIUM, y el 100 % de lo despachado sale como Premium. Las salidas cuadran lote por lote, así que el CRM está leyendo bien; la duda es si en la báscula se clasifica de verdad o si se anota Premium por defecto para no complicar la fila.',
    'El desglose por clasificación del dashboard de ventas y cualquier análisis de precio por grado.',
    'Renata Bonilla / Nicolás Rodríguez',
    'Operaciones',
    'Alta'
  ),
  (
    '¿Cuál es la fórmula real de la Bonificación Calidad del cotizador nacional?',
    'Pendiente desde la especificación original: quedó anotada como «por confirmar» y sigue igual.',
    'El cotizador de cacao nacional no se puede terminar sin ella.',
    'Nicolás Rodríguez',
    'Comercial',
    'Alta'
  ),
  (
    'El lote COL-MET-PRICO-100826 (APROCACAO) tiene fecha 10-ago-1962. ¿Se corrige a 2026?',
    'El código del lote dice 100826, así que parece un error de digitación en la hoja. Entró con 0 kg y un valor de compra de $14.000. El CRM lo carga tal cual, y aparece como el lote más antiguo del inventario.',
    'Nada crítico, pero desordena cualquier vista ordenada por fecha de ingreso.',
    'Renata Bonilla',
    'Operaciones',
    'Baja'
  )
) as v(pregunta, contexto, bloquea, para_quien, area, prioridad)
where not exists (select 1 from public.preguntas);
