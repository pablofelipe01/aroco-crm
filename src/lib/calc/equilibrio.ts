/**
 * Pipeline separado por negocio y equilibrio entre lo que se puede comprar y
 * lo que se puede vender (revisión del CRM del 2026-10-09).
 *
 * Funciones puras. El equilibrio compara toneladas, no pesos: el valor de una
 * compra y el de una venta salen de precios distintos (Luker vs ICE) y su
 * cociente no dice si alcanza el cacao.
 */

export type Negocio = "Compra" | "Venta";

export interface LeadPipeline {
  negocio: Negocio;
  status: string;
  potential_value_cop: number | string | null;
  toneladas: number | string | null;
}

/** Ni los descartados ni los en pausa cuentan (0109). */
const FUERA = new Set(["Descartado", "En pausa"]);

export interface Lado {
  /** Leads que cuentan: ni descartados ni en pausa. */
  activos: number;
  /** Σ valor potencial de los que cuentan (COP). */
  total: number;
  /** Σ valor × probabilidad de la etapa (COP). */
  ponderado: number;
  /** Σ toneladas de los que cuentan. */
  toneladas: number;
}

export function porNegocio(
  leads: LeadPipeline[],
  peso: (status: string) => number,
): Record<Negocio, Lado> {
  const vacio = (): Lado => ({ activos: 0, total: 0, ponderado: 0, toneladas: 0 });
  const r: Record<Negocio, Lado> = { Venta: vacio(), Compra: vacio() };
  for (const l of leads) {
    if (FUERA.has(l.status)) continue;
    const lado = r[l.negocio];
    const v = Number(l.potential_value_cop) || 0;
    lado.activos++;
    lado.total += v;
    lado.ponderado += v * peso(l.status);
    lado.toneladas += Number(l.toneladas) || 0;
  }
  return r;
}

/** Margen alrededor de 1:1 que se considera equilibrado (±20 %). */
export const MARGEN_EQUILIBRIO = 0.2;

export type EstadoEquilibrio = "falta" | "equilibrado" | "sobra" | "sin_datos";

/**
 * Cuánto de lo que se puede vender está cubierto por lo que se puede comprar.
 * `cobertura` = toneladas de compra ÷ toneladas de venta (1 = parejo).
 */
export function equilibrio(
  toneladasCompra: number,
  toneladasVenta: number,
  margen = MARGEN_EQUILIBRIO,
): { estado: EstadoEquilibrio; cobertura: number | null } {
  if (toneladasVenta <= 0) {
    return { estado: toneladasCompra > 0 ? "sobra" : "sin_datos", cobertura: null };
  }
  const cobertura = toneladasCompra / toneladasVenta;
  const estado =
    cobertura < 1 - margen ? "falta" : cobertura > 1 + margen ? "sobra" : "equilibrado";
  return { estado, cobertura };
}
