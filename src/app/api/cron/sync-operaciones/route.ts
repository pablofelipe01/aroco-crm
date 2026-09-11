import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { sincronizarOperaciones } from "@/lib/ventas/operaciones-sync";
import { avisarFalloSync } from "@/lib/sync-alerta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincroniza «VENTAS 2026»: el margen de cada operación.
 *
 * Es lo que le permite al CRM saber cuánto costó de verdad cada despacho —el
 * precio base negociado con el proveedor no es el costo— y, con eso, calcular
 * la utilidad sin depender de la hoja.
 *
 * Corre DESPUÉS del sync de ventas y ANTES del de comisiones: la liquidación
 * se apoya en estas cifras.
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
    const res = await fetch(serverEnv.VENTAS_2026_SHEET_CSV_URL, {
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} al leer «VENTAS 2026»`);
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
    const r = await sincronizarOperaciones(db, csv);

    // Un descuadre en la cadena del proveedor no es ruido: significa que la
    // suma de la hoja no da, o que se está leyendo una columna equivocada. En
    // cualquiera de los dos casos hay una utilidad que no es de fiar.
    const notas = [
      r.descuadres.length
        ? `Cadena del proveedor descuadrada en ${r.descuadres.length}: ${r.descuadres
            .map((d) => `fila ${d.fila} (${d.odc}, ${Math.round(d.encontrado - d.esperado)})`)
            .join("; ")}`
        : null,
      r.descartadas.length
        ? `Descartadas ${r.descartadas.length}: ${r.descartadas
            .map((d) => `fila ${d.fila} (${d.motivo})`)
            .join("; ")}`
        : null,
    ].filter(Boolean);

    await db.from("inventory_sync_runs").insert({
      source: "ventas_2026_sheet",
      status: "ok",
      rows_read: r.operaciones,
      duration_ms: Date.now() - startedAt,
      error: notas.length ? notas.join(" · ") : null,
    });

    return NextResponse.json({ ok: true, ...r, duration_ms: Date.now() - startedAt });
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
    source: "ventas_2026_sheet",
    status: "error",
    rows_read: rowsRead,
    duration_ms: Date.now() - startedAt,
    error: message,
  });
  await avisarFalloSync(db, "ventas_2026_sheet", "el margen por operación", message);
  console.error("[sync-operaciones]", message);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
