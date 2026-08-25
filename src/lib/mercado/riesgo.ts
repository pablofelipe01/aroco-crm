/**
 * Riesgo: cruza la posición física contra la cobertura del broker.
 *
 * La pregunta que responde es una sola: de las toneladas que AROCO tiene
 * compradas, ¿cuántas están expuestas a que el precio del cacao caiga?
 *
 * Todo entra por parámetro —nada se lee del reloj ni de la base— para que el
 * cálculo sea reproducible y se pueda probar con cifras conocidas.
 */

/** Contrato de cacao en ICE: 10 toneladas métricas. */
export const TONELADAS_POR_CONTRATO = 10;

export type PosicionBroker = {
  option_type: string | null;
  long_qty: number;
  short_qty: number;
  strike: number | null;
  contract_month: string | null;
};

export type EntradaRiesgo = {
  /** Kilos disponibles en bodega. */
  kgFisico: number;
  /** Costo promedio ponderado de esos kilos, COP/kg. */
  costoPromedioCopKg: number | null;
  posiciones: PosicionBroker[];
  /** Cacao en USD por tonelada. */
  precioCacaoUsdT: number | null;
  /** COP por USD. */
  trm: number | null;
};

export type Riesgo = {
  toneladasFisicas: number;
  toneladasCubiertas: number;
  toneladasDescubiertas: number;
  coberturaPct: number;

  /** Piso y techo si hay collar armado (puts largos y calls cortos). */
  collar: { piso: number | null; techo: number | null } | null;
  contratos: { putsLargos: number; callsCortos: number; futurosLargos: number; futurosCortos: number };

  /** Precio de mercado llevado a COP/kg, comparable con el costo. */
  precioMercadoCopKg: number | null;
  costoPromedioCopKg: number | null;
  /** (mercado − costo) × kilos. Positivo = el inventario vale más de lo que costó. */
  pnlFisicoCop: number | null;

  /** Lo que falta para poder calcular. Vacío = el cálculo está completo. */
  faltantes: string[];
};

const redondear = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

export function calcularRiesgo(e: EntradaRiesgo): Riesgo {
  const toneladasFisicas = redondear(e.kgFisico / 1000, 4);

  const putsLargos = e.posiciones
    .filter((p) => p.option_type === "PUT" && p.long_qty > 0)
    .reduce((a, p) => a + p.long_qty, 0);
  const callsCortos = e.posiciones
    .filter((p) => p.option_type === "CALL" && p.short_qty > 0)
    .reduce((a, p) => a + p.short_qty, 0);
  const futurosLargos = e.posiciones
    .filter((p) => p.option_type === "FUTURE" && p.long_qty > 0)
    .reduce((a, p) => a + p.long_qty, 0);
  const futurosCortos = e.posiciones
    .filter((p) => p.option_type === "FUTURE" && p.short_qty > 0)
    .reduce((a, p) => a + p.short_qty, 0);

  // Cubre lo que protege de una CAÍDA del precio: los puts comprados y los
  // futuros vendidos. Un futuro comprado no cubre inventario — lo duplica, y
  // sumarlo diría que hay protección donde hay el doble de exposición.
  const contratosCubriendo = putsLargos + futurosCortos;
  const toneladasCubiertas = contratosCubriendo * TONELADAS_POR_CONTRATO;
  const toneladasDescubiertas = redondear(Math.max(0, toneladasFisicas - toneladasCubiertas), 4);
  const coberturaPct =
    toneladasFisicas > 0
      ? redondear(Math.min(100, (toneladasCubiertas / toneladasFisicas) * 100), 2)
      : 0;

  // El collar existe cuando hay piso comprado y techo vendido a la vez. Con
  // solo una pata no es un collar y llamarlo así induciría a creer que el
  // rango está acotado por los dos lados.
  const strikesPut = e.posiciones
    .filter((p) => p.option_type === "PUT" && p.long_qty > 0 && p.strike !== null)
    .map((p) => p.strike as number);
  const strikesCall = e.posiciones
    .filter((p) => p.option_type === "CALL" && p.short_qty > 0 && p.strike !== null)
    .map((p) => p.strike as number);
  const collar =
    strikesPut.length > 0 && strikesCall.length > 0
      ? { piso: Math.max(...strikesPut), techo: Math.min(...strikesCall) }
      : null;

  // USD/tonelada → COP/kilo: × TRM ÷ 1000. Es la única forma de comparar el
  // precio internacional contra un costo de compra en pesos.
  const precioMercadoCopKg =
    e.precioCacaoUsdT !== null && e.trm !== null
      ? redondear((e.precioCacaoUsdT * e.trm) / 1000, 2)
      : null;

  const pnlFisicoCop =
    precioMercadoCopKg !== null && e.costoPromedioCopKg !== null && e.kgFisico > 0
      ? Math.round((precioMercadoCopKg - e.costoPromedioCopKg) * e.kgFisico)
      : null;

  const faltantes: string[] = [];
  if (e.precioCacaoUsdT === null) faltantes.push("precio del cacao");
  if (e.trm === null) faltantes.push("TRM");
  if (e.costoPromedioCopKg === null) faltantes.push("costo de compra");

  return {
    toneladasFisicas,
    toneladasCubiertas,
    toneladasDescubiertas,
    coberturaPct,
    collar,
    contratos: { putsLargos, callsCortos, futurosLargos, futurosCortos },
    precioMercadoCopKg,
    costoPromedioCopKg: e.costoPromedioCopKg,
    pnlFisicoCop,
    faltantes,
  };
}

/**
 * Qué pasa con el inventario si el precio se mueve.
 *
 * Solo la pata física: el efecto de la cobertura depende de strikes y primas y
 * se calcularía mal sin las griegas, que Barchart no entrega. Prometer un P&L
 * cubierto con datos incompletos sería peor que no mostrarlo.
 */
export function escenarios(
  r: Riesgo,
  kgFisico: number,
  variaciones = [-0.2, -0.1, 0, 0.1, 0.2],
): { variacion: number; precioCopKg: number; pnlCop: number }[] {
  if (r.precioMercadoCopKg === null || r.costoPromedioCopKg === null) return [];
  return variaciones.map((v) => {
    const precio = redondear(r.precioMercadoCopKg! * (1 + v), 2);
    return {
      variacion: v,
      precioCopKg: precio,
      pnlCop: Math.round((precio - r.costoPromedioCopKg!) * kgFisico),
    };
  });
}
