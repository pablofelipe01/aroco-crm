"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { LEAD_STAGES } from "@/lib/status";

export type ExecuteResult = { ok: boolean; message?: string; error?: string };

const proposalSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("lead_status"),
    lead_id: z.string().uuid(),
    company: z.string(),
    status: z.enum(LEAD_STAGES),
    from: z.string().optional(),
  }),
  z.object({
    kind: z.literal("lead_note"),
    lead_id: z.string().uuid(),
    company: z.string(),
    note: z.string().min(1),
  }),
  z.object({
    kind: z.literal("create_task"),
    name: z.string().min(1),
    person_id: z.string().uuid().nullable().optional(),
    person_name: z.string().nullable().optional(),
    due_date: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("inventory_movement"),
    lot_id: z.string().uuid(),
    code: z.string(),
    movement: z.enum(["entrada", "salida"]),
    qty_kg: z.number().positive(),
    available: z.number().optional(),
    note: z.string().nullable().optional(),
  }),
]);

export type AgentProposal = z.infer<typeof proposalSchema>;

function friendly(error: string): string {
  return /row-level|policy|permission/i.test(error)
    ? "No tienes permiso para esta acción."
    : error;
}

/**
 * Execute an agent-proposed write AFTER the user confirms it in the UI.
 * Runs with the user's session, so RLS authorizes (or rejects) the write.
 */
export async function executeAgentAction(input: unknown): Promise<ExecuteResult> {
  const parsed = proposalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Acción inválida." };

  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };

  const supabase = await createClient();
  const p = parsed.data;
  const userName = session.profile?.full_name ?? null;

  if (p.kind === "lead_status") {
    const { error } = await supabase
      .from("leads")
      .update({ status: p.status })
      .eq("id", p.lead_id);
    if (error) return { ok: false, error: friendly(error.message) };
    await supabase.from("lead_activities").insert({
      lead_id: p.lead_id,
      type: "Cambio de estado",
      description: `Estado cambiado a "${p.status}" (vía asistente).`,
      user_name: userName,
      created_by: session.userId,
    });
    revalidatePath("/comercial");
    return { ok: true, message: `Estado de ${p.company} → ${p.status}.` };
  }

  if (p.kind === "lead_note") {
    const { error } = await supabase.from("lead_activities").insert({
      lead_id: p.lead_id,
      type: "Nota",
      description: p.note,
      user_name: userName,
      created_by: session.userId,
    });
    if (error) return { ok: false, error: friendly(error.message) };
    revalidatePath("/comercial");
    return { ok: true, message: `Nota agregada a ${p.company}.` };
  }

  if (p.kind === "create_task") {
    const { error } = await supabase.from("tasks").insert({
      name: p.name,
      person_id: p.person_id ?? null,
      person_name: p.person_name ?? null,
      due_date: p.due_date || null,
      description: p.description ?? null,
      status: "pending",
      created_by: session.userId,
    });
    if (error) return { ok: false, error: friendly(error.message) };
    revalidatePath("/tareas");
    return { ok: true, message: `Tarea creada: ${p.name}.` };
  }

  // inventory_movement
  const { error } = await supabase.from("inventory_movements").insert({
    lot_id: p.lot_id,
    kind: p.movement,
    qty_kg: p.qty_kg,
    notes: p.note ?? "Registrado vía asistente",
    created_by: session.userId,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/inventario");
  return {
    ok: true,
    message: `${p.movement === "salida" ? "Salida" : "Entrada"} de ${p.qty_kg} kg en ${p.code}.`,
  };
}
