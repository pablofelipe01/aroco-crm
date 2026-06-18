import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { parsePricesSheet } from "@/lib/prices/sheet-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily prices sync: reads the published prices Google Sheet (a pivoted matrix
 * of company × date) and upserts it into price_history. The sheet is the source
 * of truth, so it also backfills history.
 *
 * Triggered by Vercel Cron (vercel.json) with `Authorization: Bearer
 * ${CRON_SECRET}`. Can also be invoked manually with the same header.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = createAdminClient();

  // 1) Fetch the published CSV.
  let csv: string;
  try {
    const res = await fetch(serverEnv.PRICES_SHEET_CSV_URL, {
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} al leer la hoja de precios`);
    csv = await res.text();
    if (csv.trimStart().startsWith("<!DOCTYPE")) {
      throw new Error(
        "La hoja no devolvió CSV (¿dejó de estar compartida como pública?).",
      );
    }
  } catch (e) {
    return await fail(db, startedAt, 0, e);
  }

  // 2) Un-pivot into price_history rows.
  const { rows } = parsePricesSheet(csv);
  if (rows.length === 0) {
    return await fail(
      db,
      startedAt,
      0,
      new Error("0 precios parseados — la estructura de la hoja pudo cambiar."),
    );
  }

  // 3) Upsert (company, date) is a real unique index, so PostgREST upsert works
  //    directly — no RPC needed.
  const { error } = await db
    .from("price_history")
    .upsert(rows, { onConflict: "company,date" });
  if (error) return await fail(db, startedAt, rows.length, new Error(error.message));

  const durationMs = Date.now() - startedAt;
  await db.from("inventory_sync_runs").insert({
    source: "prices_sheet",
    status: "ok",
    rows_read: rows.length,
    duration_ms: durationMs,
  });

  return NextResponse.json({
    ok: true,
    prices_upserted: rows.length,
    duration_ms: durationMs,
  });
}

/** Log the failed run and return a 500. */
async function fail(
  db: ReturnType<typeof createAdminClient>,
  startedAt: number,
  rowsRead: number,
  e: unknown,
) {
  const message = e instanceof Error ? e.message : "Error desconocido.";
  await db.from("inventory_sync_runs").insert({
    source: "prices_sheet",
    status: "error",
    rows_read: rowsRead,
    duration_ms: Date.now() - startedAt,
    error: message,
  });
  console.error("[sync-prices]", message);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
