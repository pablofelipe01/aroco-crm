import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { parseInventorySheet } from "@/lib/inventory/sheet-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Daily inventory sync: reads the published Google Sheet CSV and upserts lots +
 * salidas (as dispatches) into Supabase. The sheet is the source of truth.
 *
 * Triggered by Vercel Cron (see vercel.json), which sends
 * `Authorization: Bearer ${CRON_SECRET}`. Can also be invoked manually with the
 * same header for an on-demand sync.
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
    const res = await fetch(serverEnv.INVENTORY_SHEET_CSV_URL, {
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} al leer la hoja`);
    }
    csv = await res.text();
    // A 200 that returns Google's HTML error page means the sheet isn't shared.
    if (csv.trimStart().startsWith("<!DOCTYPE")) {
      throw new Error(
        "La hoja no devolvió CSV (¿dejó de estar compartida como pública?).",
      );
    }
  } catch (e) {
    return await fail(db, startedAt, 0, e);
  }

  // 2) Parse to lot + dispatch rows.
  const { lots, dispatches, rowsRead } = parseInventorySheet(csv);
  if (rowsRead === 0) {
    return await fail(
      db,
      startedAt,
      0,
      new Error("0 filas con código — la estructura de la hoja pudo cambiar."),
    );
  }

  // 3) Bulk upsert via the SECURITY DEFINER RPC.
  const { data, error } = await db.rpc("import_inventory_sheet", {
    p_lots: lots,
    p_dispatches: dispatches,
  });
  if (error) {
    return await fail(db, startedAt, rowsRead, new Error(error.message));
  }

  const counts = (data ?? {}) as { lots?: number; dispatches?: number };
  const durationMs = Date.now() - startedAt;

  await db.from("inventory_sync_runs").insert({
    status: "ok",
    rows_read: rowsRead,
    lots_upserted: counts.lots ?? 0,
    dispatches_upserted: counts.dispatches ?? 0,
    duration_ms: durationMs,
  });

  return NextResponse.json({
    ok: true,
    rows_read: rowsRead,
    lots_upserted: counts.lots ?? 0,
    dispatches_upserted: counts.dispatches ?? 0,
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
    status: "error",
    rows_read: rowsRead,
    duration_ms: Date.now() - startedAt,
    error: message,
  });
  console.error("[sync-inventory]", message);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
