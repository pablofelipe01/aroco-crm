"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import {
  preguntaSchema,
  respuestaSchema,
  PREGUNTA_ESTADOS,
  type PreguntaEstado,
} from "@/lib/schemas/pregunta";
import type { Database } from "@/lib/types/database";

export type PreguntaResult = { ok: boolean; error?: string; id?: string };

type Dept = Database["public"]["Enums"]["department"];

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

function legible(mensaje: string): string {
  if (/row-level|policy|permission|42501/i.test(mensaje)) {
    return "No tienes permiso para esta acción.";
  }
  return mensaje;
}

export async function crearPregunta(input: unknown): Promise<PreguntaResult> {
  const parsed = preguntaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const session = await requireSession();
  const supabase = await createClient();
  const { area, ...resto } = parsed.data;
  const { data, error } = await supabase
    .from("preguntas")
    .insert({ ...resto, area: (area as Dept | null) ?? null, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/preguntas");
  return { ok: true, id: data.id };
}

export async function editarPregunta(id: string, input: unknown): Promise<PreguntaResult> {
  const parsed = preguntaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  await requireSession();
  const supabase = await createClient();
  const { area, ...resto } = parsed.data;
  const { error } = await supabase
    .from("preguntas")
    .update({ ...resto, area: (area as Dept | null) ?? null })
    .eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/preguntas");
  return { ok: true, id };
}

/**
 * Guarda la respuesta y da la pregunta por cerrada. La fecha y el autor los
 * pone el trigger de la base, no el cliente.
 */
export async function responderPregunta(input: unknown): Promise<PreguntaResult> {
  const parsed = respuestaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("preguntas")
    .update({ respuesta: parsed.data.respuesta, estado: "Respondida" })
    .eq("id", parsed.data.id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/preguntas");
  return { ok: true, id: parsed.data.id };
}

export async function cambiarEstadoPregunta(
  id: string,
  estado: string,
): Promise<PreguntaResult> {
  if (!PREGUNTA_ESTADOS.includes(estado as PreguntaEstado)) {
    return { ok: false, error: "Estado inválido." };
  }
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("preguntas")
    .update({ estado: estado as PreguntaEstado })
    .eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/preguntas");
  return { ok: true, id };
}

export async function borrarPregunta(id: string): Promise<PreguntaResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("preguntas").delete().eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/preguntas");
  return { ok: true, id };
}
