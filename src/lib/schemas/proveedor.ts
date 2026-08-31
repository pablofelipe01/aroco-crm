import { z } from "zod";
import { BANCOS, DEPARTAMENTOS, TIPOS_CUENTA } from "@/lib/colombia";
import { COMPRA_CATEGORIAS } from "@/lib/schemas/compra";

export const PERSONA_TIPOS = ["Natural", "Jurídica"] as const;
export const DOCUMENTO_TIPOS = ["CC", "CE", "NIT", "PA"] as const;
export const PROVEEDOR_ESTADOS = ["Pendiente", "Activo", "Rechazado", "Inactivo"] as const;
export const CUENTA_COBRO_ESTADOS = ["Radicada", "Aprobada", "Rechazada", "Pagada"] as const;
export const DOCUMENTO_PROVEEDOR_TIPOS = [
  "RUT",
  "Documento de identidad",
  "Certificado bancario",
  "Cámara de comercio",
  "Otro",
] as const;

export type ProveedorEstado = (typeof PROVEEDOR_ESTADOS)[number];
export type CuentaCobroEstado = (typeof CUENTA_COBRO_ESTADOS)[number];
export type DocumentoProveedorTipo = (typeof DOCUMENTO_PROVEEDOR_TIPOS)[number];

const opt = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

/**
 * Registro del proveedor.
 *
 * El nombre se valida contra el tipo de persona: natural necesita nombres y
 * apellidos, jurídica necesita razón social. La base lo comprueba también, con
 * un trigger — aquí es para dar un mensaje entendible antes de llegar allá.
 */
export const proveedorSchema = z
  .object({
    tipo_persona: z.enum(PERSONA_TIPOS),
    tipo_documento: z.enum(DOCUMENTO_TIPOS),
    numero_documento: z
      .string()
      .trim()
      .min(5, "El documento es muy corto.")
      .max(20, "El documento es muy largo.")
      // Los NIT vienen con puntos y guion de verificación; se guardan limpios
      // para que «900.123.456-7» y «9001234567» no entren como dos proveedores.
      .transform((v) => v.replace(/[.\s-]/g, "")),
    nombres: opt,
    apellidos: opt,
    razon_social: opt,

    email: z.string().trim().toLowerCase().email("Correo inválido."),
    telefono: z.string().trim().min(7, "Teléfono muy corto.").max(20),
    direccion: opt,
    departamento: z.enum(DEPARTAMENTOS).nullable().optional(),
    municipio: opt,

    categorias: z.array(z.enum(COMPRA_CATEGORIAS)).default([]),
    descripcion: z
      .string()
      .trim()
      .min(10, "Cuenta en una frase qué provees.")
      .max(500),

    banco: z.enum(BANCOS).nullable().optional(),
    tipo_cuenta: z.enum(TIPOS_CUENTA).nullable().optional(),
    numero_cuenta: opt,
    titular_cuenta: opt,
    documento_titular: opt,
  })
  .refine(
    (d) =>
      d.tipo_persona === "Natural"
        ? Boolean(d.nombres?.trim() && d.apellidos?.trim())
        : Boolean(d.razon_social?.trim()),
    {
      message:
        "Persona natural: nombres y apellidos. Persona jurídica: razón social.",
      path: ["razon_social"],
    },
  );

/** El alta incluye la contraseña; el perfil se edita sin ella. */
export const registroSchema = z.object({
  password: z
    .string()
    .min(8, "La contraseña debe tener al menos 8 caracteres.")
    .max(72, "Máximo 72 caracteres."),
});

export const itemSchema = z.object({
  descripcion: z.string().trim().min(1, "Describe el ítem."),
  cantidad: z.coerce.number().positive("La cantidad debe ser mayor que cero."),
  valor_unitario: z.coerce.number().positive("El valor debe ser mayor que cero."),
});

export const cuentaCobroSchema = z.object({
  fecha: z.string().trim().min(1, "La fecha es obligatoria."),
  concepto: opt,
  solicitud_id: z.string().uuid().nullable().optional().or(z.literal("").transform(() => null)),
  items: z.array(itemSchema).min(1, "Agrega al menos un ítem."),
});

export const documentoSchema = z.object({
  tipo: z.enum(DOCUMENTO_PROVEEDOR_TIPOS),
  vence_el: opt,
});

export type ProveedorInput = z.input<typeof proveedorSchema>;
export type CuentaCobroInput = z.input<typeof cuentaCobroSchema>;

/** Nombre para mostrar, según el tipo de persona. */
export function nombreProveedor(p: {
  tipo_persona: string;
  nombres: string | null;
  apellidos: string | null;
  razon_social: string | null;
}): string {
  if (p.tipo_persona === "Jurídica") return p.razon_social ?? "(sin razón social)";
  return [p.nombres, p.apellidos].filter(Boolean).join(" ") || "(sin nombre)";
}

/** Total de una cuenta de cobro. */
export function totalCuenta(
  items: { cantidad: number | string; valor_unitario: number | string }[],
): number {
  return items.reduce(
    (a, i) => a + (Number(i.cantidad) || 0) * (Number(i.valor_unitario) || 0),
    0,
  );
}

/**
 * Estado de vigencia de un documento.
 *
 * «Por vencer» son los 30 días previos: avisar el día del vencimiento no le
 * da tiempo a nadie de conseguir un RUT nuevo.
 */
export function vigencia(vence: string | null): "sin-fecha" | "vigente" | "por-vencer" | "vencido" {
  if (!vence) return "sin-fecha";
  const hoy = new Date();
  hoy.setUTCHours(0, 0, 0, 0);
  const f = new Date(`${vence}T00:00:00Z`);
  if (Number.isNaN(f.getTime())) return "sin-fecha";
  const dias = Math.round((f.getTime() - hoy.getTime()) / 86_400_000);
  if (dias < 0) return "vencido";
  if (dias <= 30) return "por-vencer";
  return "vigente";
}
