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
import { precioEnVivo } from "@/lib/mercado/precio";
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

/** Desvío que se tolera entre el cacao que vio el formulario y el de referencia. */
const TOLERANCIA_CACAO = 0.05;

/**
 * Indicadores base (TRM, cacao referencial, diferencial): solo un admin los
 * edita (reunión 2026-10-16). Los demás cotizan sobre el mercado del día.
 *
 * El formulario ya los bloquea; esto es lo que de verdad lo impide. Al editar
 * se conservan los que ya tenía la cotización. Al crear, la TRM y el
 * diferencial se imponen desde aquí; el cacao se acepta si está cerca de la
 * referencia porque el precio en vivo se mueve entre que se abre el
 * formulario y se guarda. Sin referencia (sync caído) se deja pasar lo que
 * venga: bloquear ahí dejaría al comercial sin poder cotizar.
 */
async function fijarIndicadores(
  input: unknown,
  supabase: Awaited<ReturnType<typeof createClient>>,
  actual: { trm: number; cocoa_usd_t: number | null; differential: number } | null,
): Promise<{ input: unknown } | { error: string }> {
  if (typeof input !== "object" || input === null) return { input };
  const datos = input as Record<string, unknown>;

  if (actual) {
    return {
      input: {
        ...datos,
        trm: actual.trm,
        cocoa_usd_t: actual.cocoa_usd_t,
        differential_pct: Number(actual.differential) * 100,
      },
    };
  }

  const [{ data: refs }, vivo] = await Promise.all([
    supabase.rpc("cotizador_referencias"),
    precioEnVivo(2500).catch(() => null),
  ]);
  const ref = refs?.[0];
  const fijo: Record<string, unknown> = { ...datos, differential_pct: 0 };
  if (ref?.trm != null) fijo.trm = Number(ref.trm);

  const candidatos = [vivo?.usdT, ref?.cocoa_usd_t]
    .filter((v): v is number => v != null)
    .map(Number);
  const cacao = Number(datos.cocoa_usd_t);
  if (
    candidatos.length > 0 &&
    datos.cocoa_usd_t !== "" &&
    datos.cocoa_usd_t != null &&
    !candidatos.some((c) => Math.abs(cacao - c) <= c * TOLERANCIA_CACAO)
  ) {
    return { error: "El cacao referencial no coincide con el de mercado. Recarga la página." };
  }
  return { input: fijo };
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
  if (session.profile?.role !== "admin") {
    const fijado = await fijarIndicadores(input, supabase, null);
    if ("error" in fijado) return { ok: false, error: fijado.error };
    input = fijado.input;
  }
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
  const session = await requireSession();
  const supabase = await createClient();
  // An edit keeps the parameters the quote was created with.
  const { data: actual, error: errActual } = await supabase
    .from("quotes")
    .select("fnc_pct, merma_pct, factor_nacional, bonif_calidad_pct, trm, cocoa_usd_t, differential")
    .eq("id", id)
    .single();
  if (errActual) return { ok: false, error: errActual.message };
  if (session.profile?.role !== "admin") {
    const fijado = await fijarIndicadores(input, supabase, actual);
    if ("error" in fijado) return { ok: false, error: fijado.error };
    input = fijado.input;
  }
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
