"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { dispatchSchema } from "@/lib/schemas/inventory";

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

  // The dispatch→movement trigger discounts the linked lot automatically.
  const { data, error } = await supabase
    .from("dispatches")
    .insert({ ...parsed.data, created_by: session.userId })
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
