-- ============================================================================
--  AROCO · 0107 — Correo al aprobador cuando una compra pide aprobación
--
--  Revisión del CRM del 2026-10-09: «el flujo de aprobación de compras no
--  genera alertas; configurar correo automático al autorizador». El aviso de
--  la campana sí sale (0055/0059), pero hay que entrar al CRM para verlo.
--
--  El correo sigue al aviso: cada vez que 0059 le anota a un aprobador un
--  `compra_aprobacion` en `notifications`, aquí se encola su correo. Así hereda
--  a quién se avisa (aprueba_compras) y el dedupe por día de 0055, sin repetir
--  esa lógica. El servidor vacía la cola (src/lib/correo/compras-aprobacion.ts),
--  como con los correos de tareas (0095).
--
--  Estados: pendiente · enviando · enviado · omitido (con motivo) · error.
-- ============================================================================

create table if not exists public.correos_compras (
  id               uuid primary key default gen_random_uuid(),
  -- Si se borra la solicitud, 0084 limpia sus avisos y con ellos el correo.
  notification_id  uuid not null unique references public.notifications(id) on delete cascade,
  solicitud_id     uuid not null references public.compra_solicitudes(id) on delete cascade,
  profile_id       uuid not null references public.profiles(id) on delete cascade,
  estado           text not null default 'pendiente'
                   check (estado in ('pendiente', 'enviando', 'enviado', 'omitido', 'error')),
  motivo           text,
  enviado_at       timestamptz,
  created_at       timestamptz not null default now()
);

comment on table public.correos_compras is
  'Cola de correos «compra por aprobar». La llena un trigger en notifications (compra_aprobacion); la vacía el servidor.';

create index if not exists correos_compras_pendientes_idx
  on public.correos_compras (created_at) where estado in ('pendiente', 'enviando');

alter table public.correos_compras enable row level security;

-- Como correos_tareas: la consulta un admin; nadie escribe desde el cliente.
drop policy if exists "correos_compras_select" on public.correos_compras;
create policy "correos_compras_select" on public.correos_compras
  for select to authenticated
  using (public.is_admin());

create or replace function public.anotar_correo_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.correos_compras (notification_id, solicitud_id, profile_id)
  values (new.id, new.related_id, new.for_user)
  on conflict (notification_id) do nothing;
  return new;
end;
$$;

revoke execute on function public.anotar_correo_compra() from public, anon, authenticated;

drop trigger if exists notifications_correo_compra on public.notifications;
create trigger notifications_correo_compra
  after insert on public.notifications
  for each row
  when (
    new.type = 'compra_aprobacion'
    and new.related_table = 'compra_solicitudes'
    and new.related_id is not null
    and new.for_user is not null
  )
  execute function public.anotar_correo_compra();
