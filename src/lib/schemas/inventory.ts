import { z } from "zod";

// Los esquemas de ingresos, salidas y ajustes viven en lib/inventory/carga.ts.

export const priceSchema = z.object({
  date: z.string().trim().min(1, "La fecha es obligatoria."),
  entries: z.array(
    z.object({
      company: z.string().trim().min(1),
      price_cop_kg: z.coerce.number(),
    }),
  ),
});
