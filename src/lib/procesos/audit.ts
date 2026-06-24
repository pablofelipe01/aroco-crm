import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import type { Json } from "@/lib/types/database";

/**
 * Registra una acción en el log de auditoría. Nunca lanza: si el registro falla
 * no debe romper la operación principal que se está auditando.
 */
export async function logAudit(
  entidad: string,
  entidadId: string | null,
  accion: string,
  descripcion: string,
  meta?: Json,
): Promise<void> {
  try {
    const session = await getSessionContext();
    const supabase = await createClient();
    await supabase.from("audit_log").insert({
      entidad,
      entidad_id: entidadId,
      accion,
      descripcion,
      meta: meta ?? null,
      usuario_id: session?.userId ?? null,
      usuario_nombre: session?.profile?.full_name ?? null,
    });
  } catch {
    // Silencioso a propósito.
  }
}
