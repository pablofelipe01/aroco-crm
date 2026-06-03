/**
 * AROCO cotizador — cocoa quote by incoterm (NACIONAL / FOB / CIF).
 *
 * Faithful port of the validated Excel logic (SPEC §8.1). Pure functions, no
 * side effects. All monetary line items are computed in USD/TM internally;
 * helpers expose COP/TM, USD/kg and operation totals for display & persistence.
 *
 * Per line:  COP/TM = valor(COP/kg) × 1000 ;  USD/TM = COP/TM / TRM
 * FNC   = 3.0% × compra(USD/TM)   — export only (FOB/CIF), 0 for NACIONAL
 * Merma = 0.5% × compra(USD/TM)   — always
 * Zero by incoterm: FOB → estibas = 0 ; CIF → transporte_bodega = 0 ;
 *                   NACIONAL → FNC = 0
 *
 * EXPORT (FOB/CIF):
 *   precioFinal = cocoaUsdT × (1 + diferencial)
 *   base        = Σ líneas (compra..coberturas incl. FNC, merma) en USD/TM
 *   comision    = comisionPct × (precioFinal − (base + costosExportacion))
 *   costoTotal  = base + costosExportacion + comision
 *
 * NACIONAL (bonificaciones reducen el costo neto; comisión circular en forma
 * cerrada):
 *   K           = base − (bonifCalidad + bonifCadmio + bonifTrazab + bonifTransp)
 *   precioFinal = K(1−m)(1+u) / (1 − m(1+u))   con m=comisionPct, u=utilObjetivo
 *   comision    = m × (precioFinal − K)
 *   costoTotal  = K + comision
 */

export const FNC_PCT = 0.03;
export const MERMA_PCT = 0.005;

export type Incoterm = "NACIONAL" | "FOB" | "CIF";

export interface CotizadorInput {
  incoterm: Incoterm;
  trm: number; // USD/COP
  precioCompraKg: number; // COP/kg
  cocoaUsdT: number; // USD/T (export reference price)
  diferencial: number; // ratio (0.05 = 5%) — export only
  volumenTM: number;
  comisionPct: number; // ratio

  // Cost modifiers in display unit COP/kg.
  transporteBodega: number;
  seleccion: number;
  fumigacion: number;
  estibas: number;
  costales: number;
  coberturas: number;
  costosExportacion: number;

  // NACIONAL only.
  targetUtilityPct?: number; // ratio (u)
  bonifCalidad?: number; // USD/TM (direct value — SPEC §8.1, pending confirmation)
  bonifCadmio?: number; // COP/kg
  bonifTrazabilidad?: number; // COP/kg
  bonifTransporte?: number; // COP/kg
}

export interface CostLine {
  key: string;
  label: string;
  copPerKg: number;
  copPerTm: number;
  usdPerTm: number;
  usdPerKg: number;
}

export interface CotizadorResult {
  incoterm: Incoterm;
  lines: CostLine[];
  base: CostLine; // Σ líneas (USD/TM etc.)
  costosExportacion: CostLine;
  netCostK: number | null; // K (NACIONAL only)
  comisionUsdTm: number;
  costoTotalUsdTm: number;
  precioFinalUsdTm: number;
  precioFinalCopTm: number;
  utilidadPct: number; // ratio
  valorUtilidadUsdTm: number;
  totalOperacionUsd: number;
  totalOperacionCop: number;
}

/** Build a cost line from a USD/TM amount (re-derives the COP figures). */
function lineFromUsd(
  key: string,
  label: string,
  usdPerTm: number,
  trm: number,
): CostLine {
  const copPerTm = usdPerTm * trm;
  return {
    key,
    label,
    copPerKg: copPerTm / 1000,
    copPerTm,
    usdPerTm,
    usdPerKg: usdPerTm / 1000,
  };
}

/** Build a cost line from a display COP/kg value. */
function lineFromCopKg(
  key: string,
  label: string,
  copPerKg: number,
  trm: number,
): CostLine {
  const copPerTm = copPerKg * 1000;
  const usdPerTm = copPerTm / trm;
  return { key, label, copPerKg, copPerTm, usdPerTm, usdPerKg: usdPerTm / 1000 };
}

export function cotizar(input: CotizadorInput): CotizadorResult {
  const { incoterm, trm, volumenTM } = input;
  if (trm <= 0) throw new Error("TRM debe ser mayor que 0.");

  // ── Cost lines (with the per-incoterm zeros applied) ──────────────────────
  const compra = lineFromCopKg("compra", "Precio compra", input.precioCompraKg, trm);
  const compraUsd = compra.usdPerTm;

  const transporteBodega = lineFromCopKg(
    "transporte_bodega",
    "Transporte a bodega",
    incoterm === "CIF" ? 0 : input.transporteBodega,
    trm,
  );
  const seleccion = lineFromCopKg("seleccion", "Selección", input.seleccion, trm);
  const fumigacion = lineFromCopKg("fumigacion", "Fumigación", input.fumigacion, trm);
  const estibas = lineFromCopKg(
    "estibas",
    "Estibas",
    incoterm === "FOB" ? 0 : input.estibas,
    trm,
  );
  const costales = lineFromCopKg("costales", "Costales", input.costales, trm);
  const coberturas = lineFromCopKg("coberturas", "Coberturas", input.coberturas, trm);

  const fncUsd = incoterm === "NACIONAL" ? 0 : FNC_PCT * compraUsd;
  const fnc = lineFromUsd("fnc", "FNC (3%)", fncUsd, trm);
  const merma = lineFromUsd("merma", "Merma (0,5%)", MERMA_PCT * compraUsd, trm);

  const lines = [
    compra,
    transporteBodega,
    seleccion,
    fumigacion,
    estibas,
    costales,
    coberturas,
    fnc,
    merma,
  ];

  const baseUsd = lines.reduce((s, l) => s + l.usdPerTm, 0);
  const base = lineFromUsd("base", "Costo base", baseUsd, trm);
  const costosExportacion = lineFromCopKg(
    "costos_exportacion",
    "Costos de exportación",
    input.costosExportacion,
    trm,
  );

  let precioFinalUsdTm: number;
  let comisionUsdTm: number;
  let costoTotalUsdTm: number;
  let netCostK: number | null = null;

  if (incoterm === "NACIONAL") {
    const m = input.comisionPct;
    const u = input.targetUtilityPct ?? 0;
    const bonifs =
      (input.bonifCalidad ?? 0) +
      ((input.bonifCadmio ?? 0) * 1000) / trm +
      ((input.bonifTrazabilidad ?? 0) * 1000) / trm +
      ((input.bonifTransporte ?? 0) * 1000) / trm;

    const K = baseUsd - bonifs;
    netCostK = K;

    const denom = 1 - m * (1 + u);
    if (denom === 0) throw new Error("Comisión/utilidad inválidas (denominador 0).");
    precioFinalUsdTm = (K * (1 - m) * (1 + u)) / denom;
    comisionUsdTm = m * (precioFinalUsdTm - K);
    costoTotalUsdTm = K + comisionUsdTm;
  } else {
    precioFinalUsdTm = input.cocoaUsdT * (1 + input.diferencial);
    comisionUsdTm =
      input.comisionPct * (precioFinalUsdTm - (baseUsd + costosExportacion.usdPerTm));
    costoTotalUsdTm = baseUsd + costosExportacion.usdPerTm + comisionUsdTm;
  }

  const valorUtilidadUsdTm = precioFinalUsdTm - costoTotalUsdTm;
  const utilidadPct =
    costoTotalUsdTm !== 0 ? valorUtilidadUsdTm / costoTotalUsdTm : 0;
  const precioFinalCopTm = precioFinalUsdTm * trm;

  return {
    incoterm,
    lines,
    base,
    costosExportacion,
    netCostK,
    comisionUsdTm,
    costoTotalUsdTm,
    precioFinalUsdTm,
    precioFinalCopTm,
    utilidadPct,
    valorUtilidadUsdTm,
    totalOperacionUsd: precioFinalUsdTm * volumenTM,
    totalOperacionCop: precioFinalCopTm * volumenTM,
  };
}
