"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { CLASIFICACION_COLUMNA, dispatchSchema } from "@/lib/schemas/inventory";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

export async function createDispatch(input: unknown): Promise<ActionResult> {
  const parsed = dispatchSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const session = await requireSession();
  const supabase = await createClient();

  // El grado se guarda en su propia columna de kilos, igual que hace el sync
  // de la hoja: así un despacho hecho a mano aparece en el desglose por
  // clasificación en vez de quedar como «sin clasificar».
  const { clasificacion, ...campos } = parsed.data;
  const grado = clasificacion
    ? { [CLASIFICACION_COLUMNA[clasificacion]]: campos.qty_kg }
    : {};

  // The dispatch→movement trigger discounts the linked lot automatically.
  const { data, error } = await supabase
    .from("dispatches")
    .insert({ ...campos, ...grado, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/despachos");
  revalidatePath("/inventario");
  return { ok: true, id: data.id };
}

export async function deleteDispatch(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("dispatches").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/despachos");
  return { ok: true };
}
