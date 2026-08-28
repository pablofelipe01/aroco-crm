/**
 * Diferenciales de cacao físico por origen, del reporte semanal de StoneX.
 *
 * Un diferencial es la prima o el descuento que paga un comprador por el cacao
 * de un origen, sobre el futuro de ICE. Es lo que convierte «el cacao está a
 * 6.600» en «mi cacao vale 6.600 más X».
 *
 * Colombia NO está en el reporte. Se estima ubicándola dentro del tramo entre
 * Perú y Ecuador, y esa fila queda marcada como estimación de AROCO — nunca se
 * mezcla sin distinción con las cotizaciones de StoneX. Un número que pusimos
 * nosotros no puede citarse en una negociación como si fuera mercado.
 */

/** Referencias del tramo, acordadas con Comercial. */
export const REFERENCIA_BAJA = "Peru grade 1";
export const REFERENCIA_ALTA = "Guayaquil grade 2";

/**
 * Dónde cae Colombia dentro del tramo: 0 = sobre la referencia barata,
 * 1 = sobre la cara. 0,775 es el centro del 75-80 % acordado.
 *
 * Es un parámetro y no una constante enterrada porque es un juicio de mercado:
 * cuando Comercial lo mueva, tiene que poder hacerlo sin tocar código.
 */
export const POSICION_COLOMBIA = 0.775;

export type FilaDiferencial = {
  origen: string;
  grado: string | null;
  /** Valor del diferencial, en la unidad del reporte. */
  valor: number;
  unidad: string;
};

export type Matriz = string[][];

const NUM = /^-?\s*[\d.,]+$/;

/** Convierte «+150», «(75)», «-1,250» a número. Los paréntesis son negativos. */
export function numero(v: string): number | null {
  const s = (v ?? "").trim();
  if (!s || !/\d/.test(s)) return null;

  const negativoPorParentesis = /^\(.*\)$/.test(s);
  const limpio = s.replace(/[()+\s]/g, "").replace(/,/g, "");
  if (!NUM.test(limpio.replace(/,/g, ""))) {
    const n = Number(limpio);
    if (!Number.isFinite(n)) return null;
    return negativoPorParentesis ? -Math.abs(n) : n;
  }
  const n = Number(limpio);
  if (!Number.isFinite(n)) return null;
  return negativoPorParentesis ? -Math.abs(n) : n;
}

/**
 * Saca las filas de origen de la matriz del PDF.
 *
 * El PDF viene sin líneas de grilla, así que la matriz que entrega el agente es
 * lo que él pudo agrupar por coordenadas. No se asume qué columna es cuál: se
 * toma la primera celda con texto como etiqueta del origen y el PRIMER número
 * de la fila como el diferencial. Adivinar índices fijos es exactamente lo que
 * corrompió el inventario tres veces.
 *
 * Lo que no se pueda leer se devuelve en `ignoradas` en vez de descartarse en
 * silencio.
 */
export function parsearMatriz(
  matriz: Matriz,
  unidad = "USD/t",
): { filas: FilaDiferencial[]; ignoradas: string[] } {
  const filas: FilaDiferencial[] = [];
  const ignoradas: string[] = [];

  for (const fila of matriz ?? []) {
    const celdas = (fila ?? []).map((c) => (c ?? "").trim()).filter((c) => c !== "");
    if (celdas.length === 0) continue;

    const etiqueta = celdas[0];
    // Encabezados y notas al pie: no empiezan por un nombre de origen seguido
    // de números.
    const valores = celdas.slice(1).map(numero).filter((n): n is number => n !== null);

    if (!/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(etiqueta) || valores.length === 0) {
      ignoradas.push(celdas.join(" | "));
      continue;
    }

    const { origen, grado } = separarGrado(etiqueta);
    filas.push({ origen, grado, valor: valores[0], unidad });
  }

  return { filas, ignoradas };
}

/** «Guayaquil grade 2» → origen «Guayaquil», grado «grade 2». */
export function separarGrado(etiqueta: string): { origen: string; grado: string | null } {
  const m = /^(.*?)\s+(grade\s*\w+|gr\.?\s*\w+|ASSPS|ASSS|CCN51)\s*$/i.exec(etiqueta.trim());
  if (!m) return { origen: etiqueta.trim(), grado: null };
  return { origen: m[1].trim(), grado: m[2].trim() };
}

/** Busca una fila por texto, tolerando mayúsculas y espacios de más. */
export function buscarFila(filas: FilaDiferencial[], texto: string): FilaDiferencial | null {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
  const objetivo = norm(texto);
  return (
    filas.find((f) => norm(`${f.origen} ${f.grado ?? ""}`) === objetivo) ??
    filas.find((f) => norm(`${f.origen} ${f.grado ?? ""}`).includes(objetivo)) ??
    null
  );
}

export type EstimacionColombia = {
  valor: number;
  unidad: string;
  posicion: number;
  referenciaBaja: { etiqueta: string; valor: number };
  referenciaAlta: { etiqueta: string; valor: number };
  /** Cómo se obtuvo, para poder mostrarlo junto al número. */
  metodo: string;
};

/**
 * Ubica a Colombia dentro del tramo Perú–Ecuador.
 *
 * `posicion` va sobre el tramo, no sobre la tabla entera: 0,775 significa
 * «77,5 % del camino entre la referencia barata y la cara», no «percentil 77,5
 * de todos los orígenes». Son dos cosas distintas y dan números distintos.
 *
 * Cuál referencia es la barata se decide con los valores, no por el nombre: si
 * un mes Perú cotiza por encima de Ecuador, el tramo se da vuelta solo y
 * Colombia sigue quedando cerca del caro, que es la intención.
 */
export function estimarColombia(
  filas: FilaDiferencial[],
  posicion = POSICION_COLOMBIA,
  refBaja = REFERENCIA_BAJA,
  refAlta = REFERENCIA_ALTA,
): EstimacionColombia | { error: string } {
  if (posicion < 0 || posicion > 1) {
    return { error: `La posición debe ir entre 0 y 1; llegó ${posicion}.` };
  }
  const a = buscarFila(filas, refBaja);
  const b = buscarFila(filas, refAlta);
  if (!a) return { error: `No se encontró «${refBaja}» en el reporte.` };
  if (!b) return { error: `No se encontró «${refAlta}» en el reporte.` };

  const bajo = a.valor <= b.valor ? a : b;
  const alto = a.valor <= b.valor ? b : a;
  const etq = (f: FilaDiferencial) => `${f.origen}${f.grado ? " " + f.grado : ""}`;

  const valor = bajo.valor + posicion * (alto.valor - bajo.valor);

  return {
    valor: Math.round(valor * 100) / 100,
    unidad: bajo.unidad,
    posicion,
    referenciaBaja: { etiqueta: etq(bajo), valor: bajo.valor },
    referenciaAlta: { etiqueta: etq(alto), valor: alto.valor },
    metodo:
      `Estimación AROCO: ${(posicion * 100).toFixed(1)} % del tramo entre ` +
      `${etq(bajo)} (${bajo.valor}) y ${etq(alto)} (${alto.valor}). ` +
      `No es una cotización de mercado.`,
  };
}
