import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { sincronizarComisiones } from "@/lib/comisiones/sync";
import { avisarFalloSync } from "@/lib/sync-alerta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Sincroniza la pestaña de liquidación de comisiones.
 *
 * La hoja liquida UN MES A LA VEZ y Nicolás cierra cada uno cambiando el
 * parámetro «Mes a liquidar». Esta corrida guarda el mes que esté puesto y no
 * toca los anteriores — el histórico se va acumulando corrida a corrida.
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
    const res = await fetch(serverEnv.COMISIONES_SHEET_CSV_URL, {
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} al leer la hoja de comisiones`);
    csv = await res.text();
    if (csv.trimStart().startsWith("<!DOCTYPE")) {
      throw new Error(
        "La hoja no devolvió CSV (¿dejó de estar compartida como pública?).",
      );
    }
  } catch (e) {
    return await fail(db, startedAt, e);
  }

  try {
    const r = await sincronizarComisiones(db, csv);

    // Lo que hay que mirar queda escrito en el registro: un comercial sin
    // asignar no cobra en el CRM aunque la hoja lo liquide, y un descuadre
    // entre el total de la hoja y la suma de sus líneas significa que las dos
    // cifras de la hoja no cuadran entre sí.
    const notas = [
      r.sinAsignar.length
        ? `Sin asignar a nadie: ${r.sinAsignar.join(", ")} — su liquidación no la ve ningún comercial.`
        : null,
      r.descuadre !== null
        ? `El total de la hoja y la suma de sus líneas difieren en ${r.descuadre}.`
        : null,
    ].filter(Boolean);

    await db.from("inventory_sync_runs").insert({
      source: "comisiones_sheet",
      status: "ok",
      rows_read: r.lineas + r.operaciones,
      duration_ms: Date.now() - startedAt,
      error: notas.length ? notas.join(" · ") : null,
    });

    return NextResponse.json({ ok: true, ...r, duration_ms: Date.now() - startedAt });
  } catch (e) {
    return await fail(db, startedAt, e);
  }
}

async function fail(
  db: ReturnType<typeof createAdminClient>,
  startedAt: number,
  e: unknown,
) {
  const message = e instanceof Error ? e.message : "Error desconocido.";
  await db.from("inventory_sync_runs").insert({
    source: "comisiones_sheet",
    status: "error",
    rows_read: 0,
    duration_ms: Date.now() - startedAt,
    error: message,
  });
  await avisarFalloSync(db, "comisiones_sheet", "la liquidación de comisiones", message);
  console.error("[sync-comisiones]", message);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
