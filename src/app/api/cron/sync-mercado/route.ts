import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { MCPS } from "@/lib/mcp/config";
import { traerExtracto, diasHabiles } from "@/lib/mercado/stonex";
import { guardarExtracto, guardarTablero, type ResultadoGuardado } from "@/lib/mercado/guardar";
import { listarVencimientos, traerTablero } from "@/lib/mercado/barchart";
import { traerTrm } from "@/lib/mercado/trm";
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

  // ── Barchart: tablero de opciones ─────────────────────────────────────────
  // Se limitan los vencimientos más cercanos: cada uno es una navegación con
  // Playwright del lado del MCP y traerlos todos no cabe en el tope de la
  // función. Los lejanos casi no cotizan, así que se pierde poco.
  const tableros: { contract_month: string; strikes: number }[] = [];
  const hoy = new Date().toISOString().slice(0, 10);
  if (MCPS.barchart.url) {
    try {
      const vencs = await listarVencimientos(MCPS.barchart);
      for (const v of vencs.slice(0, 3)) {
        const t = await traerTablero(MCPS.barchart, v);
        if (t) tableros.push(await guardarTablero(db, t, hoy));
      }
    } catch (e) {
      // Que Barchart falle no invalida lo de StoneX: son fuentes distintas y
      // media sincronización sigue siendo mejor que ninguna.
      fallos.push({
        fecha: hoy,
        error: `Barchart: ${e instanceof Error ? e.message.slice(0, 160) : "desconocido"}`,
      });
    }
  }

  // ── TRM ───────────────────────────────────────────────────────────────────
  // Fuente pública, sin MCP de por medio: si el túnel está caído esto igual
  // entra, y sin TRM no se puede comparar un costo en pesos contra un precio
  // en dólares.
  let trm = 0;
  try {
    const filas = await traerTrm(60);
    const { error } = await db.from("trm_data").upsert(filas, { onConflict: "date" });
    if (error) throw new Error(error.message);
    trm = filas.length;
  } catch (e) {
    fallos.push({
      fecha: hoy,
      error: `TRM: ${e instanceof Error ? e.message.slice(0, 160) : "desconocido"}`,
    });
  }

  const durationMs = Date.now() - startedAt;

  // Que TODOS los días fallen es distinto de que ninguno tenga estado: lo
  // primero es una avería, lo segundo es un puente festivo.
  if (guardados.length === 0 && tableros.length === 0 && trm === 0 && fallos.length > 0) {
    return await fail(
      db,
      startedAt,
      new Error(`Ningún día se pudo sincronizar. Último error: ${fallos[0].error}`),
    );
  }

  await db.from("inventory_sync_runs").insert({
    source: "stonex_mcp",
    status: "ok",
    rows_read: guardados.length + tableros.length + trm,
    duration_ms: durationMs,
    error: fallos.length
      ? `Fallaron ${fallos.length} días: ${fallos.map((f) => `${f.fecha} (${f.error})`).join("; ")}`
      : null,
  });

  return NextResponse.json({
    ok: true,
    estados: guardados,
    tableros,
    trm,
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
