-- ============================================================================
--  AROCO · 0096 — Registro de los resúmenes de tareas por correo
--
--  Un resumen diario por persona (L–V) y uno semanal por jefe de área (lunes).
--  Esta tabla es a la vez el candado y la bitácora: cada envío se toma
--  insertando su fila, y la clave única (tipo, persona, día) hace que un cron
--  que se reintenta, o dos que corren a la vez, no manden el mismo resumen
--  dos veces.
-- ============================================================================

create table if not exists public.correos_resumenes (
  id              uuid primary key default gen_random_uuid(),
  tipo            text not null check (tipo in ('diario', 'semanal')),
  team_member_id  uuid not null references public.team_members(id) on delete cascade,
  -- Día (hora de Bogotá) al que corresponde el resumen.
  periodo         date not null,
  estado          text not null default 'enviando'
                  check (estado in ('enviando', 'enviado', 'error')),
  motivo          text,
  enviado_at      timestamptz,
  created_at      timestamptz not null default now(),
  unique (tipo, team_member_id, periodo)
);

comment on table public.correos_resumenes is
  'Resúmenes de tareas enviados por correo (src/lib/correo/enviar-resumenes.ts). La clave única evita mandar dos veces el mismo.';

alter table public.correos_resumenes enable row level security;

-- Solo Dirección la consulta. Escribe el servidor con service_role.
drop policy if exists "correos_resumenes_select" on public.correos_resumenes;
create policy "correos_resumenes_select" on public.correos_resumenes
  for select to authenticated
  using (public.is_admin());
