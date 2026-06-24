/**
 * Liquidación de pago de una Orden de Compra (Fase 4 — Pago General).
 *
 * ⚠️ MODELO PROVISIONAL Y PARAMETRIZABLE. La fórmula real de sanciones y
 * bonificaciones por calidad está PENDIENTE de confirmación con el cliente
 * (ver CLAUDE.md). Toda la lógica es pura y las tasas/umbrales son parámetros
 * editables, de modo que cuando se confirme la fórmula solo se ajusten los
 * defaults o el cuerpo de `calcularLiquidacion`, sin tocar el resto del módulo.
 *
 * Convención de unidades: humedad/fermentación/impurezas en PORCENTAJE (7.5 = 7.5%).
 * Las tasas son "% de la base por cada punto porcentual sobre/bajo el umbral".
 */

export interface LiquidacionParams {
  /** Humedad máxima aceptada (sobre ella se descuenta). */
  humedadMaxPct: number;
  /** % de la base por cada punto de humedad por encima del máximo. */
  tasaDescuentoHumedad: number;
  /** Impurezas máximas aceptadas (sobre ellas se descuenta). */
  impurezasMaxPct: number;
  /** % de la base por cada punto de impurezas por encima del máximo. */
  tasaDescuentoImpurezas: number;
  /** Fermentación mínima esperada (sobre ella se bonifica). */
  fermentacionMinPct: number;
  /** % de la base por cada punto de fermentación por encima del mínimo. */
  tasaBonifFermentacion: number;
  /** Ajuste manual de sanción (COP absolutos). */
  ajusteManualDescuento: number;
  /** Ajuste manual de bonificación (COP absolutos). */
  ajusteManualBonificacion: number;
}

/** Defaults PROVISIONALES — reemplazar al confirmar la fórmula real. */
export const PARAMS_DEFAULT: LiquidacionParams = {
  humedadMaxPct: 7,
  tasaDescuentoHumedad: 1,
  impurezasMaxPct: 1,
  tasaDescuentoImpurezas: 1,
  fermentacionMinPct: 65,
  tasaBonifFermentacion: 0.5,
  ajusteManualDescuento: 0,
  ajusteManualBonificacion: 0,
};

export interface LiquidacionInput {
  pesoRecibidoKg: number;
  precioKg: number;
  humedadPct: number | null;
  fermentacionPct: number | null;
  impurezasPct: number | null;
  params: LiquidacionParams;
}

export interface LiquidacionBreakdown {
  valorBase: number;
  descuentoHumedad: number;
  descuentoImpurezas: number;
  bonifFermentacion: number;
  ajusteManualDescuento: number;
  ajusteManualBonificacion: number;
  totalSanciones: number;
  totalBonificaciones: number;
  valorTotal: number;
}

const peso = (n: number) => Math.round(n);
const sobre = (valor: number | null, umbral: number) => Math.max(0, (valor ?? 0) - umbral);

/** Calcula la liquidación a partir de la calidad recibida y los parámetros. */
export function calcularLiquidacion(input: LiquidacionInput): LiquidacionBreakdown {
  const { pesoRecibidoKg, precioKg, humedadPct, fermentacionPct, impurezasPct, params } = input;

  const valorBase = peso(Math.max(0, pesoRecibidoKg) * Math.max(0, precioKg));

  const descuentoHumedad = peso(
    valorBase * (sobre(humedadPct, params.humedadMaxPct) * params.tasaDescuentoHumedad) / 100,
  );
  const descuentoImpurezas = peso(
    valorBase * (sobre(impurezasPct, params.impurezasMaxPct) * params.tasaDescuentoImpurezas) / 100,
  );
  const bonifFermentacion = peso(
    valorBase * (sobre(fermentacionPct, params.fermentacionMinPct) * params.tasaBonifFermentacion) / 100,
  );

  const ajusteManualDescuento = peso(Math.max(0, params.ajusteManualDescuento));
  const ajusteManualBonificacion = peso(Math.max(0, params.ajusteManualBonificacion));

  const totalSanciones = descuentoHumedad + descuentoImpurezas + ajusteManualDescuento;
  const totalBonificaciones = bonifFermentacion + ajusteManualBonificacion;
  const valorTotal = Math.max(0, valorBase - totalSanciones + totalBonificaciones);

  return {
    valorBase,
    descuentoHumedad,
    descuentoImpurezas,
    bonifFermentacion,
    ajusteManualDescuento,
    ajusteManualBonificacion,
    totalSanciones,
    totalBonificaciones,
    valorTotal,
  };
}
