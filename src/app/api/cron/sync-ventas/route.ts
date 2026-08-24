import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { parseVentasSheet } from "@/lib/ventas/sheet";
import { avisarFalloSync } from "@/lib/sync-alerta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincroniza la pestaña `Dashboard_Data` de la hoja de ventas.
 *
 * La hoja es la fuente de verdad: la corrida reemplaza el contenido completo
 * dentro de una transacción (RPC `import_ventas_sheet`), así que una corrida a
 * medias no deja el módulo mostrando la mitad de las ventas del año.
 *
 * Lo dispara Vercel Cron con `Authorization: Bearer ${CRON_SECRET}`.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = createAdminClient();

  let csv: string;
  try {
    const res = await fetch(serverEnv.VENTAS_SHEET_CSV_URL, {
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} al leer la hoja de ventas`);
    csv = await res.text();
    if (csv.trimStart().startsWith("<!DOCTYPE")) {
      throw new Error(
        "La hoja no devolvió CSV (¿dejó de estar compartida como pública?).",
      );
    }
  } catch (e) {
    return await fail(db, startedAt, 0, e);
  }

  let filas, descartadas;
  try {
    ({ filas, descartadas } = parseVentasSheet(csv));
  } catch (e) {
    return await fail(db, startedAt, 0, e);
  }

  if (filas.length === 0) {
    return await fail(
      db,
      startedAt,
      0,
      new Error("0 ventas parseadas — la estructura de la hoja pudo cambiar."),
    );
  }

  const { data: insertadas, error } = await db.rpc("import_ventas_sheet", {
    filas,
  });
  if (error) return await fail(db, startedAt, filas.length, new Error(error.message));

  const durationMs = Date.now() - startedAt;
  await db.from("inventory_sync_runs").insert({
    source: "ventas_sheet",
    status: "ok",
    rows_read: filas.length,
    duration_ms: durationMs,
    // Las descartadas quedan en el registro: si mañana faltan ventas, el motivo
    // está escrito y no hay que reconstruirlo.
    error: descartadas.length
      ? `Descartadas ${descartadas.length}: ${descartadas
          .map((d) => `fila ${d.fila} (${d.motivo})`)
          .join("; ")}`
      : null,
  });

  return NextResponse.json({
    ok: true,
    ventas: insertadas,
    descartadas,
    duration_ms: durationMs,
  });
}

async function fail(
  db: ReturnType<typeof createAdminClient>,
  startedAt: number,
  rowsRead: number,
  e: unknown,
) {
  const message = e instanceof Error ? e.message : "Error desconocido.";
  await db.from("inventory_sync_runs").insert({
    source: "ventas_sheet",
    status: "error",
    rows_read: rowsRead,
    duration_ms: Date.now() - startedAt,
    error: message,
  });
  await avisarFalloSync(db, "ventas_sheet", "las ventas", message);
  console.error("[sync-ventas]", message);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
