"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { lotSchema, movementSchema } from "@/lib/schemas/inventory";

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
