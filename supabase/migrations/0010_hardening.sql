-- ============================================================================
--  AROCO · 0010 — Security hardening (advisor follow-ups)
-- ============================================================================

-- Pin search_path on the trigger function (was mutable).
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- The RLS helpers are SECURITY DEFINER and must remain callable by
-- `authenticated` (policy expressions are evaluated as the current role).
-- But there is no reason to expose them over the RPC API to `anon`.
revoke execute on function public.is_admin() from anon;
revoke execute on function public.is_active_member() from anon;
revoke execute on function public.can_write(public.department[]) from anon;

-- handle_new_user is a trigger function only — never call it directly.
revoke execute on function public.handle_new_user() from anon, authenticated;
