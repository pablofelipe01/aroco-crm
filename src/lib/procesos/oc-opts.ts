/** Opciones y etiquetas de las Órdenes de Compra (Fase 2). */
import type { Database } from "@/lib/types/database";

export type OcEstado = Database["public"]["Enums"]["oc_estado"];
export type OcCaso = Database["public"]["Enums"]["oc_caso"];

export const OC_ESTADO_TONE: Record<OcEstado, "neutral" | "info" | "success" | "warn" | "danger"> = {
  Borrador: "neutral",
  "En revisión": "warn",
  Aprobada: "success",
  Rechazada: "danger",
  Emitida: "info",
};

export const OC_CASOS: { id: OcCaso; etiqueta: string; descripcion: string }[] = [
  {
    id: "roc",
    etiqueta: "Programa ROC o Finca",
    descripcion: "Aprobación automática en el aplicativo (sin firmas manuales).",
  },
  {
    id: "otros_sin",
    etiqueta: "Otros proveedores — sin novedades",
    descripcion: "Requiere revisión y aprobación de Gerencia.",
  },
  {
    id: "otros_con",
    etiqueta: "Otros proveedores — con novedades",
    descripcion: "Requiere revisión conjunta y ajuste antes de aprobar.",
  },
];

export const OC_CASO_LABEL: Record<OcCaso, string> = {
  roc: "Programa ROC / Finca",
  otros_sin: "Otros — sin novedades",
  otros_con: "Otros — con novedades",
};

/** Sugiere el caso a partir del programa del proveedor. */
export function sugerirCaso(programa: string | null | undefined): OcCaso {
  const p = (programa ?? "").toLowerCase();
  if (p.includes("roc") || p.includes("finca")) return "roc";
  return "otros_sin";
}

export const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});
