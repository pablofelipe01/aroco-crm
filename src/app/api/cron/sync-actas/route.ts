import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { ingestActasFromGmail } from "@/lib/actas/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sincroniza actas desde el correo de Renata: busca las "Notas de reunión"
 * auto-enviadas, extrae las tareas con la IA y las distribuye en el módulo de
 * Tareas. Idempotente (dedup por message-id).
 *
 * Lo dispara Vercel Cron (vercel.json) cada 2h entre 8am–6pm (Colombia, L–V)
 * con `Authorization: Bearer ${CRON_SECRET}`. También se puede invocar a mano
 * con el mismo header para probar.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const startedAt = Date.now();
  const result = await ingestActasFromGmail();
  return NextResponse.json({
    ok: result.errors.length === 0,
    ...result,
    ms: Date.now() - startedAt,
  });
}
