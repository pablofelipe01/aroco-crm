/**
 * Carga del inventario desde el CRM (fase 2, migración 0113).
 *
 * El disponible de un lote del CRM no se escribe: lo calcula la base
 * (`inventario_recalcular_lote`) a partir de lo que entró por clase, sus
 * salidas y sus ajustes. Aquí van solo las reglas de los formularios, puras,
 * para que el cliente y el servidor validen igual.
 */
import { z } from "zod";
import { BODEGAS } from "@/lib/inventory/bodegas";

/** Las nueve clases que maneja el CRM: las ocho del archivo más Baba. */
export const CLASES_CRM = [
  "premium",
  "estandar",
  "fairtrade",
  "rainforest",
  "corriente",
  "corriente_c",
  "pasilla",
  "organico",
  "baba",
] as const;
export type ClaseCrm = (typeof CLASES_CRM)[number];

export const NOMBRE_CLASE_CRM: Record<ClaseCrm, string> = {
  premium: "Premium",
  estandar: "Estándar",
  fairtrade: "Fairtrade",
  rainforest: "Rainforest",
  corriente: "Corriente",
  corriente_c: "Corriente C",
  pasilla: "Pasilla",
  organico: "Orgánico",
  baba: "Baba",
};

/** A qué tipo del resumen pertenece cada clase (ver bodegas.ts). */
export const TIPO_DE_CLASE: Record<ClaseCrm, "primera" | "segunda" | "organico" | "baba"> = {
  premium: "primera",
  estandar: "primera",
  fairtrade: "primera",
  rainforest: "primera",
  corriente: "segunda",
  corriente_c: "segunda",
  pasilla: "segunda",
  organico: "organico",
  baba: "baba",
};

export const colIn = (c: ClaseCrm) => `qty_in_${c}_kg` as const;
export const colAvail = (c: ClaseCrm) => `qty_avail_${c}_kg` as const;
export const colSalida = (c: ClaseCrm) => `qty_${c}_kg` as const;

/** Disponible de cada clase de un lote (lo que guarda la base). */
export function disponibleDeClases(l: Record<string, unknown>): Record<ClaseCrm, number> {
  return Object.fromEntries(
    CLASES_CRM.map((c) => [c, Number(l[colAvail(c)]) || 0]),
  ) as Record<ClaseCrm, number>;
}

const texto = z
  .string()
  .trim()
  .max(200)
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");
const kg = z.coerce.number().min(0, "Los kilos no pueden ser negativos.").max(1_000_000);
const dinero = z.coerce.number().min(0).max(10_000_000).nullable().optional();
const pct = z.coerce.number().min(0).max(100).nullable().optional();
const clase = z.enum(CLASES_CRM);

export const ingresoSchema = z
  .object({
    entry_date: fecha,
    /** Vacía = automática: la base la saca del departamento (0114). */
    bodega: z.enum(BODEGAS).nullable().optional(),
    proveedor_id: z.string().uuid().nullable().optional(),
    proveedor: texto,
    departamento: texto,
    municipio: texto,
    remision: texto,
    odc: texto,
    recepcion: texto,
    responsable: texto,
    // partialRecord: en zod 4 un record con llaves de enum exige todas.
    kilos: z.partialRecord(clase, kg),
    bultos_in: z.coerce.number().min(0).max(100_000).default(0),
    purchase_price_cop_kg: dinero,
    bonificacion_cop_kg: dinero,
    cadmio: z.enum(["ALTO", "BAJO"]).nullable().optional(),
    pct_humedad: pct,
    pct_fermentacion_total: pct,
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .refine((v) => CLASES_CRM.some((c) => (v.kilos[c] ?? 0) > 0), {
    message: "Registra los kilos de al menos una clase.",
    path: ["kilos"],
  });
export type Ingreso = z.infer<typeof ingresoSchema>;

export const salidaSchema = z.object({
  dispatch_date: fecha,
  destination: z.string().trim().min(1, "¿A quién sale?").max(200),
  remision_salida: texto,
  oc: texto,
  bultos: z.coerce.number().min(0).max(100_000).nullable().optional(),
  lineas: z
    .array(
      z.object({
        lote_id: z.string().uuid("Elige el lote."),
        clase,
        kg: z.coerce.number().positive("Los kilos deben ser mayores que cero.").max(1_000_000),
      }),
    )
    .min(1, "Agrega al menos una línea.")
    .max(50),
});
export type Salida = z.infer<typeof salidaSchema>;

export const ajusteSchema = z
  .object({
    lot_id: z.string().uuid(),
    fecha,
    tipo: z.enum(["merma", "reclasificacion"]),
    clase_origen: clase,
    clase_destino: clase.nullable().optional(),
    kg: z.coerce.number().positive("Los kilos deben ser mayores que cero.").max(1_000_000),
    nota: z.string().trim().max(500).nullable().optional(),
  })
  .refine((v) => v.tipo === "merma" || (v.clase_destino && v.clase_destino !== v.clase_origen), {
    message: "Elige a qué clase pasa (distinta de la de origen).",
    path: ["clase_destino"],
  });
export type Ajuste = z.infer<typeof ajusteSchema>;

/**
 * Revisa una salida contra el disponible de cada lote antes de enviarla. La
 * base vuelve a revisarlo (y es la que manda), pero así el error sale en el
 * formulario y nombra la línea.
 */
export function revisarSalida(
  lineas: { lote_id: string; clase: ClaseCrm; kg: number }[],
  disponible: Map<string, Record<ClaseCrm, number>>,
  nombre: (loteId: string) => string,
): string | null {
  const pedido = new Map<string, number>();
  for (const l of lineas) {
    const k = `${l.lote_id}|${l.clase}`;
    pedido.set(k, (pedido.get(k) ?? 0) + l.kg);
  }
  for (const [k, kgPedidos] of pedido) {
    const [lote, c] = k.split("|") as [string, ClaseCrm];
    const hay = disponible.get(lote)?.[c] ?? 0;
    if (kgPedidos > hay + 0.001) {
      return `${nombre(lote)}: pides ${kgPedidos} kg de ${NOMBRE_CLASE_CRM[c]} y quedan ${Math.max(0, Math.round(hay * 100) / 100)} kg.`;
    }
  }
  return null;
}

/** Código descriptivo de un ingreso del CRM, al estilo del archivo. */
export function codigoIngreso(i: {
  departamento?: string | null;
  municipio?: string | null;
  proveedor?: string | null;
  entry_date: string;
}): string {
  const tres = (s?: string | null) =>
    (s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^A-Za-z]/g, "")
      .slice(0, 3)
      .toUpperCase();
  const [y, m, d] = i.entry_date.split("-");
  const prov = (i.proveedor ?? "").trim().toUpperCase();
  return ["CO", tres(i.departamento), tres(i.municipio), prov, `${d}${m}${y.slice(2)}`].join("-");
}
