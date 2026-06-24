import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TablesInsert } from "@/lib/types/database";

export type NotifPayload = {
  tipo: string;
  titulo: string;
  cuerpo?: string;
  enlace?: string;
  entidad?: string;
  entidadId?: string;
};

/** Inserta la notificación in-app para cada destinatario y (opcional) email. */
export async function notificarUsuarios(usuarioIds: string[], p: NotifPayload): Promise<void> {
  const ids = Array.from(new Set(usuarioIds)).filter(Boolean);
  if (ids.length === 0) return;
  try {
    const admin = createAdminClient();
    const rows: TablesInsert<"notificaciones">[] = ids.map((uid) => ({
      usuario_id: uid,
      tipo: p.tipo,
      titulo: p.titulo,
      cuerpo: p.cuerpo ?? null,
      enlace: p.enlace ?? null,
      entidad: p.entidad ?? null,
      entidad_id: p.entidadId ?? null,
    }));
    await admin.from("notificaciones").insert(rows);
    await enviarEmails(admin, ids, p);
  } catch {
    // Las notificaciones nunca deben romper la acción principal.
  }
}

/** Notifica a Gerencia Administrativa (admins + dpto. Administrativo activos). */
export async function notificarGerenciaAdministrativa(
  p: NotifPayload,
  excludeUserId?: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("id")
      .eq("active", true)
      .or("role.eq.admin,department.eq.Administrativo");
    const ids = (data ?? []).map((r) => r.id).filter((id) => id !== excludeUserId);
    await notificarUsuarios(ids, p);
  } catch {
    // Silencioso a propósito.
  }
}

/**
 * Canal de email — DESACTIVADO por defecto (decisión del negocio: las
 * automatizaciones de comunicación se construyen pero se activan por env var).
 * Para habilitarlo: NOTIF_EMAIL_ENABLED=true, RESEND_API_KEY y NOTIF_EMAIL_FROM.
 */
async function enviarEmails(
  admin: ReturnType<typeof createAdminClient>,
  usuarioIds: string[],
  p: NotifPayload,
): Promise<void> {
  if (process.env.NOTIF_EMAIL_ENABLED !== "true") return;
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIF_EMAIL_FROM;
  if (!apiKey || !from) return;

  const { data } = await admin
    .from("profiles")
    .select("email")
    .in("id", usuarioIds)
    .eq("active", true);
  const to = (data ?? []).map((r) => r.email).filter(Boolean);
  if (to.length === 0) return;

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = p.enlace ? `${base}${p.enlace}` : base;
  const html =
    `<p>${p.titulo}</p>` +
    (p.cuerpo ? `<p>${p.cuerpo}</p>` : "") +
    (link ? `<p><a href="${link}">Abrir en AROCO</a></p>` : "");

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: p.titulo, html }),
  });
}
