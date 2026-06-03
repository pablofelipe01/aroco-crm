-- ============================================================================
--  AROCO · 0003 — Profiles & team catalog
-- ============================================================================

-- ── profiles ─────────────────────────────────────────────────────────────
-- One row per auth user. Created automatically by a trigger on auth.users.
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  email       text not null,
  department  public.department,
  role        public.user_role not null default 'member',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ── team_members ─────────────────────────────────────────────────────────
-- Catalog of the AROCO team. Lets us assign owners/responsibles even to
-- people without a login. Optionally linked to a profile.
create table public.team_members (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  role_title  text,
  department  public.department,
  color       text,                                   -- hex accent for avatars/chips
  profile_id  uuid references public.profiles (id) on delete set null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create unique index team_members_name_key on public.team_members (lower(name));

create trigger team_members_set_updated_at
  before update on public.team_members
  for each row execute function public.set_updated_at();

-- ── Auto-provision a profile when an auth user is created ──────────────────
-- Department/role/full_name come from the invite/onboarding metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, department, role)
  values (
    new.id,
    new.email,
    coalesce(nullif(new.raw_user_meta_data ->> 'full_name', ''), new.email),
    nullif(new.raw_user_meta_data ->> 'department', '')::public.department,
    coalesce(nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role, 'member')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
