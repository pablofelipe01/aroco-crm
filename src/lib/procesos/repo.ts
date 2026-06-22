/**
 * Capa de datos de Procesos (lecturas). Aísla el acceso a Supabase de la UI.
 * Las mutaciones viven en server actions (`(procesos)/procesos/actions.ts`).
 * Para migrar de backend, basta reimplementar estas funciones.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { calcularAvance } from "./instantiate";
import type {
  CasoDetalle,
  CasoResumen,
  DecisionInstancia,
  EstadoCaso,
  EstadoPaso,
  PasoInstancia,
  TipoCaso,
} from "./types";

type PasoRow = {
  id: string;
  fase_numero: number;
  fase_nombre: string;
  orden: number;
  numero: string;
  titulo: string;
  rol: string;
  es_automatico: boolean;
  es_rama: boolean;
  asignado_a: string | null;
  estado: EstadoPaso;
  notas: string | null;
  fecha_limite: string | null;
  completado_el: string | null;
  completado_por: string | null;
};

function mapPaso(r: PasoRow): PasoInstancia {
  return {
    id: r.id,
    faseNumero: r.fase_numero,
    faseNombre: r.fase_nombre,
    orden: r.orden,
    numero: r.numero,
    titulo: r.titulo,
    rol: r.rol,
    esAutomatico: r.es_automatico,
    esRama: r.es_rama,
    asignadoA: r.asignado_a,
    estado: r.estado,
    notas: r.notas,
    fechaLimite: r.fecha_limite,
    completadoEl: r.completado_el,
    completadoPor: r.completado_por,
  };
}

/** El responsable "actual" del caso: el del primer paso en curso / pendiente. */
function responsable(pasos: PasoInstancia[]): string | null {
  const orden = [...pasos].sort(
    (a, b) => a.faseNumero - b.faseNumero || a.orden - b.orden,
  );
  return (
    orden.find((p) => p.estado === "en_curso")?.asignadoA ??
    orden.find((p) => p.estado === "pendiente")?.asignadoA ??
    null
  );
}

export async function listarCasos(): Promise<CasoResumen[]> {
  const supabase = await createClient();
  const { data: casos } = await supabase
    .from("proceso_casos")
    .select("*")
    .order("updated_at", { ascending: false });
  const lista = casos ?? [];
  if (lista.length === 0) return [];

  const { data: pasos } = await supabase
    .from("proceso_pasos")
    .select("*")
    .in(
      "caso_id",
      lista.map((c) => c.id),
    );
  const porCaso = new Map<string, PasoInstancia[]>();
  for (const r of (pasos ?? []) as (PasoRow & { caso_id: string })[]) {
    const arr = porCaso.get(r.caso_id) ?? [];
    arr.push(mapPaso(r));
    porCaso.set(r.caso_id, arr);
  }

  return lista.map((c) => {
    const ps = porCaso.get(c.id) ?? [];
    const av = calcularAvance(ps);
    return {
      id: c.id,
      tipo: c.tipo as TipoCaso,
      titulo: c.titulo,
      origen: c.origen,
      faseActual: c.fase_actual,
      estado: c.estado as EstadoCaso,
      actualizadoEl: c.updated_at,
      avance: av.pct,
      pasosTotales: av.total,
      pasosCompletados: av.completados,
      responsableActual: responsable(ps),
    } satisfies CasoResumen;
  });
}

export async function obtenerCaso(id: string): Promise<CasoDetalle | null> {
  const supabase = await createClient();
  const { data: caso } = await supabase
    .from("proceso_casos")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!caso) return null;

  const [{ data: pasosRows }, { data: decRows }] = await Promise.all([
    supabase
      .from("proceso_pasos")
      .select("*")
      .eq("caso_id", id)
      .order("fase_numero", { ascending: true })
      .order("orden", { ascending: true }),
    supabase
      .from("proceso_decisiones")
      .select("*")
      .eq("caso_id", id)
      .order("fase_numero", { ascending: true })
      .order("orden", { ascending: true }),
  ]);

  const pasos = (pasosRows ?? []).map((r) => mapPaso(r as PasoRow));
  const decisiones: DecisionInstancia[] = (decRows ?? []).map((d) => ({
    id: d.id,
    faseNumero: d.fase_numero,
    orden: d.orden,
    clave: d.clave,
    pregunta: d.pregunta,
    rol: d.rol,
    opciones: (d.opciones ?? []) as unknown as DecisionInstancia["opciones"],
    elegida: d.elegida,
  }));

  const av = calcularAvance(pasos);
  return {
    id: caso.id,
    tipo: caso.tipo as TipoCaso,
    titulo: caso.titulo,
    origen: caso.origen,
    proveedorRef: caso.proveedor_ref,
    faseActual: caso.fase_actual,
    estado: caso.estado as EstadoCaso,
    creadoEl: caso.created_at,
    actualizadoEl: caso.updated_at,
    avance: av.pct,
    pasosTotales: av.total,
    pasosCompletados: av.completados,
    responsableActual: responsable(pasos),
    pasos,
    decisiones,
  };
}
