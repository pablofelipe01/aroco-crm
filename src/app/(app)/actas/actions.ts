"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";

export type ActaResult = { ok: boolean; error?: string; count?: number };

const tasksSchema = z.object({
  meeting_id: z.string().uuid(),
  tasks: z
    .array(
      z.object({
        name: z.string().trim().min(1),
        /** Una tarea del acta puede quedar en manos de varias personas. */
        assignee_ids: z.array(z.string().uuid()).default([]),
        person_name: z.string().nullable().optional(),
        due_date: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

/** Bulk-create the confirmed tasks extracted from an acta. */
export async function createActaTasks(input: unknown): Promise<ActaResult> {
  const parsed = tasksSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };

  const supabase = await createClient();
  const rows = parsed.data.tasks.map((t) => ({
    name: t.name,
    // person_id / person_name los deriva el trigger de task_assignees; el
    // nombre suelto solo se conserva si nadie del equipo quedó asignado.
    person_name: t.assignee_ids.length === 0 ? (t.person_name ?? null) : null,
    due_date: t.due_date || null,
    description: t.description ?? null,
    status: "pending" as const,
    source: "Acta",
    meeting_id: parsed.data.meeting_id,
    created_by: session.userId,
  }));

  const { data: inserted, error } = await supabase
    .from("tasks")
    .insert(rows)
    .select("id");
  if (error) {
    const msg = /row-level|policy|permission/i.test(error.message)
      ? "No tienes permiso para crear tareas."
      : error.message;
    return { ok: false, error: msg };
  }

  // El insert conserva el orden, así que los ids casan con las tareas de entrada.
  const links = (inserted ?? []).flatMap((task, i) =>
    (parsed.data.tasks[i]?.assignee_ids ?? []).map((team_member_id) => ({
      task_id: task.id,
      team_member_id,
    })),
  );
  if (links.length > 0) {
    const { error: aErr } = await supabase.from("task_assignees").insert(links);
    if (aErr) return { ok: false, error: aErr.message };
  }

  revalidatePath("/tareas");
  revalidatePath("/actas");
  return { ok: true, count: rows.length };
}

/** Delete an acta (its tasks keep, with meeting_id set null) + its stored file. */
export async function deleteMeeting(id: string): Promise<ActaResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };
  const supabase = await createClient();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("file_path")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("meetings").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  if (meeting?.file_path) {
    await supabase.storage.from("actas").remove([meeting.file_path]);
  }
  revalidatePath("/actas");
  return { ok: true };
}

/**
 * Signed URL to download an acta file.
 *
 * Se comprueba primero que el acta dueña del archivo sea visible para quien
 * pide: la RLS de `meetings` esconde las actas restringidas, y sin este paso
 * bastaría con conocer la ruta del archivo para saltársela. La política de
 * storage (0044) lo bloquea también del lado de la base; esto es la segunda
 * cerradura y da un error entendible en vez de uno de permisos.
 */
export async function getActaFileUrl(filePath: string): Promise<string | null> {
  const session = await getSessionContext();
  if (!session) return null;
  const supabase = await createClient();

  const { data: meeting } = await supabase
    .from("meetings")
    .select("id")
    .eq("file_path", filePath)
    .maybeSingle();
  if (!meeting) return null;

  const { data } = await supabase.storage.from("actas").createSignedUrl(filePath, 120);
  return data?.signedUrl ?? null;
}

/** Marca o desmarca un acta como restringida a sus invitados. */
export async function setMeetingRestricted(
  id: string,
  restricted: boolean,
): Promise<ActaResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };
  const supabase = await createClient();
  const { error } = await supabase.from("meetings").update({ restricted }).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/actas");
  return { ok: true };
}
