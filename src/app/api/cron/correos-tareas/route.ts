import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env";
import { enviarTareasAsignadas } from "@/lib/correo/tareas-asignadas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Red de seguridad de los correos de tareas asignadas (0095).
 *
 * Normalmente el correo sale al terminar la acción que asigna. Si ese envío
 * no llegó a correr —la función se cortó, Resend no contestó—, la fila sigue
 * pendiente en la cola y este cron la manda. Cada hora, de 8 a. m. a 6 p. m.
 * en Colombia, L–V. Apagado mientras ENABLE_EMAIL_NOTIFICATIONS no sea "true".
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${serverEnv.CRON_SECRET}`) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }
  const r = await enviarTareasAsignadas();
  return NextResponse.json({ ok: r.errores.length === 0, ...r });
}
