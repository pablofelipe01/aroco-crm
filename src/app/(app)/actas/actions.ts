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
        person_id: z.string().uuid().nullable().optional(),
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
    person_id: t.person_id ?? null,
    person_name: t.person_name ?? null,
    due_date: t.due_date || null,
    description: t.description ?? null,
    status: "pending" as const,
    source: "Acta",
    meeting_id: parsed.data.meeting_id,
    created_by: session.userId,
  }));

  const { error } = await supabase.from("tasks").insert(rows);
  if (error) {
    const msg = /row-level|policy|permission/i.test(error.message)
      ? "No tienes permiso para crear tareas."
      : error.message;
    return { ok: false, error: msg };
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

/** Signed URL to download an acta file. */
export async function getActaFileUrl(filePath: string): Promise<string | null> {
  const session = await getSessionContext();
  if (!session) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("actas").createSignedUrl(filePath, 120);
  return data?.signedUrl ?? null;
}
