import { z } from "zod";
import { DEPARTMENTS } from "@/lib/departments";

export const PREGUNTA_ESTADOS = ["Pendiente", "Respondida", "Descartada"] as const;
export const PREGUNTA_PRIORIDADES = ["Alta", "Media", "Baja"] as const;

export type PreguntaEstado = (typeof PREGUNTA_ESTADOS)[number];
export type PreguntaPrioridad = (typeof PREGUNTA_PRIORIDADES)[number];

const opt = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

export const preguntaSchema = z.object({
  pregunta: z.string().trim().min(1, "La pregunta es obligatoria."),
  contexto: opt,
  bloquea: opt,
  para_quien: opt,
  area: z.enum(DEPARTMENTS).nullable().optional().or(z.literal("").transform(() => null)),
  prioridad: z.enum(PREGUNTA_PRIORIDADES).default("Media"),
});

export const respuestaSchema = z.object({
  id: z.string().uuid(),
  respuesta: z.string().trim().min(1, "Escribe la respuesta."),
});
