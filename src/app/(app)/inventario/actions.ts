"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { lotSchema, movementSchema } from "@/lib/schemas/inventory";
import { esBodega } from "@/lib/inventory/bodegas";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

export async function createLot(input: unknown): Promise<ActionResult> {
  const parsed = lotSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_lots")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario");
  return { ok: true, id: data.id };
}

export async function updateLot(id: string, input: unknown): Promise<ActionResult> {
  const parsed = lotSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_lots")
    .update(parsed.data)
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario");
  return { ok: true, id };
}

export async function deleteLot(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("inventory_lots").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario");
  return { ok: true };
}

export async function addMovement(input: unknown): Promise<ActionResult> {
  const parsed = movementSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("inventory_movements")
    .insert({ ...parsed.data, created_by: session.userId });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario");
  return { ok: true };
}

export async function deleteMovement(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("inventory_movements").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/inventario");
  return { ok: true };
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
