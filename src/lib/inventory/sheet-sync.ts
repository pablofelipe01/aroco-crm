/**
 * Parsing for the AROCO inventory Google Sheet (published as CSV).
 *
 * The sheet has a three-row merged header (ENTRADAS · MEDICION CALIDAD ·
 * ESPECIFICACION SALIDAS); real data starts at row index 4 (0-based). Numbers
 * use the Colombian locale (comma decimal, dot thousands) and dates are Spanish
 * abbreviations ("5-may-2025"). These helpers are pure so they can be unit
 * tested without network or DB access.
 */

/** First data row (0-based) — three header rows precede it. */
export const DATA_START_ROW = 4;

/** Column indexes within each parsed CSV row. */
const COL = {
  fecha: 0,
  remision: 1,
  code: 4,
  qtyIn: 5,
  qtyOut: 6,
  // qtyAvailable: 7 — derived by a DB trigger, not imported.
  samples: 17,
} as const;

/** SALIDA 1..5 blocks: [FECHA, CANTIDAD, EMPRESA, REMISION SALIDA]. */
const SALIDA_BASES = [18, 22, 26, 30, 34] as const;

export type LotRow = {
  code: string;
  entry_date: string | null;
  remision: string | null;
  qty_in_kg: number;
  qty_out_kg: number;
  samples_pasilla_merma_kg: number;
  notes: string | null;
};

export type DispatchRow = {
  source_key: string;
  dispatch_date: string | null;
  destination: string | null;
  qty_kg: number;
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
 * Parse a Spanish abbreviated date like "5-may-2025" → ISO "2025-05-05".
 * Returns null when the value is empty or unrecognized.
 */
export function parseEsDate(value: string | undefined): string | null {
  const raw = (value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const m = raw.match(/^(\d{1,2})[-/ ]([a-záéíóú]{3,})\.?[-/ ](\d{4})$/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const month = ES_MONTHS[m[2].slice(0, 3)];
  if (!month) return null;
  return `${m[3]}-${month}-${day}`;
}

/**
 * Parse a Colombian-formatted number ("172.444,38", "764,25", "200") → number.
 * Dots are thousands separators, comma is the decimal mark. Returns null for
 * empty / non-numeric input.
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

/**
 * Parse the full inventory CSV into lot + dispatch rows ready for the
 * import_inventory_sheet RPC. Rows without a procedencia code (blank and TOTAL
 * rows) are skipped.
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

    lots.push({
      code,
      entry_date: parseEsDate(cell(row, COL.fecha)),
      remision,
      qty_in_kg: parseCoNumber(cell(row, COL.qtyIn)) ?? 0,
      qty_out_kg: parseCoNumber(cell(row, COL.qtyOut)) ?? 0,
      samples_pasilla_merma_kg: parseCoNumber(cell(row, COL.samples)) ?? 0,
      notes: null,
    });

    SALIDA_BASES.forEach((base, idx) => {
      const qty = parseCoNumber(cell(row, base + 1));
      if (qty === null || qty <= 0) return; // empty salida slot.
      dispatches.push({
        source_key: `${code}#${remision ?? ""}#s${idx + 1}`,
        dispatch_date: parseEsDate(cell(row, base)),
        destination: cell(row, base + 2) || null,
        qty_kg: qty,
        remision_salida: cell(row, base + 3) || null,
        remision_entrada: remision,
        origin: code,
      });
    });
  }

  return { lots, dispatches, rowsRead };
}
