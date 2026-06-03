"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { priceSchema } from "@/lib/schemas/inventory";

export type ActionResult = { ok: boolean; error?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

export async function addPrices(input: unknown): Promise<ActionResult> {
  const parsed = priceSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  await requireSession();
  const supabase = await createClient();

  const rows = parsed.data.entries
    .filter((e) => Number.isFinite(e.price_cop_kg) && e.price_cop_kg > 0)
    .map((e) => ({
      company: e.company,
      date: parsed.data.date,
      price_cop_kg: e.price_cop_kg,
    }));
  if (rows.length === 0) return { ok: false, error: "Ingresa al menos un precio." };

  const { error } = await supabase
    .from("price_history")
    .upsert(rows, { onConflict: "company,date" });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/precios");
  return { ok: true };
}

export async function deletePriceDate(
  company: string,
  date: string,
): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("price_history")
    .delete()
    .eq("company", company)
    .eq("date", date);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/precios");
  return { ok: true };
}
