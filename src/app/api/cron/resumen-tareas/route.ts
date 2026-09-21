import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { enviarResumenes } from "@/lib/correo/enviar-resumenes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Resúmenes de tareas por correo (0096).
 *
 *   ?tipo=diario   a cada persona, L–V a las 7 a. m. de Colombia
 *   ?tipo=semanal  a cada jefe de área, los lunes a las 7 a. m.
 *
 * Apagado mientras ENABLE_EMAIL_NOTIFICATIONS no sea "true". Correrlo dos
 * veces el mismo día no manda nada de más.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const tipo = request.nextUrl.searchParams.get("tipo");
  if (tipo !== "diario" && tipo !== "semanal") {
    return NextResponse.json({ error: "tipo debe ser diario o semanal." }, { status: 400 });
  }
  try {
    const r = await enviarResumenes(tipo);
    return NextResponse.json({ ok: r.errores.length === 0, ...r });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
