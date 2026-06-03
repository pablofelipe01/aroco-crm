import { z } from "zod";
import type { CotizadorInput, Incoterm } from "@/lib/calc/cotizador";

const num = z.coerce.number();
const optNum = z.coerce.number().optional().default(0);

/**
 * Quote form schema. Percentages (differential, commission, target utility) are
 * entered as whole numbers (5 = 5%) and converted to ratios in
 * `toCotizadorInput`. Modifiers are COP/kg; bonif_calidad is USD/TM.
 */
export const quoteSchema = z.object({
  incoterm: z.enum(["NACIONAL", "FOB", "CIF"]),
  lead_id: z.string().uuid().nullable().optional(),
  client_name: z.string().trim().nullable().optional(),
  market: z.enum(["Nacional", "Internacional"]).nullable().optional(),
  port_origin: z.string().trim().nullable().optional(),
  port_destination: z.string().trim().nullable().optional(),
  validity_days: z.coerce.number().int().min(0).default(15),

  trm: num,
  cocoa_usd_t: optNum,
  differential_pct: optNum, // percent
  purchase_price_cop_kg: num,
  volume_tm: z.coerce.number().default(1),

  transporte_bodega: optNum,
  seleccion: optNum,
  fumigacion: optNum,
  estibas: optNum,
  costales: optNum,
  coberturas: optNum,
  costos_exportacion: optNum,

  bonif_calidad: optNum,
  bonif_cadmio: optNum,
  bonif_trazabilidad: optNum,
  bonif_transporte: optNum,

  commission_pct: optNum, // percent
  target_utility_pct: optNum, // percent
});

export type QuoteFormParsed = z.infer<typeof quoteSchema>;

/** Map validated quote form values → pure CotizadorInput (ratios). */
export function toCotizadorInput(q: QuoteFormParsed): CotizadorInput {
  return {
    incoterm: q.incoterm as Incoterm,
    trm: q.trm,
    precioCompraKg: q.purchase_price_cop_kg,
    cocoaUsdT: q.cocoa_usd_t,
    diferencial: q.differential_pct / 100,
    volumenTM: q.volume_tm,
    comisionPct: q.commission_pct / 100,
    transporteBodega: q.transporte_bodega,
    seleccion: q.seleccion,
    fumigacion: q.fumigacion,
    estibas: q.estibas,
    costales: q.costales,
    coberturas: q.coberturas,
    costosExportacion: q.costos_exportacion,
    targetUtilityPct: q.target_utility_pct / 100,
    bonifCalidad: q.bonif_calidad,
    bonifCadmio: q.bonif_cadmio,
    bonifTrazabilidad: q.bonif_trazabilidad,
    bonifTransporte: q.bonif_transporte,
  };
}
