import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { botActivo } from "@/lib/telegram/api";
import { avisoTarde, recordatorioManana } from "@/lib/finca/telegram/avisos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Bot de Labores Finca (0122), lunes a sábado, hora de Colombia:
 *   ?tipo=recordatorio  6:00 a. m. — a cada trabajador, qué contar en el audio
 *   ?tipo=aviso         5:00 p. m. — a Angela, quién no ha mandado; a esos, otro recordatorio
 * Apagado mientras no haya TELEGRAM_BOT_TOKEN.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!botActivo()) return NextResponse.json({ ok: true, apagado: true });
  const tipo = request.nextUrl.searchParams.get("tipo");
  if (tipo === "recordatorio") return NextResponse.json({ ok: true, ...(await recordatorioManana()) });
  if (tipo === "aviso") return NextResponse.json({ ok: true, ...(await avisoTarde()) });
  return NextResponse.json({ error: "tipo debe ser recordatorio o aviso" }, { status: 400 });
}
