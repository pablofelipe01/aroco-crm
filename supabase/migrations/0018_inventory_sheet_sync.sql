-- ============================================================================
--  AROCO · 0018 — Inventory sync from Google Sheet (source of truth)
--
--  A daily job (Vercel Cron → /api/cron/sync-inventory) reads the published
--  inventory sheet and calls import_inventory_sheet() to upsert lots and the
--  per-lot salidas as dispatches.
--
--  Idempotency:
--    • inventory_lots upserts on its existing (code, coalesce(remision,''))
--      unique index — the sheet is authoritative for quantities. We set only
--      sheet-sourced columns so manual fields (quality, price…) are preserved.
--    • dispatches get a stable `source_key` ("code#remision#sN") + unique index,
--      so re-running updates the same row instead of duplicating.
--
--  Trigger interaction (see 0012):
--    • lots_recompute_available overwrites qty_available_kg = in − out, so we
--      only set qty_in_kg / qty_out_kg and let the invariant hold.
--    • dispatches_to_movement fires ONLY when lot_id is set, auto-adding a
--      'salida' movement that would double-count against the sheet's own SALIDA
--      totals. Synced dispatches are therefore inserted with lot_id = NULL;
--      traceability is kept via origin (lot code) + remision_entrada.
-- ============================================================================

-- ── dispatches: mark provenance + stable key for idempotent re-sync ──────────
alter table public.dispatches
  add column if not exists source     text,
  add column if not exists source_key text;

-- NULLs are distinct, so manually-created dispatches (source_key IS NULL) never
-- collide; only sheet-sourced rows (non-null key) are deduplicated.
create unique index if not exists dispatches_source_key_key
  on public.dispatches (source_key);

-- ── sync run log — observability for the daily job ───────────────────────────
create table if not exists public.inventory_sync_runs (
  id                  uuid primary key default gen_random_uuid(),
  ran_at              timestamptz not null default now(),
  source              text not null default 'google_sheet',
  status              text not null,             -- 'ok' | 'error'
  rows_read           int  not null default 0,
  lots_upserted       int  not null default 0,
  dispatches_upserted int  not null default 0,
  duration_ms         int,
  error               text
);

create index if not exists inventory_sync_runs_ran_at_idx
  on public.inventory_sync_runs (ran_at desc);

alter table public.inventory_sync_runs enable row level security;

-- Active members can read the history; writes happen via service_role (cron),
-- which bypasses RLS — no insert policy is granted to app users.
create policy "inventory_sync_runs_select" on public.inventory_sync_runs
  for select using (public.is_active_member());

-- ── import_inventory_sheet — bulk upsert from parsed rows ─────────────────────
create or replace function public.import_inventory_sheet(
  p_lots       jsonb,
  p_dispatches jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lots       int := 0;
  v_dispatches int := 0;
begin
  with up as (
    insert into public.inventory_lots
      (code, entry_date, remision, qty_in_kg, qty_out_kg,
       samples_pasilla_merma_kg, notes)
    select
      r.code,
      r.entry_date,
      r.remision,
      coalesce(r.qty_in_kg, 0),
      coalesce(r.qty_out_kg, 0),
      coalesce(r.samples_pasilla_merma_kg, 0),
      r.notes
    from jsonb_to_recordset(p_lots) as r(
      code                     text,
      entry_date               date,
      remision                 text,
      qty_in_kg                numeric,
      qty_out_kg               numeric,
      samples_pasilla_merma_kg numeric,
      notes                    text
    )
    where r.code is not null and r.code <> ''
    on conflict (code, coalesce(remision, '')) do update set
      entry_date               = excluded.entry_date,
      qty_in_kg                = excluded.qty_in_kg,
      qty_out_kg               = excluded.qty_out_kg,
      samples_pasilla_merma_kg = excluded.samples_pasilla_merma_kg,
      notes                    = coalesce(excluded.notes, public.inventory_lots.notes)
    returning 1
  )
  select count(*) into v_lots from up;

  with up as (
    insert into public.dispatches
      (source, source_key, dispatch_date, destination, qty_kg,
       remision_salida, remision_entrada, origin, lot_id, needs_review)
    select
      'sheet',
      r.source_key,
      coalesce(r.dispatch_date, current_date),
      r.destination,
      r.qty_kg,
      r.remision_salida,
      r.remision_entrada,
      r.origin,
      null,
      false
    from jsonb_to_recordset(p_dispatches) as r(
      source_key       text,
      dispatch_date    date,
      destination      text,
      qty_kg           numeric,
      remision_salida  text,
      remision_entrada text,
      origin           text
    )
    where r.source_key is not null and coalesce(r.qty_kg, 0) > 0
    on conflict (source_key) do update set
      dispatch_date    = excluded.dispatch_date,
      destination      = excluded.destination,
      qty_kg           = excluded.qty_kg,
      remision_salida  = excluded.remision_salida,
      remision_entrada = excluded.remision_entrada,
      origin           = excluded.origin
    returning 1
  )
  select count(*) into v_dispatches from up;

  return jsonb_build_object('lots', v_lots, 'dispatches', v_dispatches);
end;
$$;

-- Only the scheduled job (service_role) may run the bulk importer.
revoke execute on function public.import_inventory_sheet(jsonb, jsonb)
  from anon, authenticated;
grant  execute on function public.import_inventory_sheet(jsonb, jsonb)
  to service_role;
