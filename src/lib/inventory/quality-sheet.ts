/**
 * Parser for the AROCO "inventory by quality / location" sheet tab
 * (gid=1083634413). It's a current-stock snapshot: procedencia by name,
 * location split (licor / por llegar / Tolimax / bodega), purchase value and a
 * quality breakdown (B / C / Premium / Orgánico) plus an occasional cadmio tag.
 *
 * Three header rows precede the data (index 3 onward). Dates use merged cells,
 * so a blank Fecha inherits the previous row's date. The right-side columns
 * (13+) are ad-hoc analysis and are ignored. Pure module — unit testable.
 */
import { parseCsv, parseCoNumber, parseEsDate } from "@/lib/inventory/sheet-sync";

/** First data row (0-based) — three header rows precede it. */
export const DATA_START_ROW = 3;

const COL = {
  oc: 0,
  fecha: 1,
  procedencia: 2,
  licor: 3,
  porLlegar: 4,
  tolimax: 5,
  enBodega: 6,
  valorCompra: 7,
  b: 8,
  c: 9,
  premium: 10,
  organico: 11,
  cadmio: 12,
} as const;

export type QualityRow = {
  position: number;
  oc: string | null;
  entry_date: string | null;
  procedencia: string;
  licor_kg: number;
  por_llegar_kg: number;
  tolimax_kg: number;
  en_bodega_kg: number;
  purchase_price_cop_kg: number | null;
  qty_b_kg: number;
  qty_c_kg: number;
  qty_premium_kg: number;
  qty_organico_kg: number;
  cadmio: string | null;
};

const cell = (row: string[], i: number): string => (row[i] ?? "").trim();
const num = (row: string[], i: number): number => parseCoNumber(cell(row, i)) ?? 0;

export function parseQualitySheet(csv: string): {
  rows: QualityRow[];
  rowsRead: number;
} {
  const matrix = parseCsv(csv);
  const rows: QualityRow[] = [];
  let lastDate = "";

  for (let r = DATA_START_ROW; r < matrix.length; r++) {
    const row = matrix[r];
    const procedencia = cell(row, COL.procedencia);
    if (!procedencia || /total/i.test(procedencia)) continue; // skip totals/blanks

    // Merged date cells: inherit the previous row's date when blank.
    const rawDate = cell(row, COL.fecha);
    const parsed = parseEsDate(rawDate);
    if (parsed) lastDate = parsed;

    rows.push({
      position: rows.length,
      oc: cell(row, COL.oc) || null,
      entry_date: parsed ?? (lastDate || null),
      procedencia,
      licor_kg: num(row, COL.licor),
      por_llegar_kg: num(row, COL.porLlegar),
      tolimax_kg: num(row, COL.tolimax),
      en_bodega_kg: num(row, COL.enBodega),
      purchase_price_cop_kg: parseCoNumber(cell(row, COL.valorCompra)),
      qty_b_kg: num(row, COL.b),
      qty_c_kg: num(row, COL.c),
      qty_premium_kg: num(row, COL.premium),
      qty_organico_kg: num(row, COL.organico),
      cadmio: cell(row, COL.cadmio) || null,
    });
  }

  return { rows, rowsRead: rows.length };
}
