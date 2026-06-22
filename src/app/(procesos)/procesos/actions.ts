"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { PROCESO_CACAO } from "@/lib/procesos/template";
import { instanciarCaso, recalcularRamas } from "@/lib/procesos/instantiate";
import type {
  DecisionInstancia,
  EstadoPaso,
  PasoInstancia,
  TipoCaso,
} from "@/lib/procesos/types";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Mapa nombre→id de los miembros del equipo (insensible a tildes). */
async function mapaEquipo(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Map<string, string>> {
  const { data } = await supabase.from("team_members").select("id, name");
  const m = new Map<string, string>();
  for (const t of data ?? []) m.set(norm(t.name), t.id);
  return m;
}

async function logEvento(
  supabase: Awaited<ReturnType<typeof createClient>>,
  casoId: string,
  descripcion: string,
  pasoNumero?: string | null,
) {
  await supabase.from("proceso_eventos").insert({
    caso_id: casoId,
    descripcion,
    paso_numero: pasoNumero ?? null,
  });
}

/** Crea un caso instanciando la plantilla y asignando responsables por defecto. */
export async function crearCaso(input: {
  tipo: TipoCaso;
  titulo: string;
  origen?: string | null;
  proveedorRef?: string | null;
}): Promise<ActionResult> {
  const session = await requireSession();
  if (!input.titulo?.trim()) return { ok: false, error: "Falta el título." };
  const supabase = await createClient();

  const { data: caso, error: e1 } = await supabase
    .from("proceso_casos")
    .insert({
      tipo: input.tipo,
      titulo: input.titulo.trim(),
      origen: input.origen ?? null,
      proveedor_ref: input.proveedorRef ?? null,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (e1 || !caso) return { ok: false, error: e1?.message ?? "No se pudo crear." };

  const equipo = await mapaEquipo(supabase);
  const { pasos, decisiones } = instanciarCaso(PROCESO_CACAO, input.tipo);

  const pasoRows = pasos.map((p) => ({
    caso_id: caso.id,
    fase_numero: p.fase_numero,
    fase_nombre: p.fase_nombre,
    orden: p.orden,
    numero: p.numero,
    titulo: p.titulo,
    rol: p.rol,
    es_automatico: p.es_automatico,
    es_rama: p.es_rama,
    estado: p.estado,
    asignado_a: p.personaNombre ? (equipo.get(norm(p.personaNombre)) ?? null) : null,
  }));
  const decRows = decisiones.map((d) => ({
    caso_id: caso.id,
    fase_numero: d.fase_numero,
    orden: d.orden,
    clave: d.clave,
    pregunta: d.pregunta,
    rol: d.rol,
    opciones: d.opciones,
  }));

  const [r1, r2] = await Promise.all([
    supabase.from("proceso_pasos").insert(pasoRows),
    decRows.length ? supabase.from("proceso_decisiones").insert(decRows) : Promise.resolve({ error: null }),
  ]);
  if (r1.error || r2.error)
    return { ok: false, error: r1.error?.message ?? r2.error?.message };

  await logEvento(supabase, caso.id, "Caso creado.");
  revalidatePath("/procesos");
  return { ok: true, id: caso.id };
}

/** Recalcula fase actual + estado global del caso a partir de sus pasos. */
async function recomputarCaso(
  supabase: Awaited<ReturnType<typeof createClient>>,
  casoId: string,
) {
  const { data: rows } = await supabase
    .from("proceso_pasos")
    .select("fase_numero, orden, estado")
    .eq("caso_id", casoId)
    .order("fase_numero", { ascending: true })
    .order("orden", { ascending: true });
  const pasos = (rows ?? []) as { fase_numero: number; estado: EstadoPaso }[];
  const aplicables = pasos.filter((p) => p.estado !== "no_aplica");

  const bloqueado = pasos.some((p) => p.estado === "bloqueado");
  const completo =
    aplicables.length > 0 && aplicables.every((p) => p.estado === "completado");
  const estado = bloqueado ? "bloqueado" : completo ? "completado" : "en_curso";

  // Fase actual = la menor fase con algún paso aplicable sin completar.
  const pend = pasos.find(
    (p) => p.estado !== "completado" && p.estado !== "no_aplica",
  );
  const faseActual = pend?.fase_numero ?? pasos[pasos.length - 1]?.fase_numero ?? 1;

  await supabase
    .from("proceso_casos")
    .update({ estado, fase_actual: faseActual })
    .eq("id", casoId);
}

/** Actualiza un paso (estado, responsable, notas, fecha límite). */
export async function actualizarPaso(
  pasoId: string,
  patch: {
    estado?: EstadoPaso;
    asignadoA?: string | null;
    notas?: string | null;
    fechaLimite?: string | null;
  },
): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();

  const { data: actual } = await supabase
    .from("proceso_pasos")
    .select("caso_id, numero, titulo, estado")
    .eq("id", pasoId)
    .maybeSingle();
  if (!actual) return { ok: false, error: "Paso no encontrado." };

  const update: {
    estado?: EstadoPaso;
    completado_el?: string | null;
    asignado_a?: string | null;
    notas?: string | null;
    fecha_limite?: string | null;
  } = {};
  if (patch.estado !== undefined) {
    update.estado = patch.estado;
    update.completado_el = patch.estado === "completado" ? new Date().toISOString() : null;
  }
  if (patch.asignadoA !== undefined) update.asignado_a = patch.asignadoA;
  if (patch.notas !== undefined) update.notas = patch.notas;
  if (patch.fechaLimite !== undefined) update.fecha_limite = patch.fechaLimite;

  const { error } = await supabase.from("proceso_pasos").update(update).eq("id", pasoId);
  if (error) return { ok: false, error: error.message };

  if (patch.estado !== undefined && patch.estado !== actual.estado) {
    await logEvento(
      supabase,
      actual.caso_id,
      `Paso ${actual.numero} → ${patch.estado.replace("_", " ")}.`,
      actual.numero,
    );
    await recomputarCaso(supabase, actual.caso_id);
  }

  revalidatePath(`/procesos/${actual.caso_id}`);
  revalidatePath("/procesos");
  return { ok: true };
}

/** Elige una opción de decisión y recalcula los pasos de rama. */
export async function elegirDecision(
  decisionId: string,
  opcionId: string,
): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();

  const { data: dec } = await supabase
    .from("proceso_decisiones")
    .select("*")
    .eq("id", decisionId)
    .maybeSingle();
  if (!dec) return { ok: false, error: "Decisión no encontrada." };

  await supabase
    .from("proceso_decisiones")
    .update({ elegida: opcionId })
    .eq("id", decisionId);

  const { data: pasosRows } = await supabase
    .from("proceso_pasos")
    .select("id, numero, estado")
    .eq("caso_id", dec.caso_id);
  const pasos = (pasosRows ?? []).map((r) => ({
    id: r.id,
    numero: r.numero,
    estado: r.estado as EstadoPaso,
  })) as (Pick<PasoInstancia, "numero" | "estado"> & { id: string })[];

  const cambios = recalcularRamas(
    pasos as unknown as PasoInstancia[],
    (dec.opciones ?? []) as unknown as DecisionInstancia["opciones"],
    opcionId,
  );
  for (const c of cambios) {
    const p = pasos.find((x) => x.numero === c.numero);
    if (p) await supabase.from("proceso_pasos").update({ estado: c.estado }).eq("id", p.id);
  }

  const etiqueta =
    (dec.opciones as unknown as DecisionInstancia["opciones"]).find((o) => o.id === opcionId)
      ?.etiqueta ?? opcionId;
  await logEvento(supabase, dec.caso_id, `Decisión: "${etiqueta}".`);
  await recomputarCaso(supabase, dec.caso_id);

  revalidatePath(`/procesos/${dec.caso_id}`);
  return { ok: true };
}
