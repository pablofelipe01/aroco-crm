/**
 * Diferenciales de cacao físico por origen, del reporte semanal de StoneX.
 *
 * Un diferencial es la prima o el descuento que paga un comprador por el cacao
 * de un origen sobre el futuro de ICE. Es lo que convierte «el cacao está a
 * 6.600» en «mi cacao vale 6.600 más X».
 *
 * La forma del PDF, comprobada contra el reporte del 20-ago-2026:
 *
 *   ["Ivory Coast", "13-Aug", "20-Aug", "Change", "GBP", "EUR", "USD"]
 *   ["CIF N. Europe", "£ 380", "£ 450", "£ 70", "£ 4,786", "€ 5,587", "$ 6,521"]
 *   ["Ghana"]
 *   ["ExW US", "$ 850", "$ 825", "$ (25)", …]
 *
 * Tres cosas que no se ven a primera vista y que importan:
 *
 *   · El origen es un ENCABEZADO DE SECCIÓN, no una celda de cada fila. Cada
 *     origen tiene varias filas, una por incoterm.
 *   · El diferencial vigente es la SEGUNDA columna, no la primera: la primera
 *     es el de la semana pasada. Tomar la primera daría un número viejo con
 *     toda la apariencia de estar al día.
 *   · La moneda cambia por fila: «£ 450» en CIF Europa y «$ 450» en ExW US.
 *     No hay una unidad única para la tabla.
 *
 * Colombia no está en el reporte. Se estima dentro del tramo entre dos
 * referencias, y esa fila queda marcada como estimación de AROCO — nunca se
 * mezcla sin distinción con las cotizaciones. Un número que pusimos nosotros no
 * puede citarse en una negociación como si fuera mercado.
 */

/**
 * Dónde cae Colombia dentro del tramo: 0 = sobre la referencia barata,
 * 1 = sobre la cara. 0,775 es el centro del 75-80 % acordado con Comercial.
 */
export const POSICION_COLOMBIA = 0.775;

export type FilaDiferencial = {
  origen: string;
  /** Incoterm: «FOB Guayaquil», «ExW US», «CIF N. Europe»… */
  incoterm: string;
  valor: number;
  moneda: string;
  /** El de la semana anterior, para poder mostrar el cambio. */
  valorAnterior: number | null;
};

export type Matriz = string[][];

/** «$ (250)» → −250 · «£ 4,786» → 4786 · «£ -» → null (sin cambio). */
export function numero(v: string): number | null {
  const s = (v ?? "").trim();
  if (!s || !/\d/.test(s)) return null;
  const negativo = /\(.*\)/.test(s);
  const limpio = s.replace(/[^\d.]/g, "");
  if (!limpio) return null;
  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}

/** El símbolo de moneda de la celda; «USD» por defecto. */
export function moneda(v: string): string {
  if (v.includes("£")) return "GBP";
  if (v.includes("€")) return "EUR";
  return "USD";
}

const esMonetaria = (c: string) => /[£$€]/.test(c);

/**
 * Separa origen e incoterm de una etiqueta de fila.
 *
 * En casi todas las secciones la etiqueta ES el incoterm («ExW US») y el origen
 * viene del encabezado. Pero en «Other Origins» la fila lleva las dos cosas
 * pegadas: «Peru Grade 1 ExW US». Sin separarlas, dos filas que en realidad son
 * el mismo incoterm parecen distintas, y la comprobación de comparabilidad
 * —la que evita interpolar entre un FOB y un ExW— no serviría de nada.
 */
export function separarIncoterm(etq: string): { origen: string | null; incoterm: string } {
  const m = /^(.*?)\s*\b((?:ExW|FOB|CIF|FCA|CFR)\b.*)$/i.exec(etq.trim());
  if (!m) return { origen: null, incoterm: etq.trim() };
  const antes = m[1].trim();
  return { origen: antes || null, incoterm: m[2].trim() };
}
const NO_ORIGEN = /^(source|miami|cocoa|differential|price|futures|exchange rates|a)$/i;

/**
 * Lee la matriz del PDF a filas de origen + incoterm.
 *
 * El índice de la columna vigente NO se fija: se deduce del encabezado, que
 * trae «13-Aug · 20-Aug · Change». La vigente es la anterior a «Change». Así,
 * si algún día StoneX agrega una columna, el parseo se acomoda en vez de
 * empezar a leer la de al lado en silencio — que es exactamente lo que
 * corrompió el inventario tres veces.
 */
export function parsearMatriz(matriz: Matriz): {
  filas: FilaDiferencial[];
  ignoradas: string[];
} {
  const filas: FilaDiferencial[] = [];
  const ignoradas: string[] = [];

  let origen: string | null = null;
  // Posición del diferencial vigente entre las celdas monetarias de una fila.
  let idxVigente = 1;

  for (const cruda of matriz ?? []) {
    const celdas = (cruda ?? []).map((c) => (c ?? "").trim());
    const llenas = celdas.filter((c) => c !== "");
    if (llenas.length === 0) continue;

    // Encabezado de columnas. Su primera celda es además el primer origen.
    const iChange = celdas.findIndex((c) => /^change$/i.test(c));
    if (iChange > 0 && celdas.some((c) => /^\d{1,2}-[A-Za-z]{3}$/.test(c))) {
      idxVigente = Math.max(0, iChange - 1 - 1); // menos la celda del origen
      const primero = celdas[0];
      if (primero && !NO_ORIGEN.test(primero)) origen = primero;
      continue;
    }

    // A partir de «FUTURES» empieza otra tabla dentro del mismo PDF.
    if (llenas.some((c) => /^(futures|exchange rates)$/i.test(c))) break;

    const monetarias = celdas.filter(esMonetaria);

    // Encabezado de sección: una sola celda, sin cifras. Cambia el origen.
    if (llenas.length === 1 && monetarias.length === 0) {
      const t = llenas[0];
      if (NO_ORIGEN.test(t) || /^[A-Za-z]+ \d{1,2}(st|nd|rd|th)?, \d{4}$/.test(t)) {
        ignoradas.push(t);
      } else {
        origen = t;
      }
      continue;
    }

    if (monetarias.length === 0 || !origen) {
      ignoradas.push(llenas.join(" | "));
      continue;
    }

    const cruda2 = celdas.find((c) => c !== "" && !esMonetaria(c)) ?? "";
    const { origen: propio, incoterm } = separarIncoterm(cruda2);
    const vigente = monetarias[idxVigente];
    const anterior = idxVigente > 0 ? monetarias[idxVigente - 1] : null;
    const valor = numero(vigente ?? "");
    if (valor === null) {
      ignoradas.push(llenas.join(" | "));
      continue;
    }

    filas.push({
      // Si la fila trae su propio origen —«Peru Grade 1 ExW US» dentro de
      // «Other Origins»— manda ese, no el de la sección.
      origen: propio ?? origen,
      incoterm,
      valor,
      moneda: moneda(vigente),
      valorAnterior: anterior ? numero(anterior) : null,
    });
  }

  return { filas, ignoradas };
}

/**
 * Sobre qué base queda el estimado de Colombia, dicho como se diría aquí.
 *
 * Pedido en la revisión del 1-sep-2026: que Colombia se muestre etiquetada
 * «FOB Cartagena — estimado AROCO». La etiqueta se DEDUCE del incoterm que
 * comparten las dos referencias en vez de escribirse fija, porque hoy esas
 * referencias son ExW US y un estimado ExW rotulado FOB estaría unos 350
 * dólares por tonelada por encima de lo que dice ser — que es la clase de
 * número que se cita en una negociación y termina en pérdida.
 *
 * Cuando la base sí es FOB, el puerto es el nuestro: un diferencial FOB
 * aplicado a cacao colombiano sale de Cartagena, no de Guayaquil.
 *
 * Qué filas se comparan lo decide Comercial desde `ajustes_mercado` (ver
 * migración 0067), así que el día que se cambien a un par FOB la etiqueta pasa
 * sola a «FOB Cartagena».
 */
export function baseColombia(incoterm: string | null): string | null {
  if (!incoterm) return null;
  return /^\s*FOB\b/i.test(incoterm) ? "FOB Cartagena" : incoterm.trim();
}

/** Etiqueta legible de una fila: «Ecuador Grade 2 · FOB Guayaquil». */
export const etiqueta = (f: FilaDiferencial) =>
  f.incoterm && f.incoterm !== f.origen ? `${f.origen} · ${f.incoterm}` : f.origen;

/** Busca por texto libre sobre origen + incoterm, tolerando mayúsculas. */
export function buscarFila(filas: FilaDiferencial[], texto: string): FilaDiferencial | null {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const partes = norm(texto).split(" ").filter(Boolean);
  const puntua = (f: FilaDiferencial) => {
    const h = norm(`${f.origen} ${f.incoterm}`);
    return partes.every((p) => h.includes(p)) ? h.length : -1;
  };
  // Entre varias coincidencias gana la más específica (la etiqueta más corta),
  // para que «peru grade 1» no traiga una fila de otro incoterm por azar.
  let mejor: FilaDiferencial | null = null;
  let mejorLargo = Infinity;
  for (const f of filas) {
    const p = puntua(f);
    if (p >= 0 && p < mejorLargo) {
      mejor = f;
      mejorLargo = p;
    }
  }
  return mejor;
}

export type EstimacionColombia = {
  valor: number;
  moneda: string;
  posicion: number;
  referenciaBaja: { etiqueta: string; valor: number };
  referenciaAlta: { etiqueta: string; valor: number };
  /** Incoterm común a las dos referencias, o null si no coinciden. */
  incoterm: string | null;
  /** Advertencia cuando las referencias no son comparables. */
  advertencia: string | null;
  metodo: string;
};

/**
 * Ubica a Colombia dentro del tramo entre dos referencias.
 *
 * `posicion` va sobre el TRAMO, no sobre la tabla: 0,775 es «77,5 % del camino
 * entre la barata y la cara», no el percentil 77,5 de todos los orígenes.
 *
 * Cuál es la cara se decide con los VALORES, no con el nombre: en el reporte
 * del 20-ago Perú Grade 1 ExW US está en +281 y Ecuador Grade 2 ExW US en +320,
 * pero FOB Guayaquil está en −30. Fijar la cara por nombre dejaría a Colombia
 * del lado equivocado el día que se inviertan.
 */
export function estimarColombia(
  filas: FilaDiferencial[],
  refBaja: string,
  refAlta: string,
  posicion = POSICION_COLOMBIA,
): EstimacionColombia | { error: string } {
  if (!(posicion >= 0 && posicion <= 1)) {
    return { error: `La posición debe ir entre 0 y 1; llegó ${posicion}.` };
  }
  const a = buscarFila(filas, refBaja);
  const b = buscarFila(filas, refAlta);
  if (!a) return { error: `No se encontró «${refBaja}» en el reporte.` };
  if (!b) return { error: `No se encontró «${refAlta}» en el reporte.` };

  if (a.moneda !== b.moneda) {
    // Interpolar entre libras y dólares daría un número sin significado.
    return {
      error: `«${etiqueta(a)}» está en ${a.moneda} y «${etiqueta(b)}» en ${b.moneda}: no son comparables.`,
    };
  }

  const bajo = a.valor <= b.valor ? a : b;
  const alto = a.valor <= b.valor ? b : a;
  const valor = bajo.valor + posicion * (alto.valor - bajo.valor);

  // Mezclar incoterms mete el flete en lo que debería ser prima de origen: en
  // el reporte del 20-ago, Ecuador Grade 2 vale −30 FOB Guayaquil y +320 ExW
  // US. Son 350 dólares de diferencia que no tienen nada que ver con la
  // calidad del grano.
  const mismoIncoterm = a.incoterm === b.incoterm;
  const advertencia = mismoIncoterm
    ? null
    : `Las referencias tienen incoterms distintos (${a.incoterm} vs ${b.incoterm}). ` +
      `La diferencia entre ellas incluye logística, no solo prima de origen.`;

  return {
    valor: Math.round(valor * 100) / 100,
    moneda: bajo.moneda,
    posicion,
    referenciaBaja: { etiqueta: etiqueta(bajo), valor: bajo.valor },
    referenciaAlta: { etiqueta: etiqueta(alto), valor: alto.valor },
    incoterm: mismoIncoterm ? a.incoterm : null,
    advertencia,
    metodo:
      `Estimación AROCO: ${(posicion * 100).toFixed(1)} % del tramo entre ` +
      `${etiqueta(bajo)} (${bajo.valor}) y ${etiqueta(alto)} (${alto.valor}), ` +
      `en ${bajo.moneda}. No es una cotización de mercado.`,
  };
}
