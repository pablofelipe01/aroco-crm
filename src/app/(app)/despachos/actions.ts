"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

export async function deleteDispatch(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  // Las salidas que vinieron del archivo son historia: borrarlas devolvería
  // kilos al lote que ya salieron de verdad.
  const { data, error } = await supabase
    .from("dispatches")
    .delete()
    .eq("id", id)
    // source es nulo en los despachos hechos a mano antes de 0113.
    .or("source.is.null,source.not.in.(sheet,hoja)")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if ((data ?? []).length === 0)
    return { ok: false, error: "Las salidas que vienen del archivo no se borran aquí." };
  revalidatePath("/inventario");
  revalidatePath("/despachos");
  return { ok: true };
}
