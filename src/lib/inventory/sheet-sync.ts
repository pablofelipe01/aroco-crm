/**
 * Parsing for the AROCO inventory Google Sheet (published as CSV).
 *
 * La hoja tiene cuatro filas de encabezado (una en blanco, los grupos
 * ENTRADAS · CLASIFICACION · MEDICION CALIDAD · SALIDA 1..6, y dos filas de
 * títulos), así que los datos arrancan en el índice 4. Los números usan locale
 * colombiano (coma decimal, punto de miles) y las fechas son abreviaturas en
 * español ("5-may-2025"). Todo aquí es puro para poder testearlo sin red ni DB.
 *
 * Mapa de columnas (verificado contra la hoja en producción):
 *   0 Fecha · 1 # Remisión · 2 # ODC · 3 # Recepción · 4 Código de procedencia
 *   5-7 Bultos (ingresan / salen / total) · 8 Valor de compra
 *   9 Cantidad solicitada · 10 Ingresada · 11 Salida · 12 Disponible · 13 Cadmio
 *   14-17 Clasificación ingresada  (Premium / Corriente / Corriente C / Orgánico)
 *   18-21 Clasificación disponible (misma terna)
 *   22-25 Selección (merma, pasilla, % merma, % pasilla)
 *   26-34 Ítems de evaluación (% fermentación, humedad, índice de grano…)
 *   35+   Seis bloques SALIDA de ocho columnas
 */

/** First data row (0-based) — four header rows precede it. */
export const DATA_START_ROW = 4;

/** Column indexes within each parsed CSV row. */
const COL = {
  fecha: 0,
  remision: 1,
  odc: 2,
  recepcion: 3,
  code: 4,
  bultosIn: 5,
  bultosOut: 6,
  bultosTotal: 7,
  valorCompra: 8,
  qtyRequested: 9,
  qtyIn: 10,
  qtyOut: 11,
  // qtyAvailable: 12 — la mantiene un trigger (disponible = ingresada − salida).
  cadmio: 13,
  inPremium: 14,
  inCorriente: 15,
  inCorrienteC: 16,
  inOrganico: 17,
  availPremium: 18,
  availCorriente: 19,
  availCorrienteC: 20,
  availOrganico: 21,
  merma: 22,
  pasilla: 23,
  mermaPct: 24,
  pasillaPct: 25,
  bienFermentado: 26,
  parcialmenteFermentado: 27,
  pizarroso: 28,
  purpura: 29,
  sobreFermentado: 30,
  hongos: 31,
  humedad: 32,
  indiceGrano: 33,
  fermentacionTotal: 34,
} as const;

/**
 * Bloques SALIDA 1..6. Cada uno ocupa ocho columnas:
 * [FECHA, PREMIUM, CORRIENTE, CORRIENTE C, ORGANICO, BULTOS, EMPRESA, REMISION].
 */
const SALIDA_BASES = [35, 43, 51, 59, 67, 75] as const;

const SALIDA = {
  fecha: 0,
  premium: 1,
  corriente: 2,
  corrienteC: 3,
  organico: 4,
  bultos: 5,
  empresa: 6,
  remision: 7,
} as const;

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

const cell = (row: string[], i: number): string => (row[i] ?? "").trim();
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
  const lots: LotRow[] = [];
  const dispatches: DispatchRow[] = [];
  let rowsRead = 0;

  for (let r = DATA_START_ROW; r < matrix.length; r++) {
    const row = matrix[r];
    const code = cell(row, COL.code);
    if (!code) continue; // blank separators and TOTAL rows have no code.
    rowsRead++;

    const remision = cell(row, COL.remision) || null;
    const inPremium = num(row, COL.inPremium);
    const inCorriente = num(row, COL.inCorriente);
    const inCorrienteC = num(row, COL.inCorrienteC);
    const inOrganico = num(row, COL.inOrganico);

    lots.push({
      code,
      entry_date: parseEsDate(cell(row, COL.fecha)),
      remision,
      odc: cell(row, COL.odc) || null,
      recepcion: cell(row, COL.recepcion) || null,
      qty_in_kg: num(row, COL.qtyIn),
      qty_out_kg: num(row, COL.qtyOut),
      qty_requested_kg: optNum(row, COL.qtyRequested),
      bultos_in: num(row, COL.bultosIn),
      bultos_out: num(row, COL.bultosOut),
      bultos_total: num(row, COL.bultosTotal),
      purchase_price_cop_kg: optNum(row, COL.valorCompra),
      cadmio: cell(row, COL.cadmio) || null,
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
      qty_avail_premium_kg: num(row, COL.availPremium),
      qty_avail_corriente_kg: num(row, COL.availCorriente),
      qty_avail_corriente_c_kg: num(row, COL.availCorrienteC),
      qty_avail_organico_kg: num(row, COL.availOrganico),
      merma_kg: num(row, COL.merma),
      pasilla_kg: num(row, COL.pasilla),
      merma_pct: optNum(row, COL.mermaPct),
      pasilla_pct: optNum(row, COL.pasillaPct),
      pct_bien_fermentado: optNum(row, COL.bienFermentado),
      pct_parcialmente_fermentado: optNum(row, COL.parcialmenteFermentado),
      pct_pizarroso: optNum(row, COL.pizarroso),
      pct_purpura: optNum(row, COL.purpura),
      pct_sobre_fermentado: optNum(row, COL.sobreFermentado),
      pct_hongos: optNum(row, COL.hongos),
      pct_humedad: optNum(row, COL.humedad),
      pct_fermentacion_total: optNum(row, COL.fermentacionTotal),
      indice_grano_100g: optNum(row, COL.indiceGrano),
    });

    SALIDA_BASES.forEach((base, idx) => {
      const premium = num(row, base + SALIDA.premium);
      const corriente = num(row, base + SALIDA.corriente);
      const corrienteC = num(row, base + SALIDA.corrienteC);
      const organico = num(row, base + SALIDA.organico);
      const qty = premium + corriente + corrienteC + organico;
      if (qty <= 0) return; // bloque de salida vacío.

      dispatches.push({
        source_key: `${code}#${remision ?? ""}#s${idx + 1}`,
        // Hay salidas registradas sin fecha; se guardan como null en vez de
        // inventarles un día.
        dispatch_date: parseEsDate(cell(row, base + SALIDA.fecha)),
        destination: cell(row, base + SALIDA.empresa) || null,
        qty_kg: qty,
        qty_premium_kg: premium,
        qty_corriente_kg: corriente,
        qty_corriente_c_kg: corrienteC,
        qty_organico_kg: organico,
        bultos: optNum(row, base + SALIDA.bultos),
        remision_salida: cell(row, base + SALIDA.remision) || null,
        remision_entrada: remision,
        origin: code,
      });
    });
  }

  return { lots, dispatches, rowsRead };
}
