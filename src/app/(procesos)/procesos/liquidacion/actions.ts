"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { logAudit } from "@/lib/procesos/audit";
import { notificarDepartamentos } from "@/lib/procesos/notificaciones";
import {
  calcularLiquidacion,
  PARAMS_DEFAULT,
  type LiquidacionParams,
} from "@/lib/calc/liquidacion";
import type { Json, TablesUpdate } from "@/lib/types/database";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

/** Normaliza un umbral del contrato a porcentaje (0.07 → 7). */
function aPorcentaje(v: number | null | undefined, fallback: number): number {
  if (v == null) return fallback;
  return v > 0 && v < 1 ? Math.round(v * 10000) / 100 : v;
}

function sanitizeParams(input: Partial<LiquidacionParams> | null | undefined): LiquidacionParams {
  const p = { ...PARAMS_DEFAULT, ...(input ?? {}) };
  const n = (v: number) => (Number.isFinite(v) ? v : 0);
  return {
    humedadMaxPct: n(p.humedadMaxPct),
    tasaDescuentoHumedad: n(p.tasaDescuentoHumedad),
    impurezasMaxPct: n(p.impurezasMaxPct),
    tasaDescuentoImpurezas: n(p.tasaDescuentoImpurezas),
    fermentacionMinPct: n(p.fermentacionMinPct),
    tasaBonifFermentacion: n(p.tasaBonifFermentacion),
    ajusteManualDescuento: Math.max(0, n(p.ajusteManualDescuento)),
    ajusteManualBonificacion: Math.max(0, n(p.ajusteManualBonificacion)),
  };
}

/** Abre la liquidación de una recepción cerrada (una por recepción). */
export async function crearLiquidacion(recepcionId: string): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: existe } = await supabase
    .from("liquidaciones")
    .select("id")
    .eq("recepcion_id", recepcionId)
    .maybeSingle();
  if (existe) return { ok: true, id: existe.id };

  const { data: rec } = await supabase
    .from("recepciones")
    .select("estado, orden_id, peso_recibido_kg, humedad_pct, fermentacion_pct, impurezas_pct")
    .eq("id", recepcionId)
    .maybeSingle();
  if (!rec) return { ok: false, error: "Recepción no encontrada." };
  if (rec.estado !== "Cerrada")
    return { ok: false, error: "La recepción debe estar cerrada para liquidar." };

  const { data: oc } = await supabase
    .from("ordenes_compra")
    .select("precio_kg, consecutivo, proveedor_id")
    .eq("id", rec.orden_id)
    .maybeSingle();

  // Umbrales por defecto desde el contrato del proveedor (si existe).
  let params = sanitizeParams(null);
  if (oc?.proveedor_id) {
    const { data: cont } = await supabase
      .from("contratos")
      .select("humedad_maxima, fermentacion_minima")
      .eq("proveedor_id", oc.proveedor_id)
      .maybeSingle();
    if (cont) {
      params = sanitizeParams({
        humedadMaxPct: aPorcentaje(cont.humedad_maxima, PARAMS_DEFAULT.humedadMaxPct),
        fermentacionMinPct: aPorcentaje(cont.fermentacion_minima, PARAMS_DEFAULT.fermentacionMinPct),
      });
    }
  }

  const desglose = calcularLiquidacion({
    pesoRecibidoKg: rec.peso_recibido_kg ?? 0,
    precioKg: oc?.precio_kg ?? 0,
    humedadPct: rec.humedad_pct,
    fermentacionPct: rec.fermentacion_pct,
    impurezasPct: rec.impurezas_pct,
    params,
  });

  const { data, error } = await supabase
    .from("liquidaciones")
    .insert({
      recepcion_id: recepcionId,
      orden_id: rec.orden_id,
      peso_recibido_kg: rec.peso_recibido_kg,
      precio_kg: oc?.precio_kg ?? null,
      humedad_pct: rec.humedad_pct,
      fermentacion_pct: rec.fermentacion_pct,
      impurezas_pct: rec.impurezas_pct,
      params: params as unknown as Json,
      valor_base: desglose.valorBase,
      total_sanciones: desglose.totalSanciones,
      total_bonificaciones: desglose.totalBonificaciones,
      valor_total: desglose.valorTotal,
      desglose: desglose as unknown as Json,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await logAudit("liquidacion", data.id, "crear", `Generó la liquidación de la OC ${oc?.consecutivo ?? ""}`.trim());
  revalidatePath("/procesos/liquidacion");
  return { ok: true, id: data.id };
}

/** Recalcula y guarda con parámetros ajustados (solo "Por revisión"). */
export async function guardarLiquidacion(
  id: string,
  params: Partial<LiquidacionParams>,
  observaciones?: string,
): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { data: liq } = await supabase
    .from("liquidaciones")
    .select("estado, peso_recibido_kg, precio_kg, humedad_pct, fermentacion_pct, impurezas_pct")
    .eq("id", id)
    .maybeSingle();
  if (!liq) return { ok: false, error: "Liquidación no encontrada." };
  if (liq.estado !== "Por revisión")
    return { ok: false, error: "La liquidación ya está aprobada (inmodificable)." };

  const clean = sanitizeParams(params);
  const desglose = calcularLiquidacion({
    pesoRecibidoKg: liq.peso_recibido_kg ?? 0,
    precioKg: liq.precio_kg ?? 0,
    humedadPct: liq.humedad_pct,
    fermentacionPct: liq.fermentacion_pct,
    impurezasPct: liq.impurezas_pct,
    params: clean,
  });

  const row: TablesUpdate<"liquidaciones"> = {
    params: clean as unknown as Json,
    valor_base: desglose.valorBase,
    total_sanciones: desglose.totalSanciones,
    total_bonificaciones: desglose.totalBonificaciones,
    valor_total: desglose.valorTotal,
    desglose: desglose as unknown as Json,
    observaciones: observaciones?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("liquidaciones").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit("liquidacion", id, "actualizar", "Recalculó la liquidación");
  revalidatePath(`/procesos/liquidacion/${id}`);
  return { ok: true, id };
}

/** Aprueba la liquidación: queda inmodificable y lista para facturar. */
export async function aprobarLiquidacion(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: liq } = await supabase
    .from("liquidaciones")
    .select("estado, valor_total, orden_id, ordenes_compra(consecutivo)")
    .eq("id", id)
    .maybeSingle();
  if (!liq) return { ok: false, error: "Liquidación no encontrada." };
  if (liq.estado === "Aprobada") return { ok: false, error: "La liquidación ya está aprobada." };

  const { error } = await supabase
    .from("liquidaciones")
    .update({
      estado: "Aprobada",
      aprobada_por: session.userId,
      aprobada_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const consecutivo =
    (liq.ordenes_compra as unknown as { consecutivo?: string } | null)?.consecutivo ?? "";
  await logAudit("liquidacion", id, "aprobar", `Aprobó la liquidación de la OC ${consecutivo}`.trim());
  await notificarDepartamentos(["Administrativo", "Comercial"], {
    tipo: "liquidacion_aprobada",
    titulo: `Liquidación aprobada — OC ${consecutivo}`.trim(),
    cuerpo: "Liquidado aprobado (inmodificable). Enviar a facturación.",
    enlace: `/procesos/liquidacion/${id}`,
    entidad: "liquidacion",
    entidadId: id,
  });
  revalidatePath(`/procesos/liquidacion/${id}`);
  revalidatePath("/procesos/liquidacion");
  return { ok: true, id };
}
