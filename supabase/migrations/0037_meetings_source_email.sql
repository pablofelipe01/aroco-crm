-- 0037 — Origen de correo del acta (dedup del cron de Actas)
-- Guarda el id del mensaje de Gmail del que se generó el acta, para no
-- re-procesar el mismo correo en cada corrida del cron (cada 2h).

alter table public.meetings
  add column if not exists source_email_id text;

create unique index if not exists meetings_source_email_id_key
  on public.meetings (source_email_id)
  where source_email_id is not null;
