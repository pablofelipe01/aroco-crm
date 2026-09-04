"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { taskSchema } from "@/lib/schemas/task";
import type { TaskStatus } from "@/lib/status";
import type { TaskNote } from "@/lib/types/database";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

/**
 * Reemplaza los responsables de una tarea. `tasks.person_id`/`person_name` los
 * deriva el trigger `task_assignees_sync`, así que aquí no se tocan.
 */
async function setAssignees(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  assigneeIds: string[],
): Promise<string | null> {
  const wanted = [...new Set(assigneeIds)];

  const { data: current, error: readErr } = await supabase
    .from("task_assignees")
    .select("team_member_id")
    .eq("task_id", taskId);
  if (readErr) return readErr.message;

  const existing = (current ?? []).map((r) => r.team_member_id);
  const toAdd = wanted.filter((id) => !existing.includes(id));
  const toRemove = existing.filter((id) => !wanted.includes(id));

  if (toRemove.length > 0) {
    const { error } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", taskId)
      .in("team_member_id", toRemove);
    if (error) return error.message;
  }
  if (toAdd.length > 0) {
    const { error } = await supabase
      .from("task_assignees")
      .insert(toAdd.map((team_member_id) => ({ task_id: taskId, team_member_id })));
    if (error) return error.message;
  }
  return null;
}

export async function createTask(input: unknown): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const session = await requireSession();
  const supabase = await createClient();
  const { assignee_ids, start_date, ...task } = parsed.data;
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      ...task,
      created_by: session.userId,
      // La clave se OMITE cuando viene vacía para que actúe el
      // `default current_date` de la columna (migración 0079). Mandar
      // `start_date: null` lo pisaría y la tarea nacería sin fecha de inicio,
      // que es justo lo que se pidió resolver.
      ...(start_date ? { start_date } : {}),
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const assignErr = await setAssignees(supabase, data.id, assignee_ids);
  if (assignErr) return { ok: false, error: assignErr };

  revalidatePath("/tareas");
  return { ok: true, id: data.id };
}

export async function updateTask(id: string, input: unknown): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  await requireSession();
  const supabase = await createClient();
  const { assignee_ids, ...task } = parsed.data;
  const { error } = await supabase.from("tasks").update(task).eq("id", id);
  if (error) return { ok: false, error: error.message };

  const assignErr = await setAssignees(supabase, id, assignee_ids);
  if (assignErr) return { ok: false, error: assignErr };

  revalidatePath("/tareas");
  return { ok: true, id };
}

export async function updateTaskStatus(
  id: string,
  status: TaskStatus,
): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").update({ status }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tareas");
  return { ok: true, id };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tareas");
  return { ok: true };
}

/**
 * Bitácora de una tarea, de la más nueva a la más vieja.
 *
 * Se pide al abrir la tarea y no se trae junto con el tablero: son cientos de
 * tareas y las notas de todas ellas viajarían al navegador para que se lean
 * las de una.
 */
export async function listTaskNotes(
  taskId: string,
): Promise<{ ok: boolean; error?: string; notes: TaskNote[] }> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_notes")
    .select("*")
    .eq("task_id", taskId)
    .order("created_at", { ascending: false });
  if (error) return { ok: false, error: error.message, notes: [] };
  return { ok: true, notes: data ?? [] };
}

/**
 * Agrega una entrada a la bitácora de la tarea.
 *
 * Se guarda de inmediato y no al «Guardar» del formulario: una bitácora es un
 * registro de lo que pasó, y una nota que se pierde porque alguien cerró el
 * modal sin darle guardar no sirve como constancia.
 *
 * `created_by` lo pone el `default auth.uid()` de la columna y la política de
 * RLS exige que coincida con la sesión, así que aquí no hay nada que falsear.
 */
export async function addTaskNote(
  taskId: string,
  body: string,
): Promise<ActionResult> {
  const texto = body.trim();
  if (!texto) return { ok: false, error: "La nota está vacía." };

  const session = await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_notes")
    .insert({
      task_id: taskId,
      body: texto,
      // El nombre se congela al escribir: si la persona cambia de nombre o
      // sale del equipo, la nota sigue diciendo quién la puso ese día.
      author_name: session.profile?.full_name ?? session.email ?? null,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  revalidatePath("/tareas");
  return { ok: true, id: data.id };
}

/**
 * Borra una entrada de la bitácora.
 *
 * Quién puede hacerlo lo decide la RLS —el autor o un admin—, no esta función:
 * la comprobación tiene que estar donde no se pueda esquivar llamando a la API
 * por otro lado.
 */
export async function deleteTaskNote(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("task_notes").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/tareas");
  return { ok: true };
}
