import { after, NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";
import { botActivo, type TgUpdate } from "@/lib/telegram/api";
import { manejarUpdate } from "@/lib/finca/telegram/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Bajar el audio + pasarlo a texto + Claude: 10–30 s. Corre en `after`.
export const maxDuration = 120;

function secretoValido(recibido: string | null): boolean {
  const esperado = serverEnv.TELEGRAM_WEBHOOK_SECRET;
  if (!esperado || !recibido) return false;
  const a = Buffer.from(recibido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Webhook del bot de Labores Finca (0122).
 *
 * Contesta 200 de una y procesa después (`after`): si Telegram no recibe
 * respuesta rápido, reintenta el mismo update. El `update_id` único en
 * `finca_telegram_mensajes` frena el doble proceso si igual reintenta.
 */
export async function POST(request: NextRequest) {
  if (!botActivo()) return NextResponse.json({ error: "Bot apagado" }, { status: 503 });
  if (!secretoValido(request.headers.get("x-telegram-bot-api-secret-token"))) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const update = (await request.json().catch(() => null)) as TgUpdate | null;
  if (!update || typeof update.update_id !== "number") {
    return NextResponse.json({ ok: true });
  }
  after(async () => {
    try {
      await manejarUpdate(update);
    } catch (e) {
      console.error("[finca-telegram] update", update.update_id, e);
    }
  });
  return NextResponse.json({ ok: true });
}
