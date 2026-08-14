import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { PreguntasClient } from "./preguntas-client";
import type { Pregunta } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type PreguntaConAutor = Pregunta & {
  autor: string | null;
  respondio: string | null;
};

export default async function PreguntasPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const [{ data: preguntas }, { data: perfiles }] = await Promise.all([
    // Pendientes primero y por prioridad: el orden en que se van a repasar en
    // la reunión. Las respondidas quedan abajo como historial.
    supabase
      .from("preguntas")
      .select("*")
      .order("estado")
      .order("prioridad")
      .order("created_at"),
    supabase.from("profiles").select("id, full_name").eq("active", true),
  ]);

  const nombre = new Map((perfiles ?? []).map((p) => [p.id, p.full_name]));

  const filas: PreguntaConAutor[] = (preguntas ?? []).map((p) => ({
    ...p,
    autor: p.created_by ? (nombre.get(p.created_by) ?? null) : null,
    respondio: p.respondida_por ? (nombre.get(p.respondida_por) ?? null) : null,
  }));

  return <PreguntasClient preguntas={filas} userId={session?.userId ?? ""} />;
}
