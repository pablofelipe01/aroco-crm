import { z } from "zod";
import { LEAD_STAGES } from "@/lib/status";

const MARKETS = ["Nacional", "Internacional"] as const;
const LEAD_TYPES = [
  "Comprador",
  "Proveedor potencial",
  "Comprador/Broker",
] as const;
const ACTIVITY_TYPES = [
  "Nota",
  "Llamada",
  "Correo",
  "WhatsApp",
  "Reunión",
  "Cambio de estado",
] as const;

/** Empty string → null, otherwise trimmed string. */
const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

/** Form value (string/number/empty) → positive number or null. */
const optionalAmount = z
  .union([z.string(), z.number(), z.null()])
  .transform((v) => {
    if (v === null) return null;
    const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.-]/g, ""));
    return Number.isFinite(n) && n > 0 ? n : null;
  })
  .nullable()
  .optional();

export const leadSchema = z.object({
  company: z.string().trim().min(1, "La empresa es obligatoria."),
  contact_name: optionalText,
  country: optionalText,
  city: optionalText,
  market: z.enum(MARKETS).nullable().optional(),
  type: z.enum(LEAD_TYPES).nullable().optional(),
  status: z.enum(LEAD_STAGES),
  product_interest: optionalText,
  volume: optionalText,
  toneladas: optionalAmount,
  potential_value_cop: optionalAmount,
  next_action: optionalText,
  next_action_date: optionalText,
  commercial_owner: z.string().uuid().nullable().optional(),
  notes: optionalText,
});

export type LeadInput = z.input<typeof leadSchema>;

export const activitySchema = z.object({
  lead_id: z.string().uuid(),
  type: z.enum(ACTIVITY_TYPES),
  description: z.string().trim().min(1, "Describe la actividad."),
});

export { MARKETS, LEAD_TYPES, ACTIVITY_TYPES };
