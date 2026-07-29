import { z } from "zod";
import { TASK_STATUSES } from "@/lib/status";

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

export const taskSchema = z.object({
  name: z.string().trim().min(1, "El nombre es obligatorio."),
  description: optionalText,
  /**
   * Responsables de la tarea. `tasks.person_id` / `person_name` son derivados
   * (el primero de esta lista) y los mantiene un trigger — no se escriben aquí.
   */
  assignee_ids: z.array(z.string().uuid()).default([]),
  /** Nombre libre cuando el responsable no está en el catálogo del equipo. */
  person_name: optionalText,
  source: optionalText,
  start_date: optionalText,
  due_date: optionalText,
  status: z.enum(TASK_STATUSES),
  notes: optionalText,
});

export type TaskInput = z.input<typeof taskSchema>;
