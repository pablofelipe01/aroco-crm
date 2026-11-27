import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { botActivo, configurarComandos, configurarWebhook, infoWebhook } from "@/lib/telegram/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Apunta el bot a este despliegue y le pone los comandos. Se llama una vez
 * (y cada vez que cambie el dominio), con el CRON_SECRET:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://aroco-crm.vercel.app/api/telegram/configurar
 *
 * `?ver=1` solo muestra cómo está el webhook, sin cambiarlo.
 */
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  if (!botActivo()) return NextResponse.json({ error: "Falta TELEGRAM_BOT_TOKEN" }, { status: 503 });
  if (request.nextUrl.searchParams.get("ver")) return NextResponse.json(await infoWebhook());
  if (!serverEnv.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Falta TELEGRAM_WEBHOOK_SECRET" }, { status: 503 });
  }
  const url = `${request.nextUrl.origin}/api/telegram/webhook`;
  await configurarWebhook(url, serverEnv.TELEGRAM_WEBHOOK_SECRET);
  await configurarComandos();
  return NextResponse.json({ ok: true, url, webhook: await infoWebhook() });
}
