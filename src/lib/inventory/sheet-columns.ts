/**
 * Localiza las columnas de la hoja de inventario por su ENCABEZADO, no por su
 * posición.
 *
 * La hoja ha cambiado de forma tres veces. La última vez alguien insertó una
 * columna ("SELECION SI/NO") en la posición 14 y todo lo de la derecha se
 * corrió una casilla: la clasificación, la calidad y los seis bloques de
 * salida quedaron leyendo el campo de al lado. El sync siguió diciendo "ok"
 * mientras escribía basura —empresas en el campo de la remisión, fechas
 * vacías, 20 millones de kilos despachados— porque leer una columna
 * equivocada no falla, solo miente.
 *
 * Con índices fijos eso vuelve a pasar a la próxima inserción. Buscando por
 * nombre, una columna nueva es inofensiva; y si un encabezado ESPERADO
 * desaparece, se lanza un error para que la corrida falle a la vista en vez de
 * corromper los datos en silencio.
 */

/** minúsculas, sin tildes y con espacios colapsados, para comparar encabezados. */
export function normalizarEncabezado(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rellena a la derecha los huecos de las celdas combinadas del encabezado. */
function rellenar(fila: string[], ancho: number): string[] {
  const out: string[] = [];
  let ultimo = "";
  for (let i = 0; i < ancho; i++) {
    const v = (fila[i] ?? "").trim();
    if (v) ultimo = v;
    out.push(ultimo);
  }
  return out;
}

export type MapaColumnas = {
  /** Índice por clave "subgrupo|hoja" (o solo "subgrupo" si no hay hoja). */
  indice: Map<string, number>;
  /** Bloques SALIDA encontrados, en orden, con el índice de cada campo. */
  salidas: { etiqueta: string; campos: Map<string, number> }[];
  ancho: number;
};

/**
 * Construye el mapa a partir de las filas de encabezado.
 * `filaSub` trae los subgrupos (CANTIDAD INGRESADA, SALIDA 1…) y `filaHoja`
 * los nombres finales (PREMIUM, FECHA…). Una columna sin hoja se indexa por su
 * subgrupo a secas.
 */
export function construirMapa(filaSub: string[], filaHoja: string[]): MapaColumnas {
  const ancho = Math.max(filaSub.length, filaHoja.length);
  const sub = rellenar(filaSub, ancho);
  const indice = new Map<string, number>();
  const salidas: { etiqueta: string; campos: Map<string, number> }[] = [];

  for (let i = 0; i < ancho; i++) {
    const s = normalizarEncabezado(sub[i] ?? "");
    const h = normalizarEncabezado(filaHoja[i] ?? "");
    if (!s && !h) continue;

    const clave = h ? `${s}|${h}` : s;
    // La primera aparición manda: si un encabezado se repite, quedarse con la
    // de la izquierda evita saltar a un bloque posterior.
    if (!indice.has(clave)) indice.set(clave, i);

    const esSalida = /^salida \d+$/.test(s);
    if (esSalida && h) {
      let bloque = salidas.find((b) => b.etiqueta === s);
      if (!bloque) {
        bloque = { etiqueta: s, campos: new Map() };
        salidas.push(bloque);
      }
      if (!bloque.campos.has(h)) bloque.campos.set(h, i);
    }
  }

  salidas.sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, "es", { numeric: true }));
  return { indice, salidas, ancho };
}

export class ColumnaFaltante extends Error {}

/**
 * Índice de una columna, aceptando varias formas de escribir su encabezado
 * (la hoja tiene erratas como "ORGANNICO" y dobles espacios).
 * Lanza si no aparece ninguna: mejor fallar que leer la columna de al lado.
 */
export function columna(mapa: MapaColumnas, ...alternativas: string[]): number {
  for (const alt of alternativas) {
    const i = mapa.indice.get(normalizarEncabezado(alt));
    if (i != null) return i;
  }
  throw new ColumnaFaltante(
    `No se encontró la columna «${alternativas[0]}» en la hoja. ` +
      `¿Le cambiaron el encabezado? Alternativas probadas: ${alternativas.join(" / ")}`,
  );
}

/** Igual que `columna`, pero devuelve -1 cuando la columna es opcional. */
export function columnaOpcional(mapa: MapaColumnas, ...alternativas: string[]): number {
  try {
    return columna(mapa, ...alternativas);
  } catch {
    return -1;
  }
}

/** Índice de un campo dentro de un bloque SALIDA, o -1. */
export function campoSalida(
  bloque: { campos: Map<string, number> },
  ...alternativas: string[]
): number {
  for (const alt of alternativas) {
    const i = bloque.campos.get(normalizarEncabezado(alt));
    if (i != null) return i;
  }
  return -1;
}
