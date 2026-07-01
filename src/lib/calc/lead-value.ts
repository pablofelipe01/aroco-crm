/**
 * Valor total de un lead (revisión CRM 2026-06-30).
 *
 * valor = toneladas × 1000 (kg/T) × precio (COP/kg)
 *
 * El precio de referencia depende del mercado:
 *   Nacional      → precio Luker (COP/kg)
 *   Internacional → precio ICE convertido a COP/kg
 */

export type Market = "Nacional" | "Internacional";

export interface ReferencePrices {
  /** Precio Luker más reciente (COP/kg). */
  luker: number | null;
  /** Precio internacional ICE convertido a COP/kg. */
  ice: number | null;
}

const KG_PER_TON = 1000;

/** Precio de referencia (COP/kg) según el mercado; null si no aplica/disponible. */
export function pickReferencePrice(
  market: Market | null | undefined,
  prices: ReferencePrices,
): number | null {
  if (market === "Nacional") return prices.luker ?? null;
  if (market === "Internacional") return prices.ice ?? null;
  return null;
}

/** Valor total en COP: toneladas × 1000 × precio(COP/kg). null si falta un dato. */
export function leadValueCop(
  toneladas: number | null | undefined,
  pricePerKgCop: number | null | undefined,
): number | null {
  if (toneladas == null || !Number.isFinite(toneladas) || toneladas <= 0) return null;
  if (pricePerKgCop == null || !Number.isFinite(pricePerKgCop) || pricePerKgCop <= 0)
    return null;
  return toneladas * KG_PER_TON * pricePerKgCop;
}

/** Conveniencia: valor a partir del mercado y los precios de referencia. */
export function leadValueForMarket(
  toneladas: number | null | undefined,
  market: Market | null | undefined,
  prices: ReferencePrices,
): number | null {
  return leadValueCop(toneladas, pickReferencePrice(market, prices));
}
