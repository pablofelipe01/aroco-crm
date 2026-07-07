import { z } from "zod";

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

/** Un kg no negativo; acepta string del formulario y cae a 0 si viene vacío. */
const kg = z.coerce.number().min(0, "No puede ser negativo.").default(0);

/** Precio COP/kg opcional (>= 0) o null. */
const priceCop = z
  .union([z.coerce.number().min(0), z.literal("")])
  .transform((v) => (v === "" || v == null ? null : Number(v)))
  .nullable();

/** Fila manual de inventario por calidad (creada/editada desde el CRM). */
export const inventoryQualitySchema = z.object({
  procedencia: z.string().trim().min(1, "La procedencia es obligatoria."),
  entry_date: optionalText,
  oc: optionalText,
  por_llegar_kg: kg,
  en_bodega_kg: kg,
  purchase_price_cop_kg: priceCop,
  qty_b_kg: kg,
  qty_c_kg: kg,
  qty_premium_kg: kg,
  qty_organico_kg: kg,
  cadmio: optionalText,
});

export type InventoryQualityInput = z.input<typeof inventoryQualitySchema>;
