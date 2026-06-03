-- ============================================================================
--  AROCO · 0014 — Schedule daily reminders (pg_cron)
--
--  Runs generate_daily_reminders() every day at 12:00 UTC. Email/WhatsApp
--  delivery stays DISABLED (comms decision); this only populates in-app
--  notifications. To wire delivery later, add an Edge Function + provider keys.
-- ============================================================================

create extension if not exists pg_cron;

select cron.schedule(
  'aroco-daily-reminders',
  '0 12 * * *',
  $$ select public.generate_daily_reminders(); $$
);
