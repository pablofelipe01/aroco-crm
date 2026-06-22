import type { BadgeTone } from "@/components/ui/badge";
import type { EstadoCaso, EstadoPaso } from "./types";

export const ESTADO_PASO_META: Record<
  EstadoPaso,
  { label: string; tone: BadgeTone; bar: string }
> = {
  pendiente: { label: "Pendiente", tone: "neutral", bar: "bg-fg-subtle/40" },
  en_curso: { label: "En curso", tone: "warn", bar: "bg-warn" },
  completado: { label: "Completado", tone: "success", bar: "bg-success" },
  bloqueado: { label: "Bloqueado", tone: "danger", bar: "bg-danger" },
  no_aplica: { label: "No aplica", tone: "neutral", bar: "bg-fg-subtle/20" },
};

export const ESTADO_PASO_ORDEN: EstadoPaso[] = [
  "pendiente",
  "en_curso",
  "completado",
  "bloqueado",
  "no_aplica",
];

export const ESTADO_CASO_META: Record<EstadoCaso, { label: string; tone: BadgeTone }> = {
  en_curso: { label: "En curso", tone: "info" },
  bloqueado: { label: "Bloqueado", tone: "danger" },
  completado: { label: "Completado", tone: "success" },
};

export const TIPO_CASO_LABEL: Record<string, string> = {
  proveedor: "Proveedor",
  orden_compra: "Orden de Compra",
};
