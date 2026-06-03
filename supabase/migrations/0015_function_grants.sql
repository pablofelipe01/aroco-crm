-- ============================================================================
--  AROCO · 0015 — Tighten function EXECUTE grants
--
--  New functions are granted EXECUTE to PUBLIC by default, so revoking from
--  `anon`/`authenticated` individually had no effect. Revoke from PUBLIC and
--  re-grant only where needed:
--   • RLS helpers must stay callable by `authenticated` (policy evaluation runs
--     as the querying role).
--   • Trigger-only / cron functions need no direct EXECUTE at all (triggers and
--     pg_cron invoke them outside the REST API).
-- ============================================================================

-- RLS helpers — authenticated only.
revoke execute on function public.is_admin() from public;
revoke execute on function public.is_active_member() from public;
revoke execute on function public.can_write(public.department[]) from public;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_active_member() to authenticated;
grant execute on function public.can_write(public.department[]) to authenticated;

-- Trigger / cron / internal functions — no direct API access.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.lot_recompute_available() from public;
revoke execute on function public.movement_apply_to_lot() from public;
revoke execute on function public.dispatch_to_movement() from public;
revoke execute on function public.notify_price_change() from public;
revoke execute on function public.generate_daily_reminders() from public;
