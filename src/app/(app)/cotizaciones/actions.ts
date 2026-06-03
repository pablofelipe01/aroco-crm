"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { quoteSchema, toCotizadorInput } from "@/lib/schemas/quote";
import { cotizar } from "@/lib/calc/cotizador";
import type { QuoteStatus } from "@/lib/types/database";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

/** Build the persisted DB row (inputs as ratios + computed snapshot). */
function buildRow(input: unknown) {
  const parsed = quoteSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." } as const;
  }
  const q = parsed.data;
  const calc = cotizar(toCotizadorInput(q));
  return {
    row: {
      incoterm: q.incoterm,
      lead_id: q.lead_id ?? null,
      client_name: q.client_name ?? null,
      market: q.market ?? null,
      port_origin: q.port_origin ?? null,
      port_destination: q.port_destination ?? null,
      validity_days: q.validity_days,
      trm: q.trm,
      cocoa_usd_t: q.cocoa_usd_t,
      differential: q.differential_pct / 100,
      purchase_price_cop_kg: q.purchase_price_cop_kg,
      volume_tm: q.volume_tm,
      transporte_bodega: q.transporte_bodega,
      seleccion: q.seleccion,
      fumigacion: q.fumigacion,
      estibas: q.estibas,
      costales: q.costales,
      coberturas: q.coberturas,
      costos_exportacion: q.costos_exportacion,
      bonif_calidad: q.bonif_calidad,
      bonif_cadmio: q.bonif_cadmio,
      bonif_trazabilidad: q.bonif_trazabilidad,
      bonif_transporte: q.bonif_transporte,
      commission_pct: q.commission_pct / 100,
      target_utility_pct: q.target_utility_pct / 100,
      costo_total_usd_tm: calc.costoTotalUsdTm,
      utilidad_pct: calc.utilidadPct,
      precio_final_usd_tm: calc.precioFinalUsdTm,
      precio_final_cop_tm: calc.precioFinalCopTm,
      total_operacion_usd: calc.totalOperacionUsd,
      total_operacion_cop: calc.totalOperacionCop,
    },
  } as const;
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
  const built = buildRow(input);
  if ("error" in built) return { ok: false, error: built.error };
  const session = await requireSession();
  const supabase = await createClient();

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
  const built = buildRow(input);
  if ("error" in built) return { ok: false, error: built.error };
  await requireSession();
  const supabase = await createClient();
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
