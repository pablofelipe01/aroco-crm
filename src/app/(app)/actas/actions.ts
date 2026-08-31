"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { agruparActaPorTemas } from "@/lib/ai/actas";

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

  // `.select()` para saber si de verdad se borró. Desde 0076 solo puede
  // borrar quien administra el acta o quien la creó, y una fila que la RLS no
  // deja tocar NO produce error: la operación afecta cero filas y devuelve ok.
  // Sin esta comprobación, a quien no tiene permiso le saldría «acta
  // eliminada» y el acta seguiría en la lista al recargar.
  const { data: borradas, error } = await supabase
    .from("meetings")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!borradas || borradas.length === 0) {
    return {
      ok: false,
      error: "No puedes eliminar esta acta: solo pueden hacerlo quienes la administran o quien la subió.",
    };
  }
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

/**
 * Marca o desmarca un acta como restringida.
 *
 * Quién puede hacerlo lo decide la base (0049): un SuperAdmin que asistió a esa
 * reunión, o el Gerente General. Si no, el trigger la rechaza y aquí solo se
 * traduce el error a algo legible.
 */
export async function setMeetingRestricted(
  id: string,
  restricted: boolean,
): Promise<ActaResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };
  const supabase = await createClient();
  const { error } = await supabase.from("meetings").update({ restricted }).eq("id", id);
  if (error) {
    return {
      ok: false,
      error: /42501|permiso|policy/i.test(error.message)
        ? "No administras esta acta: solo pueden hacerlo quienes asistieron y tienen acceso total."
        : error.message,
    };
  }
  revalidatePath("/actas");
  return { ok: true };
}

/** Da o quita a una persona el acceso a un acta restringida. */
export async function setAttendeeAccess(
  attendeeId: string,
  canView: boolean,
): Promise<ActaResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meeting_attendees")
    .update({ can_view: canView })
    .eq("id", attendeeId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // La RLS no falla al filtrar: si no se actualizó nada, es que no manda aquí.
  if (!data || data.length === 0) {
    return { ok: false, error: "No administras esta acta." };
  }
  revalidatePath("/actas");
  return { ok: true };
}

/**
 * Delega —o retira— la administración del acta a otra persona.
 *
 * Solo surte efecto en quien tenga acceso total: la delegación reparte entre
 * SuperAdmins, no convierte a un miembro en administrador (ver 0050).
 */
export async function setAttendeeManage(
  attendeeId: string,
  canManage: boolean,
): Promise<ActaResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meeting_attendees")
    .update({ can_manage: canManage })
    .eq("id", attendeeId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "No administras esta acta." };
  }
  revalidatePath("/actas");
  return { ok: true };
}

/** Suma a alguien del equipo a la lista de acceso de un acta. */
export async function addMeetingViewer(
  meetingId: string,
  profileId: string,
): Promise<ActaResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };
  const supabase = await createClient();

  const { data: perfil } = await supabase
    .from("profiles")
    .select("full_name, email")
    .eq("id", profileId)
    .maybeSingle();
  if (!perfil) return { ok: false, error: "No se encontró esa persona." };

  const { error } = await supabase.from("meeting_attendees").insert({
    meeting_id: meetingId,
    profile_id: profileId,
    email: perfil.email,
    name: perfil.full_name,
    can_view: true,
    // No estuvo en la reunión: se le da acceso, pero el registro de asistencia
    // no se falsea.
    attended: false,
  });
  if (error) {
    return {
      ok: false,
      error: /duplicate|unique/i.test(error.message)
        ? "Esa persona ya está en la lista."
        : error.message,
    };
  }
  revalidatePath("/actas");
  return { ok: true };
}

/** Quita a alguien de la lista de acceso. */
export async function removeMeetingViewer(attendeeId: string): Promise<ActaResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meeting_attendees")
    .delete()
    .eq("id", attendeeId)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "No administras esta acta." };
  }
  revalidatePath("/actas");
  return { ok: true };
}

// ── Editar el acta ──────────────────────────────────────────────────────────

const actaSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1, "El acta necesita un título."),
  meeting_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.")
    .nullable()
    .optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Guarda los cambios del acta: título, fecha y cuerpo.
 *
 * Quién puede lo decide la base (`puede_editar_acta`, 0076): quien administra
 * el acta o quien la subió. Aquí se comprueba que el update haya tocado la
 * fila, porque una escritura bloqueada por RLS no devuelve error — devuelve
 * cero filas, y sin mirarlas el formulario diría «guardado» sin haber guardado.
 */
export async function actualizarActa(input: unknown): Promise<ActaResult> {
  const parsed = actaSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };

  const { id, title, meeting_date, notes } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("meetings")
    .update({
      title,
      meeting_date: meeting_date || null,
      notes: notes?.trim() ? notes : null,
    })
    .eq("id", id)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0)
    return {
      ok: false,
      error: "No puedes editar esta acta: solo pueden hacerlo quienes la administran o quien la subió.",
    };

  revalidatePath("/actas");
  return { ok: true };
}

// ── Temas ───────────────────────────────────────────────────────────────────

const temaSchema = z.object({
  id: z.string().uuid(),
  titulo: z.string().trim().min(1, "El tema necesita un título."),
  resumen: z.string().nullable().optional(),
});

/** Renombra un tema o corrige su resumen. */
export async function guardarTema(input: unknown): Promise<ActaResult> {
  const parsed = temaSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("meeting_temas")
    .update({
      titulo: parsed.data.titulo,
      resumen: parsed.data.resumen?.trim() ? parsed.data.resumen : null,
    })
    .eq("id", parsed.data.id)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0)
    return { ok: false, error: "No puedes editar los temas de esta acta." };

  revalidatePath("/actas");
  return { ok: true };
}

/**
 * Mueve una tarea de un tema a otro, o la deja sin tema (`null`).
 *
 * Es la salida cuando la IA reparte mal: corregir a mano es más rápido que
 * volver a agrupar el acta entera, y no arriesga los temas que sí quedaron
 * bien.
 */
export async function moverTareaDeTema(
  taskId: string,
  temaId: string | null,
): Promise<ActaResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .update({ tema_id: temaId })
    .eq("id", taskId)
    .select("id");

  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0)
    return { ok: false, error: "No se pudo mover la tarea." };

  revalidatePath("/actas");
  return { ok: true };
}

/**
 * Agrupa un acta por temas usando la IA.
 *
 * Se lanza a mano desde el acta, no automáticamente para las 51 que ya
 * existen: cada pasada cuesta una llamada al modelo y hay actas viejas que
 * nadie va a volver a abrir. Las nuevas sí se agrupan solas al llegar.
 *
 * Rehacerla es seguro: borra los temas anteriores y vuelve a repartir. Las
 * tareas sobreviven —`tema_id` es `on delete set null`— así que lo peor que
 * puede pasar es quedarse otra vez sin agrupación, nunca sin trabajo asignado.
 */
export async function agruparActa(meetingId: string): Promise<ActaResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Sesión expirada." };

  const supabase = await createClient();

  const { data: acta } = await supabase
    .from("meetings")
    .select("id, notes")
    .eq("id", meetingId)
    .maybeSingle();

  if (!acta) return { ok: false, error: "No se encontró el acta." };
  if (!acta.notes?.trim())
    return {
      ok: false,
      error: "Esta acta no tiene texto guardado; solo el archivo adjunto. No hay de dónde sacar los temas.",
    };

  // Se comprueba el permiso ANTES de gastar la llamada al modelo. Al revés
  // —agrupar y descubrir al escribir que la RLS lo rechaza— el acta se queda
  // igual y el gasto ya está hecho. Se le pregunta a la misma función que
  // aplica la política, así que no hay dos reglas que puedan discrepar.
  const { data: puede } = await supabase.rpc("puede_editar_acta", {
    p_meeting: meetingId,
  });
  if (!puede)
    return {
      ok: false,
      error: "No puedes agrupar esta acta: solo pueden hacerlo quienes la administran o quien la subió.",
    };

  const { data: tareas } = await supabase
    .from("tasks")
    .select("id, name")
    .eq("meeting_id", meetingId)
    .order("created_at", { ascending: true });

  const lista = tareas ?? [];
  const temas = await agruparActaPorTemas(
    acta.notes,
    lista.map((t) => ({ nombre: t.name })),
  );

  if (temas.length === 0)
    return { ok: false, error: "La IA no encontró temas en esta acta." };

  // Fuera los temas anteriores. Las tareas quedan sueltas un instante y se
  // vuelven a repartir enseguida; el `on delete set null` evita que se vayan
  // con ellos.
  await supabase.from("meeting_temas").delete().eq("meeting_id", meetingId);

  const { data: creados, error: errTemas } = await supabase
    .from("meeting_temas")
    .insert(
      temas.map((t, i) => ({
        meeting_id: meetingId,
        titulo: t.titulo,
        resumen: t.resumen || null,
        orden: i,
      })),
    )
    .select("id");

  if (errTemas) return { ok: false, error: errTemas.message };
  if (!creados || creados.length !== temas.length)
    return { ok: false, error: "No se pudieron guardar los temas." };

  // Reparto de las tareas. Se hace tema por tema y no en lote porque cada
  // grupo apunta a un id distinto.
  await Promise.all(
    temas.map((t, i) => {
      const ids = t.tareas.map((n) => lista[n]?.id).filter((x): x is string => !!x);
      if (ids.length === 0) return Promise.resolve();
      return supabase
        .from("tasks")
        .update({ tema_id: creados[i].id })
        .in("id", ids)
        .then(() => undefined);
    }),
  );

  revalidatePath("/actas");
  return { ok: true, count: temas.length };
}
