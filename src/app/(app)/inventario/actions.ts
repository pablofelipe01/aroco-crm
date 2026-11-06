"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { esBodega } from "@/lib/inventory/bodegas";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

/**
 * Asigna (o quita, con null) la bodega de uno o varios lotes. El archivo no
 * trae la bodega: se elige aquí, y el sync no la toca. La política RLS de
 * escritura de inventory_lots decide quién puede.
 */
export async function asignarBodega(ids: string[], bodega: string | null): Promise<ActionResult> {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500)
    return { ok: false, error: "Elige al menos un lote." };
  if (!ids.every((id) => typeof id === "string" && /^[0-9a-f-]{36}$/.test(id)))
    return { ok: false, error: "Lote inválido." };
  if (bodega !== null && !esBodega(bodega)) return { ok: false, error: "Bodega inválida." };
  const session = await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_lots")
    .update({
      bodega,
      bodega_por: bodega ? session.userId : null,
      bodega_en: bodega ? new Date().toISOString() : null,
    })
    .in("id", ids)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // Sin permiso, RLS no lanza: simplemente no actualiza nada.
  if ((data ?? []).length === 0)
    return { ok: false, error: "No tienes permiso para cambiar la bodega." };
  revalidatePath("/inventario");
  revalidatePath("/despachos");
  return { ok: true };
}
