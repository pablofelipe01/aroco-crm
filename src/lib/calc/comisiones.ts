/**
 * AROCO commissions (SPEC §8.2).
 *
 * Rules: a Mercado × Nivel matrix of `pct_full`. The 60/40 splits derive:
 *   Solo Venta  = pct_full × 0.6
 *   Solo Compra = pct_full × 0.4
 *
 * Simulator: utilidadBruta = ventaTotal − costoTotal ; margen = utilidad/venta ;
 *   comision = utilidadBruta × pctAplicable(mercado, nivel, rol).
 *
 * Two-agent split on one operation: Venta 60% / Compra 40% (never exceeds the
 * level cap pct_full).
 */

export type Market = "Nacional" | "Internacional";
export type CommissionLevel = "Senior" | "Junior";
export type CommissionRole = "Compra+Venta" | "Solo Venta" | "Solo Compra";

export const VENTA_SHARE = 0.6;
export const COMPRA_SHARE = 0.4;

export interface CommissionRule {
  market: Market;
  level: CommissionLevel;
  pct_full: number; // ratio
}

/** Seed matrix (SPEC §6). Overridable by the editable rules in the DB. */
export const DEFAULT_RULES: CommissionRule[] = [
  { market: "Nacional", level: "Senior", pct_full: 0.05 },
  { market: "Nacional", level: "Junior", pct_full: 0.03 },
  { market: "Internacional", level: "Senior", pct_full: 0.08 },
  { market: "Internacional", level: "Junior", pct_full: 0.06 },
];

export function findRule(
  rules: CommissionRule[],
  market: Market,
  level: CommissionLevel,
): CommissionRule | undefined {
  return rules.find((r) => r.market === market && r.level === level);
}

/** Effective percentage for a role given the level's full percentage. */
export function pctForRole(pctFull: number, role: CommissionRole): number {
  switch (role) {
    case "Solo Venta":
      return pctFull * VENTA_SHARE;
    case "Solo Compra":
      return pctFull * COMPRA_SHARE;
    case "Compra+Venta":
    default:
      return pctFull;
  }
}

export interface CommissionInput {
  ventaTotal: number;
  costoTotal: number;
  market: Market;
  level: CommissionLevel;
  role: CommissionRole;
  rules?: CommissionRule[];
}

export interface CommissionResult {
  utilidadBruta: number;
  margen: number; // ratio
  pctFull: number;
  pctAplicable: number; // ratio
  comision: number;
}

export function simulateCommission(input: CommissionInput): CommissionResult {
  const rules = input.rules ?? DEFAULT_RULES;
  const rule = findRule(rules, input.market, input.level);
  if (!rule) {
    throw new Error(
      `Sin regla de comisión para ${input.market} / ${input.level}.`,
    );
  }
  const utilidadBruta = input.ventaTotal - input.costoTotal;
  const margen = input.ventaTotal !== 0 ? utilidadBruta / input.ventaTotal : 0;
  const pctAplicable = pctForRole(rule.pct_full, input.role);
  return {
    utilidadBruta,
    margen,
    pctFull: rule.pct_full,
    pctAplicable,
    comision: utilidadBruta * pctAplicable,
  };
}

/** Split a total commission between the selling and buying agents (60/40). */
export function splitCommission(total: number): { venta: number; compra: number } {
  return { venta: total * VENTA_SHARE, compra: total * COMPRA_SHARE };
}
