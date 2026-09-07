import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { sincronizarHojaRuta } from "@/lib/trazabilidad/sync";
import { avisarFalloSync } from "@/lib/sync-alerta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincroniza la hoja de ruta: quién entregó cada kilo y desde qué vereda.
 *
 * Es la fuente de la trazabilidad hacia atrás. El inventario sabe que un lote
 * se llama «CISCA ruta #3» y cuántos kilos tiene; esta hoja sabe de qué manos
 * y de qué veredas salieron.
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
    const res = await fetch(serverEnv.RUTAS_SHEET_CSV_URL, {
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} al leer la hoja de ruta`);
    csv = await res.text();
    if (csv.trimStart().startsWith("<!DOCTYPE")) {
      throw new Error(
        "La hoja no devolvió CSV (¿dejó de estar compartida como pública?).",
      );
    }
  } catch (e) {
    return await fail(db, startedAt, 0, e);
  }

  try {
    const r = await sincronizarHojaRuta(db, csv);
    const durationMs = Date.now() - startedAt;

    // Lo descartado y lo nuevo quedan en el registro. Si mañana falta un
    // productor en el mapa, el motivo está escrito y no hay que reconstruirlo;
    // y una vereda o una ruta que aparecen por primera vez son justo lo que
    // alguien tiene que ir a ubicar.
    const notas = [
      r.descartadas.length
        ? `Descartadas ${r.descartadas.length}: ${r.descartadas
            .map((d) => `fila ${d.fila} (${d.motivo})`)
            .join("; ")}`
        : null,
      r.veredasNuevas.length
        ? `Veredas nuevas sin ubicar: ${r.veredasNuevas.join(", ")}`
        : null,
      r.rutasNuevas.length ? `Rutas nuevas: ${r.rutasNuevas.join(", ")}` : null,
    ].filter(Boolean);

    await db.from("inventory_sync_runs").insert({
      source: "rutas_sheet",
      status: "ok",
      rows_read: r.filas,
      duration_ms: durationMs,
      error: notas.length ? notas.join(" · ") : null,
    });

    return NextResponse.json({
      ok: true,
      acopios: r.acopios,
      entregas: r.entregas,
      veredasNuevas: r.veredasNuevas,
      rutasNuevas: r.rutasNuevas,
      descartadas: r.descartadas,
      duration_ms: durationMs,
    });
  } catch (e) {
    return await fail(db, startedAt, 0, e);
  }
}

async function fail(
  db: ReturnType<typeof createAdminClient>,
  startedAt: number,
  rowsRead: number,
  e: unknown,
) {
  const message = e instanceof Error ? e.message : "Error desconocido.";
  await db.from("inventory_sync_runs").insert({
    source: "rutas_sheet",
    status: "error",
    rows_read: rowsRead,
    duration_ms: Date.now() - startedAt,
    error: message,
  });
  await avisarFalloSync(db, "rutas_sheet", "la hoja de ruta", message);
  console.error("[sync-rutas]", message);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
