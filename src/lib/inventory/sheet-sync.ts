/**
 * Parsing for the AROCO inventory Google Sheet (published as CSV).
 *
 * Las columnas se localizan por su ENCABEZADO, no por su posición (ver
 * `sheet-columns.ts`). La hoja ha cambiado de forma tres veces; la última,
 * alguien insertó "SELECION SI/NO" en la columna 14 y todo lo de la derecha se
 * corrió una casilla, dejando el sync escribiendo empresas en el campo de la
 * remisión y 20 millones de kilos despachados sin que nada fallara.
 *
 * Los datos arrancan en la fila 4: una en blanco, los grupos macro, los
 * subgrupos y los nombres finales. Los números usan locale colombiano (coma
 * decimal, punto de miles) y las fechas son abreviaturas en español
 * ("5-may-2025"). Todo aquí es puro para poder testearlo sin red ni DB.
 */

import {
  construirMapa,
  columna,
  columnaOpcional,
  campoSalida,
  ColumnaFaltante,
} from "@/lib/inventory/sheet-columns";

/** First data row (0-based) — four header rows precede it. */
export const DATA_START_ROW = 4;

/** Fila del encabezado con los subgrupos (0-based). */
const HEADER_SUB_ROW = 2;
/** Fila del encabezado con los nombres finales de cada columna. */
const HEADER_LEAF_ROW = 3;

export type LotRow = {
  code: string;
  entry_date: string | null;
  remision: string | null;
  odc: string | null;
  recepcion: string | null;
  qty_in_kg: number;
  qty_out_kg: number;
  qty_requested_kg: number | null;
  bultos_in: number;
  bultos_out: number;
  bultos_total: number;
  purchase_price_cop_kg: number | null;
  cadmio: string | null;
  /** Clasificación dominante de lo ingresado — etiqueta para la UI. */
  quality: string | null;
  qty_in_premium_kg: number;
  qty_in_corriente_kg: number;
  qty_in_corriente_c_kg: number;
  qty_in_organico_kg: number;
  qty_avail_premium_kg: number;
  qty_avail_corriente_kg: number;
  qty_avail_corriente_c_kg: number;
  qty_avail_organico_kg: number;
  merma_kg: number;
  pasilla_kg: number;
  merma_pct: number | null;
  pasilla_pct: number | null;
  pct_bien_fermentado: number | null;
  pct_parcialmente_fermentado: number | null;
  pct_pizarroso: number | null;
  pct_purpura: number | null;
  pct_sobre_fermentado: number | null;
  pct_hongos: number | null;
  pct_humedad: number | null;
  pct_fermentacion_total: number | null;
  indice_grano_100g: number | null;
};

export type DispatchRow = {
  source_key: string;
  dispatch_date: string | null;
  destination: string | null;
  qty_kg: number;
  qty_premium_kg: number;
  qty_corriente_kg: number;
  qty_corriente_c_kg: number;
  qty_organico_kg: number;
  bultos: number | null;
  remision_salida: string | null;
  remision_entrada: string | null;
  origin: string;
};

export type ParsedSheet = {
  lots: LotRow[];
  dispatches: DispatchRow[];
  rowsRead: number;
};

const ES_MONTHS: Record<string, string> = {
  ene: "01", feb: "02", mar: "03", abr: "04", may: "05", jun: "06",
  jul: "07", ago: "08", sep: "09", set: "09", oct: "10", nov: "11", dic: "12",
};

/**
 * Parse a Spanish abbreviated date like "5-may-2025" or "18-jun-26" → ISO
 * ("2025-05-05" / "2026-06-18"). A 2-digit year is assumed to be 20YY.
 * Returns null when the value is empty or unrecognized.
 */
export function parseEsDate(value: string | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})[-/ ]([a-záéíóú]{3,})\.?[-/ ](\d{2}|\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = ES_MONTHS[m[2].slice(0, 3)];
  if (!month) return null;
  const year = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${year}-${month}-${day}`;
}

/**
 * Parse a Colombian-formatted number ("172.444,38", "764,25", "$9.200") →
 * number. Dots are thousands separators, comma is the decimal mark; currency
 * symbols are ignored. Returns null for empty / non-numeric input.
 */
export function parseCoNumber(value: string | undefined): number | null {
  const raw = (value ?? "").trim();
  if (!raw) return null;
  // Drop everything but digits, separators and sign; then CO → JS number.
  const cleaned = raw.replace(/[^\d.,-]/g, "");
  if (!cleaned || /^[-.,]+$/.test(cleaned)) return null;
  const normalized = cleaned.replace(/\./g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/**
 * Minimal RFC-4180 CSV parser: handles quoted fields, embedded commas/newlines
 * and "" escapes. Returns a matrix of string cells.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  // Normalize newlines so CRLF and lone CR both count as one row break.
  const s = text.replace(/\r\n?/g, "\n");

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Flush trailing field/row (file may not end with a newline).
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Índice -1 = columna opcional que la hoja no trae. */
const cell = (row: string[], i: number): string =>
  i < 0 ? "" : (row[i] ?? "").trim();
const num = (row: string[], i: number): number => parseCoNumber(cell(row, i)) ?? 0;
const optNum = (row: string[], i: number): number | null => parseCoNumber(cell(row, i));

/**
 * Etiqueta del lote: la clasificación con más kilos ingresados. Cuando el lote
 * trae varias, el desglose completo queda en las columnas qty_in_*; esto es
 * solo el rótulo corto que se muestra en la tabla.
 */
export function dominantQuality(row: {
  premium: number;
  corriente: number;
  corrienteC: number;
  organico: number;
}): string | null {
  const entries: Array<[string, number]> = [
    ["Premium", row.premium],
    ["Corriente", row.corriente],
    ["Corriente C", row.corrienteC],
    ["Orgánico", row.organico],
  ];
  let best: [string, number] | null = null;
  for (const e of entries) {
    if (e[1] > 0 && (best === null || e[1] > best[1])) best = e;
  }
  return best ? best[0] : null;
}

/**
 * Parse the full inventory CSV into lot + dispatch rows ready for the
 * import_inventory_sheet RPC. Rows without a procedencia code (blank separators
 * and the TOTAL rows at the bottom) are skipped.
 */
export function parseInventorySheet(csv: string): ParsedSheet {
  const matrix = parseCsv(csv);
  const mapa = construirMapa(
    matrix[HEADER_SUB_ROW] ?? [],
    matrix[HEADER_LEAF_ROW] ?? [],
  );

  // Se resuelven todas las columnas ANTES de recorrer las filas: si a la hoja
  // le cambiaron un encabezado, la corrida falla aquí y no después de haber
  // escrito 200 filas con los campos corridos.
  const C = {
    fecha: columna(mapa, "Fecha"),
    remision: columna(mapa, "# Remision", "# Remisión"),
    odc: columnaOpcional(mapa, "# ODC"),
    recepcion: columnaOpcional(mapa, "# Recepcion", "# Recepción"),
    code: columna(mapa, "CODIGO DE PROCEDENCIA Y/O DESTINO", "CODIGO DE PROCEDENCIA"),
    bultosIn: columnaOpcional(mapa, "Inventario bultos|Bultos ingresan"),
    bultosOut: columnaOpcional(mapa, "Inventario bultos|Bultos salen"),
    bultosTotal: columnaOpcional(mapa, "Inventario bultos|Total bultos"),
    valorCompra: columnaOpcional(mapa, "VALOR DE COMPRA"),
    qtyRequested: columnaOpcional(mapa, "CANTIDAD SOLICITADA (KG)"),
    qtyIn: columna(mapa, "CANTIDAD INGRESADA (KG)"),
    qtyOut: columna(mapa, "CANTIDAD SALIDA"),
    cadmio: columnaOpcional(mapa, "CADMIO"),
    inPremium: columna(mapa, "CANTIDAD INGRESADA|PREMIUM"),
    inCorriente: columna(mapa, "CANTIDAD INGRESADA|CORRIENTE"),
    inCorrienteC: columna(mapa, "CANTIDAD INGRESADA|CORRIENTE C"),
    inOrganico: columna(mapa, "CANTIDAD INGRESADA|ORGANICO", "CANTIDAD INGRESADA|ORGANNICO"),
    availPremium: columna(mapa, "CANTIDAD DISPONIBLE EN BODEGA|PREMIUM"),
    availCorriente: columna(mapa, "CANTIDAD DISPONIBLE EN BODEGA|CORRIENTE"),
    availCorrienteC: columna(mapa, "CANTIDAD DISPONIBLE EN BODEGA|CORRIENTE C"),
    availOrganico: columna(mapa, "CANTIDAD DISPONIBLE EN BODEGA|ORGANICO"),
    merma: columnaOpcional(mapa, "SELECCION|MERMA"),
    pasilla: columnaOpcional(mapa, "SELECCION|PASILLA"),
    mermaPct: columnaOpcional(mapa, "SELECCION|% MERMA"),
    pasillaPct: columnaOpcional(mapa, "SELECCION|% PASILLA"),
    bienFermentado: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Bien fermentados"),
    parcialmenteFermentado: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Parcialmente fermentado"),
    pizarroso: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Pizarrosos"),
    purpura: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Purpuras"),
    sobreFermentado: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Sobre fermentado"),
    hongos: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Grano con hongos"),
    humedad: columnaOpcional(mapa, "ITEMS DE EVALUACION|% Humedad"),
    indiceGrano: columnaOpcional(mapa, "ITEMS DE EVALUACION|Indice de grano x 100 grm"),
    fermentacionTotal: columnaOpcional(mapa, "ITEMS DE EVALUACION|Total fermentación"),
  };

  if (mapa.salidas.length === 0) {
    throw new ColumnaFaltante("La hoja no tiene bloques «SALIDA n».");
  }

  // Cada bloque resuelve sus propios campos: los encabezados varían entre
  // bloques ("ORGANNICO" en el primero, "CORRIENTE  C" en el tercero).
  const salidas = mapa.salidas.map((b) => ({
    fecha: campoSalida(b, "FECHA"),
    premium: campoSalida(b, "PREMIUM"),
    corriente: campoSalida(b, "CORRIENTE"),
    corrienteC: campoSalida(b, "CORRIENTE C"),
    organico: campoSalida(b, "ORGANICO", "ORGANNICO"),
    bultos: campoSalida(b, "BULTOS"),
    empresa: campoSalida(b, "EMPRESA"),
    remision: campoSalida(b, "REMISION SALIDA", "REMISIÓN SALIDA"),
  }));

  const lots: LotRow[] = [];
  const dispatches: DispatchRow[] = [];
  let rowsRead = 0;

  for (let r = DATA_START_ROW; r < matrix.length; r++) {
    const row = matrix[r];
    const code = cell(row, C.code);
    if (!code) continue; // blank separators and TOTAL rows have no code.
    rowsRead++;

    const remision = cell(row, C.remision) || null;
    const inPremium = num(row, C.inPremium);
    const inCorriente = num(row, C.inCorriente);
    const inCorrienteC = num(row, C.inCorrienteC);
    const inOrganico = num(row, C.inOrganico);

    lots.push({
      code,
      entry_date: parseEsDate(cell(row, C.fecha)),
      remision,
      odc: cell(row, C.odc) || null,
      recepcion: cell(row, C.recepcion) || null,
      qty_in_kg: num(row, C.qtyIn),
      qty_out_kg: num(row, C.qtyOut),
      qty_requested_kg: optNum(row, C.qtyRequested),
      bultos_in: num(row, C.bultosIn),
      bultos_out: num(row, C.bultosOut),
      bultos_total: num(row, C.bultosTotal),
      purchase_price_cop_kg: optNum(row, C.valorCompra),
      cadmio: cell(row, C.cadmio) || null,
      quality: dominantQuality({
        premium: inPremium,
        corriente: inCorriente,
        corrienteC: inCorrienteC,
        organico: inOrganico,
      }),
      qty_in_premium_kg: inPremium,
      qty_in_corriente_kg: inCorriente,
      qty_in_corriente_c_kg: inCorrienteC,
      qty_in_organico_kg: inOrganico,
      qty_avail_premium_kg: num(row, C.availPremium),
      qty_avail_corriente_kg: num(row, C.availCorriente),
      qty_avail_corriente_c_kg: num(row, C.availCorrienteC),
      qty_avail_organico_kg: num(row, C.availOrganico),
      merma_kg: num(row, C.merma),
      pasilla_kg: num(row, C.pasilla),
      merma_pct: optNum(row, C.mermaPct),
      pasilla_pct: optNum(row, C.pasillaPct),
      pct_bien_fermentado: optNum(row, C.bienFermentado),
      pct_parcialmente_fermentado: optNum(row, C.parcialmenteFermentado),
      pct_pizarroso: optNum(row, C.pizarroso),
      pct_purpura: optNum(row, C.purpura),
      pct_sobre_fermentado: optNum(row, C.sobreFermentado),
      pct_hongos: optNum(row, C.hongos),
      pct_humedad: optNum(row, C.humedad),
      pct_fermentacion_total: optNum(row, C.fermentacionTotal),
      indice_grano_100g: optNum(row, C.indiceGrano),
    });

    salidas.forEach((s, idx) => {
      const premium = num(row, s.premium);
      const corriente = num(row, s.corriente);
      const corrienteC = num(row, s.corrienteC);
      const organico = num(row, s.organico);
      const qty = premium + corriente + corrienteC + organico;
      if (qty <= 0) return; // bloque de salida vacío.

      dispatches.push({
        source_key: `${code}#${remision ?? ""}#s${idx + 1}`,
        // Hay salidas registradas sin fecha; se guardan como null en vez de
        // inventarles un día.
        dispatch_date: parseEsDate(cell(row, s.fecha)),
        destination: cell(row, s.empresa) || null,
        qty_kg: qty,
        qty_premium_kg: premium,
        qty_corriente_kg: corriente,
        qty_corriente_c_kg: corrienteC,
        qty_organico_kg: organico,
        bultos: optNum(row, s.bultos),
        remision_salida: cell(row, s.remision) || null,
        remision_entrada: remision,
        origin: code,
      });
    });
  }

  return { lots, dispatches, rowsRead };
}
