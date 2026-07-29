"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { taskSchema } from "@/lib/schemas/task";
import type { TaskStatus } from "@/lib/status";

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
  const { assignee_ids, ...task } = parsed.data;
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...task, created_by: session.userId })
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
