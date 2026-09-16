"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { sincronizarComisiones } from "@/lib/comisiones/sync";
import { getSessionContext } from "@/lib/auth";
import {
  simulateCommission,
  type CommissionRule,
  type Market,
  type CommissionLevel,
  type CommissionRole,
} from "@/lib/calc/comisiones";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

export async function updateCommissionRule(
  id: string,
  pctFull: number,
): Promise<ActionResult> {
  if (!Number.isFinite(pctFull) || pctFull < 0 || pctFull > 1) {
    return { ok: false, error: "El porcentaje debe ser un ratio entre 0 y 1." };
  }
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("commission_rules")
    .update({ pct_full: pctFull })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/comisiones");
  return { ok: true, id };
}

const calcSchema = z.object({
  sale_total_cop: z.coerce.number(),
  cost_total_cop: z.coerce.number(),
  market: z.enum(["Nacional", "Internacional"]),
  level: z.enum(["Senior", "Junior"]),
  role: z.enum(["Compra+Venta", "Solo Venta", "Solo Compra"]),
  agent: z.string().uuid().nullable().optional(),
  quote_id: z.string().uuid().nullable().optional(),
});

export async function saveCommissionCalc(input: unknown): Promise<ActionResult> {
  const parsed = calcSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const session = await requireSession();
  const supabase = await createClient();

  // Compute authoritatively with the live DB rules.
  const { data: rules } = await supabase
    .from("commission_rules")
    .select("market, level, pct_full");

  const r = simulateCommission({
    ventaTotal: parsed.data.sale_total_cop,
    costoTotal: parsed.data.cost_total_cop,
    market: parsed.data.market as Market,
    level: parsed.data.level as CommissionLevel,
    role: parsed.data.role as CommissionRole,
    rules: (rules ?? []) as CommissionRule[],
  });

  const { error } = await supabase.from("commission_calcs").insert({
    sale_total_cop: parsed.data.sale_total_cop,
    cost_total_cop: parsed.data.cost_total_cop,
    market: parsed.data.market,
    level: parsed.data.level,
    role: parsed.data.role,
    gross_utility: r.utilidadBruta,
    applied_pct: r.pctAplicable,
    commission_cop: r.comision,
    agent: parsed.data.agent ?? null,
    quote_id: parsed.data.quote_id ?? null,
    created_by: session.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/comisiones");
  return { ok: true };
}

const tonnageSchema = z.object({
  agent: z.string().uuid(),
  period: z.string().regex(/^\d{4}-\d{2}$/, "Mes inválido."), // YYYY-MM
  market: z.enum(["Nacional", "Internacional"]),
  role: z.enum(["Compra+Venta", "Solo Venta", "Solo Compra"]),
  tons: z.coerce.number().min(0, "Las toneladas no pueden ser negativas."),
  note: z.string().trim().nullable().optional(),
});

/** Upsert a commercial's tons moved for a given month + market. */
export async function saveMonthlyTonnage(input: unknown): Promise<ActionResult> {
  const parsed = tonnageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const session = await requireSession();
  const supabase = await createClient();

  const { error } = await supabase.from("monthly_tonnage").upsert(
    {
      agent: parsed.data.agent,
      period: `${parsed.data.period}-01`,
      market: parsed.data.market,
      role: parsed.data.role,
      tons: parsed.data.tons,
      note: parsed.data.note ?? null,
      created_by: session.userId,
    },
    { onConflict: "agent,period,market" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/comisiones");
  return { ok: true };
}

export async function deleteMonthlyTonnage(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("monthly_tonnage").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/comisiones");
  return { ok: true };
}

/**
 * Lee la hoja de liquidación AHORA, sin esperar al cron.
 *
 * Hace falta por cómo trabaja Nicolás: la hoja liquida un mes a la vez y él
 * cierra varios en una sesión, cambiando el parámetro «Mes a liquidar». El
 * cron solo ve el que esté puesto a las 12:45 UTC, así que cerrar mayo por la
 * mañana y pasar a junio antes del mediodía deja mayo sin capturar para
 * siempre. Es lo que pasó con mayo, junio y julio.
 *
 * Con esto, cada mes que cierre se guarda en el momento y el cron queda como
 * respaldo. Corre con `service_role` como el cron —las tablas de liquidación
 * no aceptan escritura desde una sesión— pero solo después de comprobar el
 * permiso, que es lo que la llave de servicio se saltaría.
 */
export async function importarLiquidacionAhora(): Promise<
  ActionResult & { mes?: string; lineas?: number; sinAsignar?: string[] }
> {
  const session = await getSessionContext();
  if (!session?.profile?.ve_comisiones_todas) {
    return { ok: false, error: "Solo Dirección puede importar la liquidación." };
  }

  try {
    const res = await fetch(serverEnv.COMISIONES_SHEET_CSV_URL, {
      cache: "no-store",
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} al leer la hoja`);
    const csv = await res.text();
    if (csv.trimStart().startsWith("<!DOCTYPE")) {
      throw new Error("La hoja no devolvió CSV (¿dejó de estar compartida?).");
    }

    const db = createAdminClient();
    const r = await sincronizarComisiones(db, csv);

    await db.from("inventory_sync_runs").insert({
      source: "comisiones_sheet",
      status: "ok",
      rows_read: r.lineas + r.operaciones,
      duration_ms: 0,
      error: `Importado a mano por ${session.profile.full_name}${
        r.sinAsignar.length ? ` · sin asignar: ${r.sinAsignar.join(", ")}` : ""
      }`,
    });

    revalidatePath("/comisiones");
    return {
      ok: true,
      mes: `${r.mesNombre} ${r.anio}`,
      lineas: r.lineas,
      sinAsignar: r.sinAsignar,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error desconocido." };
  }
}
