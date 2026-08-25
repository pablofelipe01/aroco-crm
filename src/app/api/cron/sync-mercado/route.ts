import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { MCPS } from "@/lib/mcp/config";
import { traerExtracto, diasHabiles } from "@/lib/mercado/stonex";
import { guardarExtracto, type ResultadoGuardado } from "@/lib/mercado/guardar";
import { avisarFalloSync } from "@/lib/sync-alerta";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sincroniza los estados de cuenta de StoneX.
 *
 * Recorre los últimos días hábiles en vez de pedir solo el de hoy: el estado
 * del día se publica con retraso, y si el cron corre antes no habría nada. Al
 * mirar hacia atrás también se recupera solo de un día en que el sync estuvo
 * caído, sin que nadie tenga que darse cuenta.
 *
 * Un día sin estado no es un error — es un festivo o un día que aún no cierra.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const startedAt = Date.now();
  const db = createAdminClient();
  const dias = Number(request.nextUrl.searchParams.get("dias") ?? 5);

  if (!MCPS.stonex.url) {
    return await fail(db, startedAt, new Error("STONEX_MCP_URL no está configurado."));
  }

  const guardados: ResultadoGuardado[] = [];
  const sinEstado: string[] = [];
  const fallos: { fecha: string; error: string }[] = [];

  for (const fecha of diasHabiles(new Date(), dias)) {
    try {
      const extracto = await traerExtracto(MCPS.stonex, fecha);
      if (!extracto) {
        sinEstado.push(fecha);
        continue;
      }
      guardados.push(await guardarExtracto(db, extracto));
    } catch (e) {
      // Un día que falla no detiene los demás: es mejor tener cuatro de cinco
      // que ninguno, siempre que se diga cuál faltó.
      fallos.push({ fecha, error: e instanceof Error ? e.message.slice(0, 200) : "desconocido" });
    }
  }

  const durationMs = Date.now() - startedAt;

  // Que TODOS los días fallen es distinto de que ninguno tenga estado: lo
  // primero es una avería, lo segundo es un puente festivo.
  if (guardados.length === 0 && fallos.length > 0) {
    return await fail(
      db,
      startedAt,
      new Error(`Ningún día se pudo sincronizar. Último error: ${fallos[0].error}`),
    );
  }

  await db.from("inventory_sync_runs").insert({
    source: "stonex_mcp",
    status: "ok",
    rows_read: guardados.length,
    duration_ms: durationMs,
    error: fallos.length
      ? `Fallaron ${fallos.length} días: ${fallos.map((f) => `${f.fecha} (${f.error})`).join("; ")}`
      : null,
  });

  return NextResponse.json({
    ok: true,
    estados: guardados,
    sin_estado: sinEstado,
    fallos,
    duration_ms: durationMs,
  });
}

async function fail(
  db: ReturnType<typeof createAdminClient>,
  startedAt: number,
  e: unknown,
) {
  const message = e instanceof Error ? e.message : "Error desconocido.";
  await db.from("inventory_sync_runs").insert({
    source: "stonex_mcp",
    status: "error",
    rows_read: 0,
    duration_ms: Date.now() - startedAt,
    error: message,
  });
  await avisarFalloSync(db, "stonex_mcp", "la cuenta de StoneX", message);
  console.error("[sync-mercado]", message);
  return NextResponse.json({ ok: false, error: message }, { status: 500 });
}
