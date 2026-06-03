import { z } from "zod";
import { cotizar, type CotizadorInput, type Incoterm } from "@/lib/calc/cotizador";

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

/**
 * Build the persisted quotes row (inputs as ratios + computed snapshot) from
 * validated form values. Shared by the Cotizaciones module and the AI assistant
 * so both compute identically. quote_number / created_by are added by the caller.
 */
export function buildQuoteRow(q: QuoteFormParsed) {
  const calc = cotizar(toCotizadorInput(q));
  return {
    incoterm: q.incoterm,
    lead_id: q.lead_id ?? null,
    client_name: q.client_name ?? null,
    market: q.market ?? null,
    port_origin: q.port_origin ?? null,
    port_destination: q.port_destination ?? null,
    validity_days: q.validity_days,
    trm: q.trm,
    cocoa_usd_t: q.cocoa_usd_t,
    differential: q.differential_pct / 100,
    purchase_price_cop_kg: q.purchase_price_cop_kg,
    volume_tm: q.volume_tm,
    transporte_bodega: q.transporte_bodega,
    seleccion: q.seleccion,
    fumigacion: q.fumigacion,
    estibas: q.estibas,
    costales: q.costales,
    coberturas: q.coberturas,
    costos_exportacion: q.costos_exportacion,
    bonif_calidad: q.bonif_calidad,
    bonif_cadmio: q.bonif_cadmio,
    bonif_trazabilidad: q.bonif_trazabilidad,
    bonif_transporte: q.bonif_transporte,
    commission_pct: q.commission_pct / 100,
    target_utility_pct: q.target_utility_pct / 100,
    costo_total_usd_tm: calc.costoTotalUsdTm,
    utilidad_pct: calc.utilidadPct,
    precio_final_usd_tm: calc.precioFinalUsdTm,
    precio_final_cop_tm: calc.precioFinalCopTm,
    total_operacion_usd: calc.totalOperacionUsd,
    total_operacion_cop: calc.totalOperacionCop,
  };
}
