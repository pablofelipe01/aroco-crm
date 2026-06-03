-- ============================================================================
--  AROCO · 0002 — Shared trigger function (updated_at)
--
--  RLS helper functions live in 0008 (after `profiles` exists) because
--  `language sql` validates their body — which references profiles — at
--  creation time.
-- ============================================================================

-- Touch updated_at on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
