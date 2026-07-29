-- ============================================================================
--  AROCO · 0042 — Correo y teléfono del contacto en leads
--
--  Hasta ahora el lead solo tenía `contact_name`, así que el equipo comercial
--  venía guardando el correo y el celular donde cabía: dentro del propio
--  nombre ("camilo Boteto cel 3174030026") o sueltos en las notas. Eso los
--  hace imposibles de buscar, de listar y de usar para un seguimiento.
--
--  Se agregan dos columnas propias y se rescata por única vez lo que ya estaba
--  escrito. El rescate es conservador y NO borra nada: las notas quedan
--  intactas, y solo se llena la columna cuando el patrón es inequívoco.
-- ============================================================================

alter table public.leads
  add column if not exists contact_email text,
  add column if not exists contact_phone text;

comment on column public.leads.contact_email is
  'Correo del contacto. Rescatado de notas/nombre en 0042 cuando era inequívoco.';
comment on column public.leads.contact_phone is
  'Celular del contacto (formato colombiano de 10 dígitos que empieza por 3).';

-- Búsqueda por correo desde el buscador del módulo comercial.
create index if not exists leads_contact_email_idx
  on public.leads (lower(contact_email))
  where contact_email is not null;

-- ── Rescate: correo ─────────────────────────────────────────────────────────
-- Primero el nombre del contacto, luego las notas. Se exige un dominio con TLD
-- de al menos dos letras para no capturar cosas como "a@b".
update public.leads
set contact_email = substring(
      coalesce(contact_name, '') || ' ' || coalesce(notes, '')
      from '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
    )
where contact_email is null
  and (coalesce(contact_name, '') || ' ' || coalesce(notes, ''))
      ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';

-- ── Rescate: celular ────────────────────────────────────────────────────────
-- Solo celulares colombianos: exactamente 10 dígitos que empiezan por 3. Se usa
-- el límite de palabra `\y` (no lookbehind) para que no coincida dentro de una
-- cifra más larga — así no se confunde con cantidades, años ni remisiones que
-- también aparecen en las notas.
update public.leads
set contact_phone = substring(
      coalesce(contact_name, '') || ' ' || coalesce(notes, '')
      from '\y(3[0-9]{9})\y'
    )
where contact_phone is null
  and (coalesce(contact_name, '') || ' ' || coalesce(notes, '')) ~ '\y3[0-9]{9}\y';
