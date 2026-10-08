/**
 * Tablero de uso del CRM: lo que devuelve `uso_crm()` (0097) y las cuentas
 * que se hacen encima. Módulo puro — sin React ni Supabase — para poder
 * probarlo.
 *
 * Las semanas van de lunes a domingo y las fechas llegan como días de Bogotá
 * («2026-09-28»). Toda la aritmética de fechas se hace sobre esos días en UTC,
 * que no tiene horario de verano: así «lunes menos siete días» es siempre el
 * lunes anterior, en cualquier navegador.
 */
import { z } from "zod";

const n = z.coerce.number().catch(0);

const semanaSchema = z.object({
  semana: z.string(),
  minutos: n,
  dias: n,
  movidas: n,
  cerradas: n,
  notas: n,
  creadas: n,
  leads: n,
  gestiones: n,
});

const personaSchema = z.object({
  id: z.string(),
  nombre: z.string().nullable().transform((v) => v ?? "—"),
  area: z.string().nullable(),
  rol: z.string().nullable(),
  ultimo_login: z.string().nullable(),
  ultimo_uso: z.string().nullable(),
  abiertas: n,
  vencidas: n,
  sin_fecha: n,
  cerradas_30d: n,
  /** Días con uso o con una acción a su nombre, últimos 30 (0102). */
  dias_30d: n,
  tiene_tareas: z.boolean(),
  semanas: z.array(semanaSchema),
  modulos: z.array(z.object({ modulo: z.string(), minutos: n })),
});

export const usoCrmSchema = z.object({
  desde: z.string(),
  hoy: z.string(),
  medicion_desde: z.string().nullable(),
  eventos_desde: z.string().nullable(),
  personas: z.array(personaSchema),
});

export type SemanaUso = z.infer<typeof semanaSchema>;
export type PersonaUso = z.infer<typeof personaSchema>;
export type UsoCrm = z.infer<typeof usoCrmSchema>;

export type EstadoUso = "activo" | "poco" | "inactivo";

export type FilaUso = {
  persona: PersonaUso;
  /** Una entrada por semana del periodo, en orden, con ceros donde no hubo nada. */
  serie: SemanaUso[];
  actual: SemanaUso;
  /** Lo que la persona le metió al CRM esta semana (ver `acciones`). */
  accionesSemana: number;
  /** Leads y gestiones comerciales de las últimas cuatro semanas. */
  comercial4: number;
  /** Lo más reciente que se sabe: un minuto de uso o, si no hay, el login. */
  ultimo: { cuando: string | null; soloLogin: boolean };
  estado: EstadoUso;
};

const DIA_MS = 86_400_000;

function aDia(iso: string): number {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function aIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Lunes de la semana del día dado. */
export function lunesDe(dia: string): string {
  const ms = aDia(dia);
  const dow = (new Date(ms).getUTCDay() + 6) % 7; // lunes = 0
  return aIso(ms - dow * DIA_MS);
}

/** Los lunes desde `desde` hasta la semana de `hoy`, ambos incluidos. */
export function semanasDelPeriodo(desde: string, hoy: string): string[] {
  const out: string[] = [];
  const fin = aDia(lunesDe(hoy));
  for (let ms = aDia(lunesDe(desde)); ms <= fin; ms += 7 * DIA_MS) out.push(aIso(ms));
  return out;
}

export function semanaVacia(semana: string): SemanaUso {
  return {
    semana,
    minutos: 0,
    dias: 0,
    movidas: 0,
    cerradas: 0,
    notas: 0,
    creadas: 0,
    leads: 0,
    gestiones: 0,
  };
}

/**
 * Lo que alguien le metió al CRM en una semana. «Cerradas» no se suma: una
 * tarea cerrada ya cuenta como movida y sumarla la contaría dos veces.
 */
export function acciones(s: SemanaUso): number {
  return s.movidas + s.notas + s.creadas + s.leads + s.gestiones;
}

export function filaDeUso(p: PersonaUso, lunes: string[]): FilaUso {
  const porSemana = new Map(p.semanas.map((s) => [s.semana.slice(0, 10), s]));
  const serie = lunes.map((l) => porSemana.get(l) ?? semanaVacia(l));
  const actual = serie.at(-1) ?? semanaVacia(lunes.at(-1) ?? "");
  const ultimas4 = serie.slice(-4);
  const previa = serie.at(-2);

  const loginEstaSemana =
    p.ultimo_login != null && aDia(p.ultimo_login) >= aDia(actual.semana);
  const usoEn = (s: SemanaUso | undefined) =>
    s != null && (s.minutos > 0 || acciones(s) > 0);

  const estado: EstadoUso =
    usoEn(actual) || loginEstaSemana ? "activo" : usoEn(previa) ? "poco" : "inactivo";

  return {
    persona: p,
    serie,
    actual,
    accionesSemana: acciones(actual),
    comercial4: ultimas4.reduce((a, s) => a + s.leads + s.gestiones, 0),
    ultimo: p.ultimo_uso
      ? { cuando: p.ultimo_uso, soloLogin: false }
      : { cuando: p.ultimo_login, soloLogin: p.ultimo_login != null },
    estado,
  };
}

const PESO: Record<EstadoUso, number> = { activo: 0, poco: 1, inactivo: 2 };

/**
 * Primero quien está activo, y dentro de cada grupo quien entra más días y
 * cierra más tareas. Las horas ya no ordenan: quien trabaja por la
 * integración con Claude no deja minutos (reunión del 2026-10-08).
 */
export function ordenarFilas(filas: FilaUso[]): FilaUso[] {
  return [...filas].sort(
    (a, b) =>
      PESO[a.estado] - PESO[b.estado] ||
      b.actual.dias - a.actual.dias ||
      b.persona.dias_30d - a.persona.dias_30d ||
      b.persona.cerradas_30d - a.persona.cerradas_30d ||
      b.accionesSemana - a.accionesSemana ||
      (b.ultimo.cuando ?? "").localeCompare(a.ultimo.cuando ?? "") ||
      a.persona.nombre.localeCompare(b.persona.nombre, "es"),
  );
}

/** Minutos por módulo sumando a todo el equipo, de mayor a menor. */
export function modulosDelEquipo(personas: PersonaUso[]): { modulo: string; minutos: number }[] {
  const tot = new Map<string, number>();
  for (const p of personas) {
    for (const m of p.modulos) tot.set(m.modulo, (tot.get(m.modulo) ?? 0) + m.minutos);
  }
  return [...tot.entries()]
    .map(([modulo, minutos]) => ({ modulo, minutos }))
    .sort((a, b) => b.minutos - a.minutos);
}
