-- ============================================================================
--  AROCO · 0050 — Delegar la administración de un acta
--
--  0049 dejó que administrara un acta solo el SuperAdmin que asistió, más el
--  Gerente General. En la práctica eso encierra demasiado: sobre las actas de
--  hoy, Pablo podía administrar 2 de 17 y Alejo ninguna, aunque ambos tengan
--  acceso total.
--
--  Se añade delegación: quien administra un acta puede pasarle ese rol a otro
--  SuperAdmin, igual que le da acceso de lectura. Álvaro, que las administra
--  todas por ser la raíz del organigrama, puede repartir desde ahí.
--
--  De paso se separan tres cosas que estaban mezcladas en la misma fila:
--    · attended    → hecho: estuvo en la reunión.
--    · can_view    → permiso: puede leer el acta.
--    · can_manage  → permiso: puede repartir el acceso.
--  Sin `attended`, dar acceso a alguien que no fue lo dejaba registrado como
--  asistente, falseando el acta.
-- ============================================================================

alter table public.meeting_attendees
  add column if not exists attended   boolean not null default true,
  add column if not exists can_manage boolean not null default false;

comment on column public.meeting_attendees.attended is
  'Estuvo en la reunión. Es un hecho: no se quita al retirarle el acceso.';
comment on column public.meeting_attendees.can_manage is
  'Puede repartir el acceso del acta. Solo surte efecto en SuperAdmins.';

-- ── Quién administra ────────────────────────────────────────────────────────
-- Sigue exigiendo acceso total: la delegación reparte entre SuperAdmins, no
-- convierte a un miembro en administrador del acta.
create or replace function public.can_manage_meeting(p_meeting uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.is_admin()
    and (
      public.is_org_root()
      or exists (
        select 1
        from public.meeting_attendees a
        where a.meeting_id = p_meeting
          and (a.attended or a.can_manage)
          and (
            a.profile_id = auth.uid()
            or lower(a.email) = lower((select p.email from public.profiles p where p.id = auth.uid()))
          )
      )
    );
$$;

revoke execute on function public.can_manage_meeting(uuid) from anon;
grant execute on function public.can_manage_meeting(uuid) to authenticated;
