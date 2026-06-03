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

export async function createTask(input: unknown): Promise<ActionResult> {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const session = await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...parsed.data, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
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
  const { error } = await supabase.from("tasks").update(parsed.data).eq("id", id);
  if (error) return { ok: false, error: error.message };
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
