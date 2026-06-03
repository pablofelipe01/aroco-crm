import type { BadgeTone } from "@/components/ui/badge";

/** Lead pipeline stages (7) with their chip tone and pipeline order. */
export const LEAD_STAGES = [
  "Nuevo",
  "Cotización",
  "Negociación",
  "Enviado",
  "En espera",
  "Cerrado",
  "Descartado",
] as const;

export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_TONE: Record<LeadStage, BadgeTone> = {
  Nuevo: "info",
  Cotización: "accent",
  Negociación: "warn",
  Enviado: "info",
  "En espera": "neutral",
  Cerrado: "success",
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
