-- ============================================================================
--  AROCO · 0017 — Actas (meeting minutes) + AI task extraction
--
--  A meeting/acta stores the uploaded file (Supabase Storage bucket 'actas')
--  and links to the tasks the AI extracted from it (tasks.meeting_id).
-- ============================================================================

create table public.meetings (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  meeting_date  date,
  file_path     text,
  file_name     text,
  notes         text,
  created_by    uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index meetings_created_idx on public.meetings (created_at desc);

create trigger meetings_set_updated_at
  before update on public.meetings
  for each row execute function public.set_updated_at();

-- Link generated tasks back to their acta.
alter table public.tasks
  add column if not exists meeting_id uuid references public.meetings (id) on delete set null;
create index if not exists tasks_meeting_idx on public.tasks (meeting_id);

-- ── RLS: any active member reads/creates actas ──────────────────────────────
alter table public.meetings enable row level security;

create policy "meetings_select" on public.meetings
  for select to authenticated
  using (public.is_active_member());

create policy "meetings_write" on public.meetings
  for all to authenticated
  using (public.is_active_member())
  with check (public.is_active_member());

-- ── Storage bucket for acta files (private) ─────────────────────────────────
insert into storage.buckets (id, name, public)
values ('actas', 'actas', false)
on conflict (id) do nothing;

create policy "actas_read" on storage.objects
  for select to authenticated
  using (bucket_id = 'actas' and public.is_active_member());

create policy "actas_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'actas' and public.is_active_member());

create policy "actas_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'actas' and public.is_admin());
