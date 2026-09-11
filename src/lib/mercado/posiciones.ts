/**
 * La posición de hoy, no la del cierre de ayer.
 *
 * EL PROBLEMA. Las posiciones del CRM salen del extracto diario de StoneX, que
 * es de cierre. Álvaro abre dos contratos a media mañana, entra al CRM y no
 * los ve: la pantalla le muestra lo que había ayer. Quedó anotado el 1-sep y
 * otra vez el 9-sep, cuando abrió dos contratos que sí aparecían en el tablero
 * del bróker y no en el CRM.
 *
 * LA REGLA. Un movimiento registrado a mano vale mientras el extracto no haya
 * llegado hasta esa fecha. En cuanto entra el extracto del día en que se hizo,
 * el movimiento deja de aplicarse solo: lo que dice la contraparte con la que
 * se liquida manda sobre lo que alguien anotó.
 *
 * Esto se elige por encima de un «marcar como conciliado» a mano. Una marca
 * hay que acordarse de ponerla, y el día que se olvide el movimiento se suma
 * DOS VECES —una por el registro y otra por el extracto— y la pantalla dice
 * que hay el doble de cobertura de la que hay. Con una fecha eso no puede
 * pasar.
 *
 * LO QUE NO HACE. Un movimiento superado no se borra ni se esconde: se marca y
 * se enseña aparte, para poder comprobar que el extracto de verdad lo recogió.
 * El 1-sep pasó justo lo contrario —un futuro vendido que se había cerrado
 * seguía apareciendo abierto en el extracto de la mañana— y esa discrepancia
 * hay que poder verla, no taparla.
 */

export type Lado = "largo" | "corto";
export type Accion = "abre" | "cierra";
export type TipoInstrumento = "FUT" | "CALL" | "PUT";

export type MovimientoManual = {
  id: string;
  fecha: string;
  accion: Accion;
  tipo: TipoInstrumento;
  lado: Lado;
  contrato: string;
  strike: number | null;
  contratos: number;
};

/** La forma en que el resto del módulo ya lee una posición del bróker. */
export type Posicion = {
  option_type: string | null;
  long_qty: number;
  short_qty: number;
  strike: number | null;
  contract_month: string | null;
};

/**
 * `option_type` del extracto para cada instrumento. El extracto deja el campo
 * en null cuando la fila es un futuro, y esa convención hay que respetarla:
 * el resto del módulo filtra por `option_type === "PUT"` para medir cobertura.
 */
function tipoDePosicion(tipo: TipoInstrumento): string | null {
  return tipo === "FUT" ? null : tipo;
}

/** Dos filas son la misma posición si coinciden instrumento, mes y strike. */
function claveDe(
  optionType: string | null,
  contrato: string | null,
  strike: number | null,
): string {
  return `${(optionType ?? "FUT").toUpperCase()}|${(contrato ?? "").toUpperCase()}|${strike ?? ""}`;
}

export type PosicionEfectiva = Posicion & {
  /** Contratos que vienen del extracto, antes de los movimientos a mano. */
  delExtracto: { long: number; short: number };
  /** Cuánto movió el registro manual cada lado. Cero si no lo tocó. */
  ajusteManual: { long: number; short: number };
};

export type ResultadoPosiciones = {
  posiciones: PosicionEfectiva[];
  /** Movimientos que están modificando la posición ahora mismo. */
  aplicados: MovimientoManual[];
  /**
   * Movimientos que el extracto ya debería recoger. Se enseñan para poder
   * comprobarlo: si el extracto no los trae, hay una discrepancia con el
   * bróker y esa es información, no ruido.
   */
  superados: MovimientoManual[];
};

/**
 * ¿Este movimiento todavía manda sobre el extracto?
 *
 * Sin extracto ninguno, todo movimiento vale. Con extracto, solo los
 * posteriores a su fecha: el del propio día del extracto ya debería venir
 * dentro de él.
 */
export function vigente(
  m: { fecha: string },
  fechaExtracto: string | null,
): boolean {
  if (!fechaExtracto) return true;
  return m.fecha > fechaExtracto;
}

/**
 * Aplica los movimientos manuales sobre las posiciones del extracto.
 *
 * `abre` suma al lado indicado y `cierra` resta del mismo lado. Se describe el
 * LADO DE LA POSICIÓN y no la dirección de la orden porque es como se habla:
 * «cerré el futuro vendido» baja el corto, no sube el largo. Decirlo al revés
 * obligaría a traducir mentalmente en el peor momento.
 */
export function posicionEfectiva(
  extracto: Posicion[],
  movimientos: MovimientoManual[],
  fechaExtracto: string | null,
): ResultadoPosiciones {
  const aplicados: MovimientoManual[] = [];
  const superados: MovimientoManual[] = [];
  for (const m of movimientos) {
    (vigente(m, fechaExtracto) ? aplicados : superados).push(m);
  }

  const mapa = new Map<string, PosicionEfectiva>();
  for (const p of extracto) {
    const clave = claveDe(p.option_type, p.contract_month, p.strike);
    const previa = mapa.get(clave);
    // El extracto puede traer la misma posición en varias filas —distintas
    // fechas de operación— y hay que sumarlas, no quedarse con la última.
    if (previa) {
      previa.long_qty += p.long_qty;
      previa.short_qty += p.short_qty;
      previa.delExtracto.long += p.long_qty;
      previa.delExtracto.short += p.short_qty;
      continue;
    }
    mapa.set(clave, {
      ...p,
      delExtracto: { long: p.long_qty, short: p.short_qty },
      ajusteManual: { long: 0, short: 0 },
    });
  }

  for (const m of aplicados) {
    const optionType = tipoDePosicion(m.tipo);
    const clave = claveDe(optionType, m.contrato, m.strike);
    const fila =
      mapa.get(clave) ??
      ({
        option_type: optionType,
        long_qty: 0,
        short_qty: 0,
        strike: m.strike,
        contract_month: m.contrato,
        delExtracto: { long: 0, short: 0 },
        ajusteManual: { long: 0, short: 0 },
      } satisfies PosicionEfectiva);

    const signo = m.accion === "abre" ? 1 : -1;
    const delta = signo * m.contratos;
    if (m.lado === "largo") {
      fila.long_qty += delta;
      fila.ajusteManual.long += delta;
    } else {
      fila.short_qty += delta;
      fila.ajusteManual.short += delta;
    }
    mapa.set(clave, fila);
  }

  const posiciones = [...mapa.values()]
    // Una posición que queda en cero por los dos lados ya no existe: dejarla
    // llenaría la pantalla de filas cerradas. Las que quedan en NEGATIVO sí se
    // conservan: significan que se registró un cierre mayor que lo que decía
    // el extracto, y eso es un error que hay que ver, no esconder.
    .filter((p) => p.long_qty !== 0 || p.short_qty !== 0)
    .sort((a, b) => {
      const t = (a.option_type ?? "FUT").localeCompare(b.option_type ?? "FUT");
      if (t !== 0) return t;
      const c = (a.contract_month ?? "").localeCompare(b.contract_month ?? "");
      if (c !== 0) return c;
      return (a.strike ?? 0) - (b.strike ?? 0);
    });

  return { posiciones, aplicados, superados };
}

/** Etiqueta legible: «PUT DEC26 6.000» · «Futuro DEC26». */
export function etiquetaPosicion(p: {
  option_type: string | null;
  contract_month: string | null;
  strike: number | null;
}): string {
  const mes = p.contract_month ?? "—";
  if (!p.option_type) return `Futuro ${mes}`;
  return `${p.option_type.toUpperCase()} ${mes}${
    p.strike === null ? "" : ` ${p.strike.toLocaleString("es-CO")}`
  }`;
}
