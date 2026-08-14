import { z } from "zod";

export const COMPRA_ESTADOS = [
  "Borrador",
  "Pendiente",
  "Aprobada",
  "Rechazada",
] as const;

export const COMPRA_CATEGORIAS = [
  "Oficina",
  "Finca",
  "Plantación",
  "Bodega",
  "Transporte",
  "Mantenimiento",
  "Tecnología",
  "Otro",
] as const;

export const MONEDAS = ["COP", "USD"] as const;

export type CompraEstado = (typeof COMPRA_ESTADOS)[number];
export type CompraCategoria = (typeof COMPRA_CATEGORIAS)[number];

const optionalText = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

export const solicitudSchema = z.object({
  titulo: z.string().trim().min(1, "Di qué se necesita."),
  descripcion: optionalText,
  categoria: z.enum(COMPRA_CATEGORIAS),
  area: optionalText,
  justificacion: optionalText,
});

/**
 * El monto llega como texto del formulario y puede venir con separadores
 * ("1.250.000"), así que se limpia antes de convertir.
 */
const montoSchema = z
  .union([z.string(), z.number()])
  .transform((v) => {
    if (typeof v === "number") return v;
    const limpio = v.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
    return Number(limpio);
  })
  .refine((n) => Number.isFinite(n) && n > 0, "El monto debe ser mayor que cero.");

export const cotizacionSchema = z.object({
  solicitud_id: z.string().uuid(),
  proveedor: z.string().trim().min(1, "Falta el proveedor."),
  nit: optionalText,
  descripcion: optionalText,
  monto: montoSchema,
  moneda: z.enum(MONEDAS).default("COP"),
  incluye_iva: z.boolean().default(true),
  valida_hasta: optionalText,
  tiempo_entrega: optionalText,
  notas: optionalText,
});

export type SolicitudInput = z.input<typeof solicitudSchema>;
export type CotizacionInput = z.input<typeof cotizacionSchema>;
