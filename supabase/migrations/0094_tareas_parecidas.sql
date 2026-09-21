-- ============================================================================
--  AROCO · 0094 — Tareas que se repiten entre reuniones
--
--  Cada acta crea sus tareas sin mirar las anteriores, así que un compromiso
--  que se vuelve a mencionar en la reunión siguiente queda dos veces: «Enviar
--  precios de compra semanal del Cauca» y, una semana después, «Enviar precio
--  de compra semanal al Cauca».
--
--  Se acordó (acta del 15-sep) que Renata las SEÑALE sin cerrarlas: el equipo
--  decide. Así que aquí solo se guarda la sugerencia; nada se cierra hasta que
--  alguien diga «es la misma».
--
--    task_id     la tarea más nueva, la que parece repetida
--    parecida_a  la que ya existía
--
--  «Son distintas» también queda guardado, para no volver a sugerir el par.
-- ============================================================================

-- Cuando dos tareas se unen, la repetida se cierra y apunta a la que sigue.
alter table public.tasks
  add column if not exists unida_a uuid references public.tasks(id) on delete set null;

comment on column public.tasks.unida_a is
  'Si la tarea se unió a otra por ser la misma: la tarea que sigue. La unida queda cerrada y fuera del tablero.';

create table if not exists public.task_parecidas (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks(id) on delete cascade,
  parecida_a   uuid not null references public.tasks(id) on delete cascade,
  motivo       text,
  estado       text not null default 'pendiente'
               check (estado in ('pendiente', 'misma', 'distinta')),
  decidido_por uuid references public.profiles(id) on delete set null,
  decidido_at  timestamptz,
  created_at   timestamptz not null default now(),
  check (task_id <> parecida_a)
);

comment on table public.task_parecidas is
  'Pares de tareas que la IA cree repetidas entre actas. Solo sugerencias: las resuelve una persona con resolver_tarea_parecida().';

-- Un par se sugiere una sola vez, sin importar el orden.
create unique index if not exists task_parecidas_par
  on public.task_parecidas (least(task_id, parecida_a), greatest(task_id, parecida_a));
create index if not exists task_parecidas_task_idx on public.task_parecidas (task_id);
create index if not exists task_parecidas_parecida_idx on public.task_parecidas (parecida_a);

alter table public.task_parecidas enable row level security;

-- Se ve el par solo si se ven LAS DOS tareas: la sugerencia enseña el nombre
-- de la otra, y la RLS de tasks limita cada tarea a su área.
drop policy if exists "task_parecidas_select" on public.task_parecidas;
create policy "task_parecidas_select" on public.task_parecidas
  for select to authenticated
  using (
    public.is_active_member()
    and exists (select 1 from public.tasks t where t.id = task_id)
    and exists (select 1 from public.tasks t where t.id = parecida_a)
  );

drop policy if exists "task_parecidas_update" on public.task_parecidas;
create policy "task_parecidas_update" on public.task_parecidas
  for update to authenticated
  using (
    public.is_active_member()
    and exists (select 1 from public.tasks t where t.id = task_id)
    and exists (select 1 from public.tasks t where t.id = parecida_a)
  )
  with check (public.is_active_member());

-- Sin política de insert ni delete: las sugerencias las crea el ingest con
-- service_role y se borran solas con sus tareas.

-- ── Resolver una sugerencia ────────────────────────────────────────────────
--
--  SECURITY INVOKER a propósito: cada escritura pasa por la RLS de quien
--  decide. Una escritura que la RLS bloquea no da error, deja cero filas, así
--  que cada paso comprueba FOUND y falla en voz alta.
--
--  «misma»: la original se queda con los responsables de las dos y, si no
--  tenía vencimiento, con el de la repetida; la repetida se cierra con
--  unida_a. Las dos bitácoras cuentan qué pasó y quién lo decidió.
create or replace function public.resolver_tarea_parecida(p_id uuid, p_decision text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_par    public.task_parecidas%rowtype;
  v_nueva  public.tasks%rowtype;
  v_vieja  public.tasks%rowtype;
  v_autor  text;
  v_acta   text;
begin
  if p_decision not in ('misma', 'distinta') then
    raise exception 'Decisión inválida: %', p_decision using errcode = '22023';
  end if;

  select * into v_par from public.task_parecidas
   where id = p_id and estado = 'pendiente'
   for update;
  if not found then
    raise exception 'Esta sugerencia ya se resolvió o no está a tu alcance.' using errcode = 'P0002';
  end if;

  update public.task_parecidas
     set estado = p_decision, decidido_por = auth.uid(), decidido_at = now()
   where id = p_id;
  if not found then
    raise exception 'No tienes permiso para resolver esta sugerencia.' using errcode = '42501';
  end if;

  if p_decision = 'distinta' then
    return;
  end if;

  select * into v_nueva from public.tasks where id = v_par.task_id;
  select * into v_vieja from public.tasks where id = v_par.parecida_a;
  if v_nueva.id is null or v_vieja.id is null then
    raise exception 'No tienes acceso a las dos tareas.' using errcode = '42501';
  end if;

  select full_name into v_autor from public.profiles where id = auth.uid();
  select '«' || m.title || '» del ' || to_char(m.meeting_date, 'DD/MM/YYYY')
    into v_acta from public.meetings m where m.id = v_nueva.meeting_id;

  insert into public.task_assignees (task_id, team_member_id)
  select v_vieja.id, ta.team_member_id
    from public.task_assignees ta
   where ta.task_id = v_nueva.id
  on conflict do nothing;

  update public.tasks
     set due_date = coalesce(due_date, v_nueva.due_date)
   where id = v_vieja.id;
  if not found then
    raise exception 'No se pudo actualizar la tarea original.' using errcode = '42501';
  end if;

  update public.tasks
     set status = 'done', unida_a = v_vieja.id
   where id = v_nueva.id;
  if not found then
    raise exception 'No se pudo cerrar la tarea repetida.' using errcode = '42501';
  end if;

  insert into public.task_notes (task_id, body, author_name, created_by) values
    (v_vieja.id,
     'Se repitió' || coalesce(' en el acta ' || v_acta, '') || ' como «' || v_nueva.name ||
       '». Se unieron: esta es la que sigue.',
     v_autor, auth.uid()),
    (v_nueva.id,
     'Es la misma que «' || v_vieja.name || '». Se cerró aquí y sigue en esa.',
     v_autor, auth.uid());
  -- Otras sugerencias pendientes sobre la repetida quedan como están: la
  -- pantalla solo muestra pares con las dos tareas abiertas, y borrarlas aquí
  -- necesitaría una política de delete que nadie más debe tener.
end;
$$;

revoke execute on function public.resolver_tarea_parecida(uuid, text) from public, anon;
grant execute on function public.resolver_tarea_parecida(uuid, text) to authenticated;
