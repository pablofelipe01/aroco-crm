import "server-only";

/**
 * Envío por Resend.
 *
 * DESACTIVADO por defecto (decisión del negocio: las automatizaciones de
 * comunicación se construyen, pero se encienden por env var). Para
 * encenderlo: ENABLE_EMAIL_NOTIFICATIONS=true, RESEND_API_KEY y EMAIL_FROM,
 * en Vercel y no solo en .env.local.
 */
export function correosActivos(): boolean {
  return (
    process.env.ENABLE_EMAIL_NOTIFICATIONS === "true" &&
    !!process.env.RESEND_API_KEY &&
    !!process.env.EMAIL_FROM
  );
}

export async function enviarCorreo(m: {
  para: string;
  asunto: string;
  html: string;
  texto: string;
}): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  if (!correosActivos()) return { ok: false, error: "Correos desactivados." };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [m.para],
        subject: m.asunto,
        html: m.html,
        text: m.texto,
      }),
    });
    const cuerpo = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    // Resend contesta 200 con el id, o 4xx con un mensaje. Un 403 por dominio
    // sin verificar se ve aquí y no en otro lado, así que se guarda tal cual.
    if (!res.ok) return { ok: false, error: `${res.status}: ${cuerpo.message ?? "sin detalle"}` };
    return { ok: true, id: cuerpo.id ?? null };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
