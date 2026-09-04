/**
 * Delta de las opciones de cacao, calculado en vez de esperado.
 *
 * EL PROBLEMA. Barchart entrega strikes y primas, nunca las griegas. El delta
 * solo estaba en el tablero del bróker, que no tiene API: es una pantalla que
 * alguien tiene que capturar y subir. Mientras nadie la sube, la pantalla de
 * Mercado no puede decir cuánto protege de verdad una cobertura —un put muy
 * fuera de dinero cubre en el papel y casi nada en la práctica— y eso quedó
 * anotado en la revisión del 1-sep-2026 como «las deltas no cargan».
 *
 * LA SALIDA. El delta no es un dato que haya que pedir: se deduce de lo que ya
 * tenemos. Con la prima, el strike, el subyacente y el plazo se despeja la
 * volatilidad implícita, y con ella sale el delta. Black-76 y no Black-Scholes
 * porque el subyacente es un FUTURO, no un contado: no hay que descontar
 * dividendos ni acarreo, ya están dentro del precio del futuro.
 *
 * COMPROBADO CONTRA EL TABLERO REAL de StoneX del 3-sep-2026 (subyacente 6225).
 * Con la volatilidad del propio tablero, este cálculo reproduce sus deltas:
 *
 *     DEC26 · 6250   tablero 53,88   calculado 53,83
 *     DEC26 · 6000   tablero 60,31   calculado 60,30
 *     NOV26 · 6250   tablero 52,33   calculado 52,31
 *     OCT26 · 6250   tablero 49,58   calculado 49,51
 *
 * En los strikes lejanos se abre hasta un punto —el tablero usa UNA
 * volatilidad para toda la columna y el mercado cobra una distinta en cada
 * strike (la «sonrisa»)—. Despejando la volatilidad strike por strike, como se
 * hace aquí, esa diferencia desaparece: cada delta sale de la prima que de
 * verdad se está cotizando en ese strike.
 *
 * Un delta calculado NO es un delta del bróker y no se guarda en la misma
 * columna. Ver la migración 0081.
 */

/** Función de distribución normal acumulada, por la función error. */
function N(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

/**
 * Aproximación de Abramowitz & Stegun 7.1.26 (error < 1,5 × 10⁻⁷).
 *
 * JavaScript no trae `erf`. La precisión sobra: el delta se lee con dos
 * decimales y el propio tablero del bróker redondea ahí.
 */
function erf(x: number): number {
  const signo = x < 0 ? -1 : 1;
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t +
      0.254829592) *
      t *
      Math.exp(-z * z);
  return signo * y;
}

export type Entrada = {
  /** Precio del futuro subyacente. */
  F: number;
  /** Strike. */
  K: number;
  /** Años hasta el vencimiento. */
  T: number;
  /** Volatilidad anual en tanto por uno (0,556 = 55,6 %). */
  sigma: number;
  /** Tasa libre de riesgo anual, tanto por uno. */
  r: number;
};

function d1de({ F, K, T, sigma }: Entrada): number {
  return (Math.log(F / K) + (sigma * sigma * T) / 2) / (sigma * Math.sqrt(T));
}

/** Prima de una call europea sobre futuro. */
export function precioCall(e: Entrada): number {
  const d1 = d1de(e);
  const d2 = d1 - e.sigma * Math.sqrt(e.T);
  return Math.exp(-e.r * e.T) * (e.F * N(d1) - e.K * N(d2));
}

/** Prima de una put europea sobre futuro. */
export function precioPut(e: Entrada): number {
  const d1 = d1de(e);
  const d2 = d1 - e.sigma * Math.sqrt(e.T);
  return Math.exp(-e.r * e.T) * (e.K * N(-d2) - e.F * N(-d1));
}

/**
 * Delta en TANTO POR UNO, con signo: la call entre 0 y 1, la put entre −1 y 0.
 *
 * El tablero del bróker los escribe en por ciento (53,88 y no 0,5388). La
 * conversión se hace donde se guarda, no aquí: una función de cálculo que
 * devuelve a veces una escala y a veces otra es la forma de multiplicar una
 * cobertura por cien sin enterarse.
 */
export function deltaCall(e: Entrada): number {
  return Math.exp(-e.r * e.T) * N(d1de(e));
}

export function deltaPut(e: Entrada): number {
  return -Math.exp(-e.r * e.T) * N(-d1de(e));
}

/** Valor mínimo de la opción al vencimiento, descontado. */
function intrinseco(tipo: "call" | "put", { F, K, T, r }: Omit<Entrada, "sigma">): number {
  const bruto = tipo === "call" ? Math.max(0, F - K) : Math.max(0, K - F);
  return Math.exp(-r * T) * bruto;
}

/**
 * Volatilidad implícita: qué volatilidad hace que Black-76 devuelva la prima
 * que se está cotizando.
 *
 * Bisección y no Newton-Raphson. Newton converge en menos vueltas, pero cerca
 * de los extremos la vega se acerca a cero y el método se dispara a
 * volatilidades absurdas o no converge; la bisección no puede salirse del
 * intervalo. Con 60 iteraciones sobre [1 %, 500 %] la precisión queda en el
 * orden de 10⁻¹⁴, muy por debajo de lo que se puede leer en una prima
 * redondeada a la unidad.
 *
 * Devuelve null en vez de un número cuando la prima no admite solución: por
 * debajo del valor intrínseco (una cotización vieja, un strike que no opera
 * hace días) o por encima de lo que puede valer la opción. Un null se ve en
 * pantalla como «no hay dato»; un número inventado se ve como un dato.
 */
export function volImplicita(
  tipo: "call" | "put",
  prima: number,
  base: Omit<Entrada, "sigma">,
): number | null {
  if (!(prima > 0) || !(base.T > 0) || !(base.F > 0) || !(base.K > 0)) return null;

  const precio = (sigma: number) =>
    tipo === "call" ? precioCall({ ...base, sigma }) : precioPut({ ...base, sigma });

  // Fuera de estos límites no hay volatilidad que explique la prima.
  const minimo = intrinseco(tipo, base);
  if (prima <= minimo) return null;

  let bajo = 0.01;
  let alto = 5;
  if (precio(alto) < prima) return null;

  for (let i = 0; i < 60; i++) {
    const medio = (bajo + alto) / 2;
    if (precio(medio) < prima) bajo = medio;
    else alto = medio;
  }
  return (bajo + alto) / 2;
}

/**
 * Delta deducido de la prima cotizada, sin necesidad del tablero del bróker.
 *
 * Es el punto de todo el módulo: entra lo que Barchart sí da —strike y prima—
 * y sale el delta.
 */
export function deltaDesdePrima(
  tipo: "call" | "put",
  prima: number,
  base: Omit<Entrada, "sigma">,
): number | null {
  const sigma = volImplicita(tipo, prima, base);
  if (sigma === null) return null;
  const d = tipo === "call" ? deltaCall({ ...base, sigma }) : deltaPut({ ...base, sigma });
  return Number.isFinite(d) ? d : null;
}

/**
 * Vencimiento de una opción de cacao del ICE: el SEGUNDO VIERNES del mes
 * ANTERIOR al del contrato.
 *
 * Comprobado contra el tablero de StoneX del 3-sep-2026, que trae las tres
 * fechas y los días al vencimiento:
 *
 *     OCT26 → 11-sep-2026 (8 días)
 *     NOV26 → 09-oct-2026 (36 días)
 *     DEC26 → 13-nov-2026 (71 días)
 *
 * Las tres salen exactas con esta regla. Se calcula en vez de pedirse porque
 * Barchart no manda la fecha de vencimiento y sin ella no hay plazo, sin plazo
 * no hay volatilidad implícita y sin volatilidad no hay delta.
 *
 * ADVERTENCIA: un feriado puede correr la fecha un día. Cuando el tablero del
 * bróker trae `expiration`, esa manda y esta regla es solo el respaldo.
 */
const MESES: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12,
};

export function vencimientoOpcion(contractMonth: string): string | null {
  const m = /^([A-Z]{3})(\d{2})$/.exec(contractMonth.trim().toUpperCase());
  if (!m) return null;
  const mes = MESES[m[1]];
  if (!mes) return null;
  const anio = 2000 + Number(m[2]);

  // El mes anterior al del contrato; enero retrocede al diciembre previo.
  const mesPrevio = mes === 1 ? 12 : mes - 1;
  const anioPrevio = mes === 1 ? anio - 1 : anio;

  const primero = new Date(Date.UTC(anioPrevio, mesPrevio - 1, 1));
  // 5 = viernes en `getUTCDay`.
  const alPrimerViernes = (5 - primero.getUTCDay() + 7) % 7;
  const segundoViernes = new Date(
    Date.UTC(anioPrevio, mesPrevio - 1, 1 + alPrimerViernes + 7),
  );
  return segundoViernes.toISOString().slice(0, 10);
}

/** Años entre dos fechas ISO, en base 365. Null si el vencimiento ya pasó. */
export function anosHasta(desde: string, vencimiento: string): number | null {
  const a = new Date(`${desde}T00:00:00Z`).getTime();
  const b = new Date(`${vencimiento}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const dias = (b - a) / 86_400_000;
  // El día del vencimiento la opción ya no tiene plazo: el delta deja de estar
  // definido y devolver «casi cero» daría una cobertura falsamente enorme.
  return dias > 0 ? dias / 365 : null;
}
