"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { inventoryQualitySchema } from "@/lib/schemas/inventory-quality";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

/** Crea una fila MANUAL (el sync diario no la toca). RLS valida el departamento. */
export async function createQualityRow(input: unknown): Promise<ActionResult> {
  const parsed = inventoryQualitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_quality")
    .insert({ ...parsed.data, source: "manual", synced_at: new Date().toISOString() })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario-calidad");
  return { ok: true, id: data.id };
}

/** Edita una fila manual. RLS impide tocar filas de la hoja (source='sheet'). */
export async function updateQualityRow(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = inventoryQualitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_quality")
    .update({ ...parsed.data, synced_at: new Date().toISOString() })
    .eq("id", id)
    .eq("source", "manual");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario-calidad");
  return { ok: true, id };
}

/** Borra una fila manual. */
export async function deleteQualityRow(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_quality")
    .delete()
    .eq("id", id)
    .eq("source", "manual");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario-calidad");
  return { ok: true, id };
}
