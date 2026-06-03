"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { LEAD_STAGES } from "@/lib/status";
import { quoteSchema, buildQuoteRow } from "@/lib/schemas/quote";

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
  z.object({
    kind: z.literal("create_lead"),
    company: z.string().min(1),
    contact_name: z.string().nullable().optional(),
    country: z.string().nullable().optional(),
    market: z.enum(["Nacional", "Internacional"]).nullable().optional(),
    type: z
      .enum(["Comprador", "Proveedor potencial", "Comprador/Broker"])
      .nullable()
      .optional(),
    status: z.enum(LEAD_STAGES),
    product_interest: z.string().nullable().optional(),
    commercial_owner: z.string().uuid().nullable().optional(),
    owner_name: z.string().nullable().optional(),
  }),
  z.object({
    kind: z.literal("create_quote"),
    company: z.string(),
    incoterm: z.string(),
    preview_usd_tm: z.number().nullable().optional(),
    quote: quoteSchema,
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

  if (p.kind === "inventory_movement") {
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

  if (p.kind === "create_lead") {
    const { data, error } = await supabase
      .from("leads")
      .insert({
        company: p.company,
        contact_name: p.contact_name ?? null,
        country: p.country ?? null,
        market: p.market ?? null,
        type: p.type ?? null,
        status: p.status,
        product_interest: p.product_interest ?? null,
        commercial_owner: p.commercial_owner ?? null,
        source: "app",
        created_by: session.userId,
      })
      .select("id")
      .single();
    if (error) return { ok: false, error: friendly(error.message) };
    await supabase.from("lead_activities").insert({
      lead_id: data.id,
      type: "Nota",
      description: "Lead creado (vía asistente).",
      user_name: userName,
      created_by: session.userId,
    });
    revalidatePath("/comercial");
    return { ok: true, message: `Lead creado: ${p.company}.` };
  }

  // create_quote (borrador)
  const { count } = await supabase
    .from("quotes")
    .select("id", { count: "exact", head: true });
  const quote_number = `COT-${new Date().getFullYear()}-${String((count ?? 0) + 1).padStart(4, "0")}`;
  const row = buildQuoteRow(p.quote);
  const { error } = await supabase
    .from("quotes")
    .insert({ ...row, quote_number, status: "borrador", created_by: session.userId });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath("/cotizaciones");
  return { ok: true, message: `Cotización ${quote_number} creada en borrador.` };
}
