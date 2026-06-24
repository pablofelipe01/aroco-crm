/** Opciones de la Recepción en Bodega (Fase 3). */
import type { Database } from "@/lib/types/database";

export type RecepcionEstado = Database["public"]["Enums"]["recepcion_estado"];
export type RecepcionEnvio = Database["public"]["Enums"]["recepcion_envio"];

export const RECEPCION_ESTADO_TONE: Record<RecepcionEstado, "warn" | "success"> = {
  "En proceso": "warn",
  Cerrada: "success",
};

export const TIPOS_ENVIO: RecepcionEnvio[] = ["Cauca", "Finca", "Otros"];

export const FOTO_CATEGORIAS = [
  { id: "bultos", label: "Bultos" },
  { id: "camion", label: "Camión" },
  { id: "corte", label: "Corte (calidad)" },
  { id: "remision", label: "Remisiones" },
] as const;

export type FotoCategoria = (typeof FOTO_CATEGORIAS)[number]["id"];
