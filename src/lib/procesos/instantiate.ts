/**
 * Instanciación de un caso a partir de la plantilla y helpers de avance.
 * No toca la base de datos: produce filas "semilla" que la capa de datos
 * resuelve (persona por defecto → id) e inserta.
 */
import type {
  DecisionInstancia,
  EstadoPaso,
  PasoInstancia,
  ProcesoPlantilla,
  TipoCaso,
} from "./types";
import { defaultRolPersona } from "./template";

export interface PasoSeed {
  fase_numero: number;
  fase_nombre: string;
  orden: number;
  numero: string;
  titulo: string;
  rol: string;
  es_automatico: boolean;
  es_rama: boolean;
  estado: EstadoPaso;
  /** Nombre de la persona por defecto (a resolver → id) o null. */
  personaNombre: string | null;
}

export interface DecisionSeed {
  fase_numero: number;
  orden: number;
  clave: string;
  pregunta: string;
  rol: string;
  opciones: { id: string; etiqueta: string; activaPasos: string[] }[];
}

/** Clona, de la plantilla, las fases que aplican al tipo de caso. */
export function instanciarCaso(
  plantilla: ProcesoPlantilla,
  tipo: TipoCaso,
): { pasos: PasoSeed[]; decisiones: DecisionSeed[] } {
  const fasesAplican = plantilla.aplica[tipo];
  const pasos: PasoSeed[] = [];
  const decisiones: DecisionSeed[] = [];

  for (const fase of plantilla.fases) {
    if (!fasesAplican.includes(fase.numero)) continue;

    fase.pasos.forEach((p, i) => {
      const persona = defaultRolPersona(p.rol);
      pasos.push({
        fase_numero: fase.numero,
        fase_nombre: fase.nombre,
        orden: i,
        numero: p.numero,
        titulo: p.titulo,
        rol: p.rol,
        es_automatico: !!p.esAutomatico,
        es_rama: !!p.esRama,
        // Las ramas inician en "no_aplica" hasta que una decisión las active.
        estado: p.esRama ? "no_aplica" : "pendiente",
        personaNombre: persona?.nombre ?? null,
      });
    });

    fase.decisiones.forEach((d, i) => {
      decisiones.push({
        fase_numero: fase.numero,
        orden: i,
        clave: d.clave,
        pregunta: d.pregunta,
        rol: d.rol,
        opciones: d.opciones,
      });
    });
  }

  return { pasos, decisiones };
}

// ── Avance ──────────────────────────────────────────────────────────────────

/** Avance considerando solo pasos aplicables (excluye `no_aplica`). */
export function calcularAvance(pasos: { estado: EstadoPaso }[]): {
  total: number;
  completados: number;
  pct: number;
} {
  const aplicables = pasos.filter((p) => p.estado !== "no_aplica");
  const completados = aplicables.filter((p) => p.estado === "completado").length;
  const total = aplicables.length;
  const pct = total > 0 ? Math.round((completados / total) * 100) : 0;
  return { total, completados, pct };
}

/** El responsable "actual": el del primer paso en curso, o el primer pendiente. */
export function responsableActual(pasos: PasoInstancia[]): string | null {
  const enCurso = pasos.find((p) => p.estado === "en_curso");
  if (enCurso) return enCurso.asignadoA;
  const pendiente = pasos.find((p) => p.estado === "pendiente");
  return pendiente?.asignadoA ?? null;
}

/**
 * Recalcula los estados de los pasos de rama de una decisión al elegir una
 * opción: los pasos de la opción elegida pasan a `pendiente` (si estaban
 * `no_aplica`); los de las otras opciones, a `no_aplica`. No pisa pasos ya
 * trabajados (en_curso/completado/bloqueado) salvo que dejen de aplicar.
 */
export function recalcularRamas(
  pasos: PasoInstancia[],
  opciones: DecisionInstancia["opciones"],
  elegida: string,
): { numero: string; estado: EstadoPaso }[] {
  const cambios: { numero: string; estado: EstadoPaso }[] = [];
  const activos = new Set(
    opciones.find((o) => o.id === elegida)?.activaPasos ?? [],
  );
  const todos = new Set(opciones.flatMap((o) => o.activaPasos));

  for (const numero of todos) {
    const paso = pasos.find((p) => p.numero === numero);
    if (!paso) continue;
    if (activos.has(numero)) {
      if (paso.estado === "no_aplica") cambios.push({ numero, estado: "pendiente" });
    } else {
      if (paso.estado !== "no_aplica") cambios.push({ numero, estado: "no_aplica" });
    }
  }
  return cambios;
}
