-- ============================================================================
--  AROCO · 0016 — profiles.onboarded
--
--  Marks whether a user finished account setup (name + department + password).
--  Invited users land authenticated but without a password; the onboarding
--  screen captures it and flips this flag. Existing users are backfilled true.
-- ============================================================================

alter table public.profiles
  add column if not exists onboarded boolean not null default false;

update public.profiles set onboarded = true where onboarded = false;
