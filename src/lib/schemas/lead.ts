import { z } from "zod";
import { LEAD_STAGES } from "@/lib/status";

const MARKETS = ["Nacional", "Internacional"] as const;
const LEAD_TYPES = [
  "Comprador",
  "Proveedor potencial",
  "Comprador/Broker",
] as const;

/** De qué lado está el lead: a quién le compramos cacao o a quién se lo vendemos. */
const NEGOCIOS = ["Venta", "Compra"] as const;
type Negocio = (typeof NEGOCIOS)[number];
const CADMIO = ["Bajo", "Alto"] as const;

/** Tipos que cuadran con cada negocio (la base lo exige: 0108). */
const TIPOS_POR_NEGOCIO: Record<Negocio, readonly (typeof LEAD_TYPES)[number][]> = {
  Venta: ["Comprador", "Comprador/Broker"],
  Compra: ["Proveedor potencial"],
};

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

/** Correo opcional: vacío → null; si viene, debe ser un correo válido. */
const optionalEmail = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v.toLowerCase()))
  .nullable()
  .refine(
    (v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    "Correo inválido.",
  );

/**
 * Teléfono opcional. Se conservan los dígitos y el `+` inicial: el equipo
 * maneja celulares colombianos y también contactos del exterior, así que no se
 * impone un formato — solo se limpia la puntuación para que quede consultable.
 */
const optionalPhone = z
  .string()
  .trim()
  .transform((v) => {
    const cleaned = v.replace(/[^\d+]/g, "");
    return cleaned === "" || cleaned === "+" ? null : cleaned;
  })
  .nullable()
  .refine(
    (v) => v === null || v.replace(/\D/g, "").length >= 7,
    "El teléfono es muy corto.",
  );

export const leadSchema = z
  .object({
    negocio: z.enum(NEGOCIOS),
    company: z.string().trim().min(1, "La empresa es obligatoria."),
    contact_name: optionalText,
    contact_email: optionalEmail,
    contact_phone: optionalPhone,
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
    region: optionalText.optional(),
    cadmio: z
      .union([z.enum(CADMIO), z.literal("")])
      .transform((v) => (v === "" ? null : v))
      .nullable()
      .optional(),
  })
  .refine((l) => !l.type || TIPOS_POR_NEGOCIO[l.negocio].includes(l.type), {
    message:
      "El tipo no corresponde al negocio: un proveedor es una compra y un comprador, una venta.",
    path: ["type"],
  })
  // Región y cadmio son de compra; en una venta no se guardan (la base también los limpia).
  .transform((l) =>
    l.negocio === "Venta" ? { ...l, region: null, cadmio: null } : l,
  );

export type LeadInput = z.input<typeof leadSchema>;

export const activitySchema = z.object({
  lead_id: z.string().uuid(),
  type: z.enum(ACTIVITY_TYPES),
  description: z.string().trim().min(1, "Describe la actividad."),
});

export {
  MARKETS,
  LEAD_TYPES,
  ACTIVITY_TYPES,
  NEGOCIOS,
  CADMIO,
  TIPOS_POR_NEGOCIO,
};
export type { Negocio };
