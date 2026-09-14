/**
 * Traducción de una posición del extracto de StoneX.
 *
 * EL FALLO QUE ARREGLA. El CRM leía `long_qty`, `short_qty`, `contract_month` y
 * `settle_price`. El MCP nunca ha mandado esos nombres: manda `qty`,
 * `direction`, `contract` y `open_price`. Ninguno coincidía, así que cada
 * posición se guardaba con todo en cero y con la fecha de operación veinte
 * años atrás. En pantalla no era «no hay posiciones»: era «hay N posiciones»
 * sin contrato ni cantidad, que se ve igual que no tener nada.
 *
 * Álvaro lo reportó dos veces —el 1 y el 9 de septiembre— y las dos se
 * atribuyó al desfase del extracto diario. El desfase existe, pero encima de
 * él había esto.
 *
 * LO QUE NO SE ADIVINA. Cuando el extracto no dice de qué lado está la
 * posición y tampoco hay con qué deducirlo, se devuelve sin cantidades y se
 * declara. Poner un lado al azar convierte una cobertura en una exposición
 * justo en la pantalla que sirve para decidir si hace falta cubrirse.
 */

/** Toneladas por contrato de cacao en ICE. */
export const TONELADAS_POR_CONTRATO = 10;

export type PosicionCruda = {
  trade_date?: unknown;
  card?: unknown;
  qty?: unknown;
  direction?: unknown;
  contract?: unknown;
  open_price?: unknown;
  close_price?: unknown;
  avg_price?: unknown;
  ote_amount?: unknown;
  ote_sign?: unknown;
};

const txt = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  return s === "" ? null : s;
};

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = txt(v);
  if (s === null) return null;
  const n = Number(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const MESES: Record<string, string> = {
  JAN: "JAN", FEB: "FEB", MAR: "MAR", APR: "APR", MAY: "MAY", JUN: "JUN",
  JUL: "JUL", AUG: "AUG", SEP: "SEP", OCT: "OCT", NOV: "NOV", DEC: "DEC",
};

/** «DEC 26 ICE COCOA» → «DEC26». */
export function mesDeContrato(contrato: string | null): string | null {
  if (!contrato) return null;
  const m = /\b([A-Z]{3})\s*(\d{2})\b/i.exec(contrato.trim());
  if (!m) return null;
  const mes = MESES[m[1].toUpperCase()];
  return mes ? `${mes}${m[2]}` : null;
}

/**
 * Si la línea es una opción, cuál y a qué strike.
 *
 * Hoy la cuenta solo tiene futuros, pero el collar de Álvaro vuelve en cuanto
 * se arme otro y entonces el extracto traerá «DEC 26 ICE COCOA PUT 6000». Un
 * futuro devuelve las dos cosas en null, que es la convención que el resto del
 * módulo ya espera: `option_type` nulo significa futuro.
 */
export function instrumentoDeContrato(contrato: string | null): {
  option_type: "CALL" | "PUT" | null;
  strike: number | null;
} {
  if (!contrato) return { option_type: null, strike: null };
  const m = /\b(CALL|PUT)\b/i.exec(contrato);
  if (!m) return { option_type: null, strike: null };
  const tipo = m[1].toUpperCase() as "CALL" | "PUT";
  // El strike es el número que sigue al tipo; el del mes ya quedó descartado
  // porque se busca DESPUÉS de la palabra.
  const resto = contrato.slice(m.index + m[0].length);
  const s = /(\d[\d.,]*)/.exec(resto);
  const strike = s ? Number(s[1].replace(/,/g, "")) : null;
  return { option_type: tipo, strike: Number.isFinite(strike) ? strike : null };
}

export type Lado = "long" | "short" | null;

/**
 * De qué lado está la posición.
 *
 * Si el extracto lo dice, se cree. Si no, se deduce del resultado: una
 * posición LARGA gana cuando el precio sube. Con el precio de apertura, el de
 * cierre y si el flotante es ganancia o pérdida, el lado queda determinado.
 *
 * Si no alcanza para deducirlo, se devuelve null y quien llama decide — aquí
 * no se inventa un lado.
 */
export function ladoDe(p: PosicionCruda): Lado {
  const dicho = txt(p.direction)?.toLowerCase();
  if (dicho === "long" || dicho === "short") return dicho;

  const apertura = num(p.open_price);
  const cierre = num(p.close_price);
  const signo = txt(p.ote_sign)?.toLowerCase();
  if (apertura === null || cierre === null || !signo) return null;
  if (cierre === apertura) return null;

  const subio = cierre > apertura;
  const gano = signo === "gain";
  // Subió y ganó → estaba largo. Subió y perdió → estaba corto.
  return subio === gano ? "long" : "short";
}

/**
 * Escala del precio, comprobada contra el flotante.
 *
 * El extracto trae el cacao como «60,3» cuando el contrato cotiza a 6.030
 * USD/t: se pierde un factor de cien por el camino. En vez de multiplicar por
 * cien y confiar, se COMPRUEBA con una identidad que tiene que cumplirse:
 *
 *     |apertura − cierre| × escala × 10 t × contratos = flotante
 *
 * Con los datos del 11-sep: |60,3 − 59,61| × 100 × 10 × 1 = 690, y el extracto
 * dice 690. Si ninguna escala cuadra, se devuelve null y el precio se queda
 * sin guardar: un precio de cacao con dos ceros de menos, en una pantalla que
 * se usa para decidir coberturas, es peor que una celda vacía.
 */
export function escalaDePrecio(p: PosicionCruda): number | null {
  const apertura = num(p.open_price);
  const cierre = num(p.close_price);
  const flotante = num(p.ote_amount);
  const contratos = num(p.qty);
  if (apertura === null || cierre === null || flotante === null) return null;
  if (!contratos || contratos <= 0) return null;

  const diferencia = Math.abs(apertura - cierre);
  if (diferencia === 0) return null;

  for (const escala of [1, 10, 100, 1000]) {
    const esperado = diferencia * escala * TONELADAS_POR_CONTRATO * contratos;
    // Una tolerancia del 1 % absorbe el redondeo de las dos cifras del
    // extracto sin dejar pasar una escala equivocada, que se aparta diez veces.
    if (Math.abs(esperado - Math.abs(flotante)) <= Math.abs(flotante) * 0.01) {
      return escala;
    }
  }
  return null;
}

/**
 * Fecha de operación.
 *
 * Llega como «9/11/6»: mes, día y UN SOLO DÍGITO de año. Con ese dígito no se
 * puede saber el año, así que se toma el del extracto y se comprueba que
 * termine igual. Antes se interpretaba tal cual y quedaba en 2006 — veinte
 * años atrás.
 */
export function fechaOperacion(
  cruda: unknown,
  fechaExtracto: string,
): string | null {
  const s = txt(cruda);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{1,4})$/.exec(s);
  if (!m) return null;
  const [, mes, dia, anioCrudo] = m;

  const anioExtracto = Number(fechaExtracto.slice(0, 4));
  if (!Number.isFinite(anioExtracto)) return null;

  let anio: number;
  if (anioCrudo.length === 4) anio = Number(anioCrudo);
  else if (anioCrudo.length === 2) anio = 2000 + Number(anioCrudo);
  else {
    // Un solo dígito: el año del extracto tiene que terminar igual. Si no,
    // la fecha no se puede reconstruir y no se inventa.
    if (anioExtracto % 10 !== Number(anioCrudo)) return null;
    anio = anioExtracto;
  }

  const dd = String(Number(dia)).padStart(2, "0");
  const mm = String(Number(mes)).padStart(2, "0");
  if (Number(mes) < 1 || Number(mes) > 12 || Number(dia) < 1 || Number(dia) > 31) {
    return null;
  }
  return `${anio}-${mm}-${dd}`;
}

export type PosicionTraducida = {
  trade_date: string | null;
  card: string | null;
  long_qty: number;
  short_qty: number;
  option_type: string | null;
  contract_month: string | null;
  exchange: string;
  strike: number | null;
  settle_price: number | null;
  market_value: number | null;
  dr_cr: string | null;
  /** Por qué la posición quedó sin cantidades, cuando queda sin ellas. */
  sinLado: boolean;
};

export function traducirPosicion(
  p: PosicionCruda,
  fechaExtracto: string,
): PosicionTraducida {
  const contrato = txt(p.contract);
  const { option_type, strike } = instrumentoDeContrato(contrato);
  const contratos = Math.abs(Math.trunc(num(p.qty) ?? 0));
  const lado = ladoDe(p);

  const escala = escalaDePrecio(p);
  const cierre = num(p.close_price);
  const apertura = num(p.open_price);
  const base = cierre ?? apertura;
  const settle = escala !== null && base !== null ? base * escala : null;

  const flotante = num(p.ote_amount);
  const signo = txt(p.ote_sign)?.toLowerCase();
  const market_value =
    flotante === null ? null : signo === "loss" ? -Math.abs(flotante) : Math.abs(flotante);

  return {
    trade_date: fechaOperacion(p.trade_date, fechaExtracto),
    card: txt(p.card),
    long_qty: lado === "long" ? contratos : 0,
    short_qty: lado === "short" ? contratos : 0,
    option_type,
    contract_month: mesDeContrato(contrato),
    // El extracto no trae la bolsa aparte: va dentro del nombre del contrato.
    exchange: contrato?.replace(/^[A-Z]{3}\s*\d{2}\s*/i, "").trim() || "ICE COCOA",
    strike,
    settle_price: settle,
    market_value,
    dr_cr: market_value !== null && market_value < 0 ? "DR" : "CR",
    sinLado: lado === null && contratos > 0,
  };
}
