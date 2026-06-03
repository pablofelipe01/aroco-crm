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
  person_id: z.string().uuid().nullable().optional(),
  person_name: optionalText,
  source: optionalText,
  start_date: optionalText,
  due_date: optionalText,
  status: z.enum(TASK_STATUSES),
  notes: optionalText,
});

export type TaskInput = z.input<typeof taskSchema>;
