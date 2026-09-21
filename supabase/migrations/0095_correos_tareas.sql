-- ============================================================================
--  AROCO · 0095 — Correo al asignar una tarea
--
--  Se acordó avisar por correo, como Asana, cuando a alguien le asignan una
--  tarea. Las asignaciones entran por cuatro lados —el formulario de Tareas,
--  el acta subida a mano, el ingest del correo de Renata y la unión de
--  repetidas—, así que en vez de acordarse de avisar en cada uno, la base
--  anota cada asignación en una cola y el servidor envía lo pendiente.
--
--  Un correo por persona y por acta, no uno por tarea: un comité deja 20
--  compromisos de golpe y 20 correos seguidos es spam.
--
--  Estados:
--    pendiente  anotada, sin enviar
--    enviando   tomada por un envío en curso (evita mandarla dos veces)
--    enviado
--    omitido    no se manda, y `motivo` dice por qué
--    error      Resend la rechazó; `motivo` guarda el error
-- ============================================================================

create table if not exists public.correos_tareas (
  id              uuid primary key default gen_random_uuid(),
  task_id         uuid not null references public.tasks(id) on delete cascade,
  team_member_id  uuid not null references public.team_members(id) on delete cascade,
  -- Quién asignó. Null cuando fue el sistema (ingest con service_role).
  asignado_por    uuid references public.profiles(id) on delete set null,
  estado          text not null default 'pendiente'
                  check (estado in ('pendiente', 'enviando', 'enviado', 'omitido', 'error')),
  motivo          text,
  enviado_at      timestamptz,
  created_at      timestamptz not null default now(),
  -- Quitar a alguien y volver a ponerlo no manda un segundo correo.
  unique (task_id, team_member_id)
);

comment on table public.correos_tareas is
  'Cola de correos de «te asignaron una tarea». La llena un trigger en task_assignees; la vacía el servidor (src/lib/correo/tareas-asignadas.ts).';

create index if not exists correos_tareas_pendientes_idx
  on public.correos_tareas (created_at) where estado in ('pendiente', 'enviando');

alter table public.correos_tareas enable row level security;

-- Solo Dirección la consulta, para saber si a alguien le llegó o no. Nadie
-- escribe desde el cliente: el trigger y el servidor (service_role) bastan.
drop policy if exists "correos_tareas_select" on public.correos_tareas;
create policy "correos_tareas_select" on public.correos_tareas
  for select to authenticated
  using (public.is_admin());

-- ── Anotar cada asignación ─────────────────────────────────────────────────
--
--  SECURITY DEFINER porque la cola no tiene política de insert: quien asigna
--  no debe poder escribir en ella por su cuenta, solo a través de asignar.
--
--  `aroco.sin_correo` lo pone una operación que asigna sin que sea una tarea
--  nueva para esa persona (unir repetidas): la tarea ya la tenía en la otra.
create or replace function public.anotar_correo_tarea()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(current_setting('aroco.sin_correo', true), '') = '1' then
    return new;
  end if;
  insert into public.correos_tareas (task_id, team_member_id, asignado_por)
  values (new.task_id, new.team_member_id, auth.uid())
  on conflict (task_id, team_member_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.anotar_correo_tarea() from public, anon, authenticated;

drop trigger if exists task_assignees_correo on public.task_assignees;
create trigger task_assignees_correo
  after insert on public.task_assignees
  for each row execute function public.anotar_correo_tarea();

-- ── Unir repetidas no avisa ────────────────────────────────────────────────
--
--  Misma función que 0094, con una línea más: al heredar los responsables de
--  la repetida, esas personas ya tenían la tarea; un correo de «te asignaron»
--  sería falso.
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

  -- Solo para esta transacción: los responsables heredados no reciben correo.
  perform set_config('aroco.sin_correo', '1', true);
  insert into public.task_assignees (task_id, team_member_id)
  select v_vieja.id, ta.team_member_id
    from public.task_assignees ta
   where ta.task_id = v_nueva.id
  on conflict do nothing;
  perform set_config('aroco.sin_correo', '', true);

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
end;
$$;

revoke execute on function public.resolver_tarea_parecida(uuid, text) from public, anon;
grant execute on function public.resolver_tarea_parecida(uuid, text) to authenticated;
