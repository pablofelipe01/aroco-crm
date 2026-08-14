import { z } from "zod";

const optText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();
// For NOT NULL columns with a DB default (dates): empty → undefined so the
// default applies, never null.
const optDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v == null || v === "" ? undefined : v));
const num = z.coerce.number();

/**
 * Los cuatro grados de la hoja maestra, con la columna en la que van los kilos.
 * Un despacho creado en el CRM solo escribía qty_kg, así que quedaba sin grado
 * para siempre y desaparecía del desglose por clasificación.
 */
export const CLASIFICACION_COLUMNA = {
  Premium: "qty_premium_kg",
  Corriente: "qty_corriente_kg",
  "Corriente C": "qty_corriente_c_kg",
  Orgánico: "qty_organico_kg",
} as const;

export const CLASIFICACIONES = Object.keys(CLASIFICACION_COLUMNA) as [
  keyof typeof CLASIFICACION_COLUMNA,
  ...(keyof typeof CLASIFICACION_COLUMNA)[],
];

export const lotSchema = z.object({
  code: z.string().trim().min(1, "El código es obligatorio."),
  entry_date: optText,
  remision: optText,
  origin: optText,
  quality: optText,
  qty_in_kg: num.default(0),
  qty_out_kg: num.default(0),
  samples_pasilla_merma_kg: num.default(0),
  purchase_price_cop_kg: z.coerce.number().nullable().optional(),
  notes: optText,
});

export const movementSchema = z.object({
  lot_id: z.string().uuid(),
  date: optDate,
  kind: z.enum(["entrada", "salida"]),
  remision: optText,
  company: optText,
  qty_kg: num,
  notes: optText,
});

export const dispatchSchema = z.object({
  remision_salida: optText,
  dispatch_date: optDate,
  destination: optText,
  oc: optText,
  remision_entrada: optText,
  lot_id: z.string().uuid().nullable().optional(),
  lead_id: z.string().uuid().nullable().optional(),
  origin: optText,
  qty_kg: num,
  clasificacion: z.enum(CLASIFICACIONES).optional().or(z.literal("")),
  purchase_price_cop_kg: z.coerce.number().nullable().optional(),
});

export const priceSchema = z.object({
  date: z.string().trim().min(1, "La fecha es obligatoria."),
  entries: z.array(
    z.object({
      company: z.string().trim().min(1),
      price_cop_kg: z.coerce.number(),
    }),
  ),
});
