import type { BadgeTone } from "@/components/ui/badge";

/** Lead pipeline stages (7) with their chip tone and pipeline order. */
export const LEAD_STAGES = [
  "Nuevo",
  "Cotización",
  "Negociación",
  "Enviado",
  "En espera",
  "Cerrado",
  "En pausa",
  "Descartado",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

/**
 * Probability weight per stage — the 6-phase sales scale defined in the
 * 2026-06-30 CRM review: 10% (Nuevo) → 30 → 50 → 70 → 80 (En espera) → 100%
 * (Cerrado); 0% if "Descartado". Multiply a lead's potential value by its
 * stage weight to get its expected (weighted) value.
 *
 * «En pausa» (revisión del 2026-10-09) también pesa 0: el prospecto no está
 * activo ni descartado, y no debe sumar al % de cierre.
 */
export const LEAD_STAGE_WEIGHT: Record<LeadStage, number> = {
  Nuevo: 0.1,
  Cotización: 0.3,
  Negociación: 0.5,
  Enviado: 0.7,
  "En espera": 0.8,
  Cerrado: 1,
  "En pausa": 0,
  Descartado: 0,
};

/** Etapas que no cuentan en el pipeline: ni en totales ni en el % de cierre. */
export const LEAD_STAGES_FUERA: readonly LeadStage[] = ["En pausa", "Descartado"];

export function cuentaEnPipeline(stage: string): boolean {
  return !(LEAD_STAGES_FUERA as readonly string[]).includes(stage);
}

export const LEAD_STAGE_TONE: Record<LeadStage, BadgeTone> = {
  Nuevo: "info",
  Cotización: "accent",
  Negociación: "warn",
  Enviado: "info",
  "En espera": "neutral",
  Cerrado: "success",
  "En pausa": "neutral",
  Descartado: "danger",
};

/** Task statuses with tone + Spanish label. */
export const TASK_STATUSES = ["pending", "progress", "done", "blocked"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_STATUS_META: Record<
  TaskStatus,
  { label: string; tone: BadgeTone }
> = {
  pending: { label: "Pendiente", tone: "neutral" },
  progress: { label: "En progreso", tone: "info" },
  done: { label: "Completado", tone: "success" },
  blocked: { label: "Bloqueado", tone: "danger" },
};

/** Quote statuses. */
export const QUOTE_STATUS_META: Record<
  string,
  { label: string; tone: BadgeTone }
> = {
  borrador: { label: "Borrador", tone: "neutral" },
  enviada: { label: "Enviada", tone: "info" },
  aceptada: { label: "Aceptada", tone: "success" },
  rechazada: { label: "Rechazada", tone: "danger" },
};

// ── Etiquetas traducidas ────────────────────────────────────────────────────
//
//  Los estados se guardan en español en la base y ahí se quedan: son valores de
//  enum, viven en políticas RLS y en todo lo ya escrito. Lo que cambia es cómo
//  se muestran. Estas funciones toman el diccionario y devuelven el rótulo; el
//  `tone` sigue saliendo de los mapas de arriba, que no dependen del idioma.
//
//  Indexar el diccionario con el tipo del estado hace que TypeScript exija que
//  estén todas las etapas: si alguien agrega una octava a `LEAD_STAGES` y no la
//  traduce, esto no compila.

import type { Diccionario } from "@/lib/i18n/es";

export function etiquetaEtapa(etapa: LeadStage, t: Diccionario): string {
  return t.etapas[etapa];
}

export function etiquetaTarea(estado: string, t: Diccionario): string {
  return t.tareaEstados[estado as TaskStatus] ?? estado;
}

export function etiquetaCotizacion(estado: string, t: Diccionario): string {
  return t.cotizacionEstados[estado as keyof Diccionario["cotizacionEstados"]] ?? estado;
}
