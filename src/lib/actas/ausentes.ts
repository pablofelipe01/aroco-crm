/**
 * Quien no estuvo en la reunión no recibe tareas de esa acta.
 *
 * Si el acta le deja un compromiso a alguien que no asistió, la tarea pasa a
 * su jefe de sección (`team_members.manager_id`) y en la descripción queda
 * para quién era, para que el jefe se la mencione. Si el jefe directo tampoco
 * estuvo, se sube por el organigrama hasta el primer jefe que sí asistió; si
 * nadie de la rama asistió, se queda con el jefe directo, que es el dueño de
 * la sección.
 *
 * Dos salvaguardas, porque un emparejamiento fallido haría pasar a un
 * asistente por ausente y le quitaría sus tareas:
 *
 *  - si el acta no trae asistentes, o ninguno se pudo emparejar con el
 *    equipo, la regla no se aplica (no hay con qué saber quién faltó);
 *  - quien no tiene jefe (la raíz del organigrama) conserva su tarea.
 */

import { emparejarNombre, normNombre } from "@/lib/actas/nombres";

export interface Miembro {
  id: string;
  name: string;
  profile_id: string | null;
  manager_id: string | null;
}

export interface Asistente {
  name: string | null;
  profile_id: string | null;
}

/** Ids de `team_members` que asistieron, emparejados por cuenta o por nombre. */
export function miembrosPresentes(asistentes: Asistente[], miembros: Miembro[]): Set<string> {
  const candidatos = miembros.map((m) => ({ profileId: m.id, nombre: m.name }));
  const presentes = new Set<string>();
  for (const a of asistentes) {
    const porCuenta = a.profile_id
      ? miembros.find((m) => m.profile_id === a.profile_id)
      : undefined;
    if (porCuenta) {
      presentes.add(porCuenta.id);
      continue;
    }
    if (!a.name) continue;
    const id = emparejarNombre(a.name, candidatos);
    if (id) {
      presentes.add(id);
      continue;
    }
    // «Heiner Sierra Bedoya» frente a «Heiner Sierra»: el mismo criterio de
    // contención con que se emparejan los responsables, exigiendo dos palabras
    // para que un nombre de pila suelto no se lleve a nadie.
    const n = normNombre(a.name);
    if (n.split(" ").length < 2) continue;
    const contenidos = miembros.filter((m) => {
      const x = normNombre(m.name);
      return x.split(" ").length >= 2 && (n.includes(x) || x.includes(n));
    });
    if (contenidos.length === 1) presentes.add(contenidos[0].id);
  }
  return presentes;
}

export interface Reasignacion {
  /** Responsables definitivos (ids de `team_members`), sin repetidos. */
  assignees: string[];
  /** Ausentes cuya tarea pasó a su jefe: nombre del ausente → nombre del jefe. */
  remitidas: { ausente: string; jefe: string }[];
}

/** Jefe que recibe la tarea de `id`, o null si no tiene jefe. */
function jefeQueRecibe(id: string, porId: Map<string, Miembro>, presentes: Set<string>) {
  const directo = porId.get(id)?.manager_id ?? null;
  if (!directo) return null;
  let cursor: string | null = directo;
  const vistos = new Set<string>();
  while (cursor && !vistos.has(cursor)) {
    if (presentes.has(cursor)) return cursor;
    vistos.add(cursor);
    cursor = porId.get(cursor)?.manager_id ?? null;
  }
  return directo;
}

export function reasignarAusentes(
  assignees: string[],
  presentes: Set<string>,
  miembros: Miembro[],
): Reasignacion {
  if (presentes.size === 0) return { assignees: [...new Set(assignees)], remitidas: [] };
  const porId = new Map(miembros.map((m) => [m.id, m]));
  const finales: string[] = [];
  const remitidas: Reasignacion["remitidas"] = [];
  const poner = (id: string) => {
    if (!finales.includes(id)) finales.push(id);
  };
  for (const id of assignees) {
    if (presentes.has(id)) {
      poner(id);
      continue;
    }
    const jefe = jefeQueRecibe(id, porId, presentes);
    if (!jefe) {
      poner(id);
      continue;
    }
    poner(jefe);
    remitidas.push({
      ausente: porId.get(id)?.name ?? id,
      jefe: porId.get(jefe)?.name ?? jefe,
    });
  }
  return { assignees: finales, remitidas };
}

/** Nota que se antepone a la descripción para que el jefe sepa a quién mencionarla. */
export function notaRemitida(remitidas: Reasignacion["remitidas"]): string | null {
  if (remitidas.length === 0) return null;
  const nombres = [...new Set(remitidas.map((r) => r.ausente))];
  const lista =
    nombres.length === 1
      ? nombres[0]
      : `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
  const verbo = nombres.length === 1 ? "no estuvo" : "no estuvieron";
  return `Para ${lista}, que ${verbo} en la reunión: mencionársela.`;
}

export function conNota(description: string | null, remitidas: Reasignacion["remitidas"]) {
  const nota = notaRemitida(remitidas);
  if (!nota) return description;
  return description ? `${nota}\n\n${description}` : nota;
}
