"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { quoteSchema, buildQuoteRow, fijosDe, type Fijos } from "@/lib/schemas/quote";
import {
  cargarParametros,
  PARAMETROS_HOJA,
  type ClaveParametro,
} from "@/lib/cotizador-parametros";
import type { QuoteStatus } from "@/lib/types/database";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

/** Build the persisted DB row (inputs as ratios + computed snapshot). */
function buildRow(input: unknown, fijos: Fijos) {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." } as const;
  }
  try {
    return { row: buildQuoteRow(parsed.data, fijos) } as const;
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Datos inválidos." } as const;
  }
}

async function nextQuoteNumber(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<string> {
  const { count } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true });
  const year = new Date().getFullYear();
  return `COT-${year}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

export async function createQuote(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();
  // A new quote takes today's admin parameters.
  const built = buildRow(input, fijosDe(await cargarParametros(supabase)));
  if ("error" in built) return { ok: false, error: built.error };

  const quote_number = await nextQuoteNumber(supabase);
  const { data, error } = await supabase
    .from("quotes")
    .insert({ ...built.row, quote_number, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cotizaciones");
  return { ok: true, id: data.id };
}

export async function updateQuote(id: string, input: unknown): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  // An edit keeps the parameters the quote was created with.
  const { data: actual, error: errActual } = await supabase
    .from("quotes")
    .select("fnc_pct, merma_pct, factor_nacional, bonif_calidad_pct")
    .eq("id", id)
    .single();
  if (errActual) return { ok: false, error: errActual.message };
  const built = buildRow(input, actual);
  if ("error" in built) return { ok: false, error: built.error };
  const { error } = await supabase.from("quotes").update(built.row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cotizaciones");
  return { ok: true, id };
}

export async function deleteQuote(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("quotes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/cotizaciones");
  return { ok: true };
}

/**
 * Change a quote's status. Automation (SPEC §10): marking a quote "enviada"
 * moves its lead to "Enviado" and logs an activity.
 */
export async function setQuoteStatus(
  id: string,
  status: QuoteStatus,
): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: quote, error } = await supabase
    .from("quotes")
    .update({ status })
    .eq("id", id)
    .select("id, lead_id, quote_number")
    .single();
  if (error) return { ok: false, error: error.message };

  if (status === "enviada" && quote.lead_id) {
    await supabase.from("leads").update({ status: "Enviado" }).eq("id", quote.lead_id);
    await supabase.from("lead_activities").insert({
      lead_id: quote.lead_id,
      type: "Cambio de estado",
      description: `Cotización ${quote.quote_number ?? ""} enviada. Lead movido a "Enviado".`,
      user_name: session.profile?.full_name ?? null,
      created_by: session.userId,
    });
    revalidatePath("/comercial");
  }

  revalidatePath("/cotizaciones");
  return { ok: true, id };
}

/** Admin only (RLS enforces it too): update the cotizador parameters. */
export async function guardarParametros(
  valores: Partial<Record<ClaveParametro, number>>,
): Promise<ActionResult> {
  const session = await requireSession();
  if (session.profile?.role !== "admin") {
    return { ok: false, error: "Solo un admin puede cambiar los parámetros." };
  }
  const supabase = await createClient();
  for (const [clave, valor] of Object.entries(valores)) {
    if (!(clave in PARAMETROS_HOJA)) return { ok: false, error: `Parámetro desconocido: ${clave}` };
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
      return { ok: false, error: `Valor inválido para ${clave}.` };
    }
    if (clave === "factor_nacional" && valor === 0) {
      return { ok: false, error: "El factor nacional no puede ser 0." };
    }
    if (clave === "bonif_calidad_proveedor_pct" && valor > 1) {
      return { ok: false, error: "La parte del proveedor no puede pasar de 100 %." };
    }
    const { data, error } = await supabase
      .from("cotizador_parametros")
      .update({ valor, updated_at: new Date().toISOString(), updated_by: session.userId })
      .eq("clave", clave)
      .select("clave");
    if (error) return { ok: false, error: error.message };
    if (!data?.length) return { ok: false, error: `No se pudo guardar ${clave}.` };
  }
  revalidatePath("/cotizaciones");
  return { ok: true };
}
