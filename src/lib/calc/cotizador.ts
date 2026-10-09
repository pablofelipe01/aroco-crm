/**
 * AROCO cotizador — cocoa quote by incoterm (NACIONAL / FOB / CIF).
 *
 * Port of Nicolás's «Cotizador Comercial Aroco» sheet (tabs FOB, CIF, NACIONAL,
 * read 2026-10-09), which replaced the SPEC §8.1 version. Pure functions, no
 * side effects. All monetary line items are computed in USD/TM internally;
 * helpers expose COP/TM, USD/kg and operation totals for display & persistence.
 *
 * Per line:  COP/TM = valor(COP/kg) × 1000 ;  USD/TM = COP/TM / TRM
 * FNC   = fncPct (3 %) × compra(USD/TM)     — export only (FOB/CIF), 0 for NACIONAL
 * Merma = mermaPct (0,5 %) × compra(USD/TM) — always
 * Zero by incoterm: FOB → estibas = 0 ; CIF → transporte_bodega = 0 ;
 *                   NACIONAL → FNC = 0, costos de exportación = 0
 *
 * base       = Σ líneas (compra..coberturas incl. FNC, merma) en USD/TM
 * comision   = max(comisionPct × (precioFinal − costo sin comisión), 0)
 * costoTotal = costo sin comisión + comision
 * utilidad % = (precioFinal − costoTotal) / costoTotal   (markup sobre costo)
 *
 * EXPORT (FOB/CIF):
 *   precioFinal         = cocoaUsdT × (1 + diferencial)
 *   costo sin comisión  = base + costosExportacion
 *
 * NACIONAL (las bonificaciones son ingreso de AROCO y restan del costo):
 *   precioFinal         = compra(USD/TM) / factorNacional (0,97)
 *   bonifCalidad        = bonifCalidadPct × precioFinal × (1 − parte del proveedor)
 *   costo sin comisión  = base − (bonifCalidad + cadmio + trazabilidad + transporte)
 *
 * La parte del proveedor reparte la Bonificación Calidad: con un proveedor en
 * particular se le cede la mitad (0,5); la hoja hoy la deja toda para AROCO (0).
 */

export const FNC_PCT = 0.03;
export const MERMA_PCT = 0.005;
export const FACTOR_NACIONAL = 0.97;
/** 3,85 % + 1,75 % + 1 % − 1,65 % (NACIONAL!M13); componentes por confirmar con Nicolás. */
export const BONIF_CALIDAD_PCT = 0.0495;
export const UMBRAL_VIABLE = 0.1;

export type Incoterm = "NACIONAL" | "FOB" | "CIF";

export interface CotizadorInput {
  incoterm: Incoterm;
  trm: number; // USD/COP
  precioCompraKg: number; // COP/kg
  cocoaUsdT: number; // USD/T (export reference price, ICE NY)
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

  // Admin parameters (ratios); default to the sheet's values.
  fncPct?: number;
  mermaPct?: number;

  // NACIONAL only.
  factorNacional?: number; // precioFinal = compra / factor
  bonifCalidadPct?: number; // ratio of precioFinal
  bonifCalidadProveedorPct?: number; // ratio 0..1 of the quality premium ceded to the supplier
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
  netCostK: number | null; // costo sin comisión, neto de bonificaciones (NACIONAL only)
  bonifCalidadUsdTm: number; // parte de AROCO (NACIONAL only, 0 otherwise)
  bonificacionesUsdTm: number; // Σ bonificaciones (NACIONAL only)
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

  const fncPct = input.fncPct ?? FNC_PCT;
  const mermaPct = input.mermaPct ?? MERMA_PCT;
  const fncUsd = incoterm === "NACIONAL" ? 0 : fncPct * compraUsd;
  const fnc = lineFromUsd("fnc", "FNC", fncUsd, trm);
  const merma = lineFromUsd("merma", "Merma", mermaPct * compraUsd, trm);

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
    incoterm === "NACIONAL" ? 0 : input.costosExportacion,
    trm,
  );

  let precioFinalUsdTm: number;
  let costoSinComision: number;
  let netCostK: number | null = null;
  let bonifCalidadUsdTm = 0;
  let bonificacionesUsdTm = 0;

  if (incoterm === "NACIONAL") {
    const factor = input.factorNacional ?? FACTOR_NACIONAL;
    if (factor <= 0) throw new Error("El factor de precio nacional debe ser mayor que 0.");
    const proveedor = input.bonifCalidadProveedorPct ?? 0;
    if (proveedor < 0 || proveedor > 1)
      throw new Error("La parte del proveedor debe estar entre 0 % y 100 %.");

    precioFinalUsdTm = compraUsd / factor;
    bonifCalidadUsdTm =
      (input.bonifCalidadPct ?? BONIF_CALIDAD_PCT) * precioFinalUsdTm * (1 - proveedor);
    bonificacionesUsdTm =
      bonifCalidadUsdTm +
      ((input.bonifCadmio ?? 0) * 1000) / trm +
      ((input.bonifTrazabilidad ?? 0) * 1000) / trm +
      ((input.bonifTransporte ?? 0) * 1000) / trm;
    costoSinComision = baseUsd - bonificacionesUsdTm;
    netCostK = costoSinComision;
  } else {
    precioFinalUsdTm = input.cocoaUsdT * (1 + input.diferencial);
    costoSinComision = baseUsd + costosExportacion.usdPerTm;
  }

  const comisionUsdTm = Math.max(
    input.comisionPct * (precioFinalUsdTm - costoSinComision),
    0,
  );
  const costoTotalUsdTm = costoSinComision + comisionUsdTm;

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
    bonifCalidadUsdTm,
    bonificacionesUsdTm,
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

/** Criterio de la hoja (formato condicional): viable si la utilidad llega al umbral. */
export function esViable(utilidadPct: number, umbral = UMBRAL_VIABLE): boolean {
  return utilidadPct >= umbral;
}
