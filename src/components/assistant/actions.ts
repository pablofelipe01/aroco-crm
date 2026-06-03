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

  // lead_note
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
