"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { leadSchema, activitySchema } from "@/lib/schemas/lead";
import { getReferencePrices } from "@/lib/lead-prices";
import { leadValueForMarket, type Market } from "@/lib/calc/lead-value";
import type { LeadStage } from "@/lib/status";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

/**
 * Si el lead trae toneladas y hay precio de referencia para su mercado, calcula
 * el valor total (toneladas × 1000 × precio) y lo fija en potential_value_cop.
 * Si no, respeta el valor recibido (override manual).
 */
async function withComputedValue<
  T extends { toneladas?: number | null; market?: Market | null; potential_value_cop?: number | null },
>(data: T): Promise<T> {
  if (data.toneladas == null) return data;
  const prices = await getReferencePrices();
  const valor = leadValueForMarket(data.toneladas, data.market ?? null, prices);
  return valor != null ? { ...data, potential_value_cop: valor } : data;
}

export async function createLead(input: unknown): Promise<ActionResult> {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const session = await requireSession();
  const supabase = await createClient();

  const values = await withComputedValue(parsed.data);
  const { data, error } = await supabase
    .from("leads")
    .insert({ ...values, created_by: session.userId, source: "app" })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };

  // Seed the timeline with a creation note.
  await supabase.from("lead_activities").insert({
    lead_id: data.id,
    type: "Nota",
    description: "Lead creado.",
    user_name: session.profile?.full_name ?? null,
    created_by: session.userId,
  });

  revalidatePath("/comercial");
  return { ok: true, id: data.id };
}

export async function updateLead(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const parsed = leadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  await requireSession();
  const supabase = await createClient();

  const values = await withComputedValue(parsed.data);
  const { error } = await supabase
    .from("leads")
    .update(values)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  revalidatePath("/comercial");
  return { ok: true, id };
}

const statusSchema = z.object({
  id: z.string().uuid(),
  status: z.string(),
});

/** Used by the Kanban drag-and-drop; also logs a "Cambio de estado" activity. */
export async function updateLeadStatus(
  id: string,
  status: LeadStage,
): Promise<ActionResult> {
  const parsed = statusSchema.safeParse({ id, status });
  if (!parsed.success) return { ok: false, error: "Estado inválido." };
  const session = await requireSession();
  const supabase = await createClient();

  const { error } = await supabase
    .from("leads")
    .update({ status })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await supabase.from("lead_activities").insert({
    lead_id: id,
    type: "Cambio de estado",
    description: `Estado cambiado a "${status}".`,
    user_name: session.profile?.full_name ?? null,
    created_by: session.userId,
  });

  revalidatePath("/comercial");
  return { ok: true, id };
}

export async function deleteLead(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("leads").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/comercial");
  return { ok: true };
}

export async function addActivity(input: unknown): Promise<ActionResult> {
  const parsed = activitySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const session = await requireSession();
  const supabase = await createClient();

  const { error } = await supabase.from("lead_activities").insert({
    ...parsed.data,
    user_name: session.profile?.full_name ?? null,
    created_by: session.userId,
  });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/comercial");
  return { ok: true };
}
