/**
 * Parser for the AROCO "inventory by quality / location" sheet tab
 * (gid=1083634413). It's a current-stock snapshot: procedencia by name,
 * location split (licor / por llegar / Tolimax / bodega), purchase value and a
 * quality breakdown (B / C / Premium / Orgánico) plus an occasional cadmio tag.
 *
 * The header is split over two rows with no clean merging ("Valor compra"
 * sits above a blank, "B" and "C" below "Corriente"), so each column is named
 * by its lower cell or, failing that, its upper one. Columns are found by that
 * name, never by position: a "Reservado" column inserted after "En bodega"
 * once shifted every field one to the right — the purchase price landed in
 * quality B and the organic kilos in cadmio. Dates use merged cells, so a
 * blank Fecha inherits the previous row's date. The table ends at its TOTAL
 * row; what sits below is ad-hoc analysis. Pure module — unit testable.
 */
import { parseCsv, parseCoNumber, parseEsDate } from "@/lib/inventory/sheet-sync";
import {
  ColumnaFaltante,
  normalizarEncabezado,
  ubicarEncabezado,
} from "@/lib/inventory/sheet-columns";

/** Name of each column: its lower header cell, or the upper one when blank. */
function nombres(arriba: string[], abajo: string[]): Map<string, number> {
  const out = new Map<string, number>();
  const ancho = Math.max(arriba.length, abajo.length);
  for (let i = 0; i < ancho; i++) {
    const n = normalizarEncabezado(abajo[i] || arriba[i] || "");
    if (n && !out.has(n)) out.set(n, i);
  }
  return out;
}

function col(m: Map<string, number>, ...alts: string[]): number {
  for (const a of alts) {
    const i = m.get(normalizarEncabezado(a));
    if (i != null) return i;
  }
  throw new ColumnaFaltante(
    `No se encontró la columna «${alts[0]}» en la pestaña de inventario por calidad.`,
  );
}

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
  const filaHoja = ubicarEncabezado(matrix, ["Procedencia", "En bodega"]);
  if (filaHoja < 1) {
    throw new ColumnaFaltante(
      "No se encontró el encabezado de inventario por calidad («Procedencia», «En bodega»).",
    );
  }
  const m = nombres(matrix[filaHoja - 1] ?? [], matrix[filaHoja] ?? []);
  const COL = {
    oc: col(m, "OC # / CDC", "OC #"),
    fecha: col(m, "Fecha entrada"),
    procedencia: col(m, "Procedencia"),
    licor: col(m, "Licor"),
    porLlegar: col(m, "Por llegar"),
    tolimax: col(m, "Tolimax"),
    enBodega: col(m, "En bodega"),
    valorCompra: col(m, "Valor compra"),
    b: col(m, "B"),
    c: col(m, "C"),
    premium: col(m, "Premium"),
    organico: col(m, "Organico"),
    cadmio: col(m, "CADMIO"),
  };

  const rows: QualityRow[] = [];
  let lastDate = "";

  for (let r = filaHoja + 1; r < matrix.length; r++) {
    const row = matrix[r];
    const procedencia = cell(row, COL.procedencia);
    // TOTAL closes the table; below it the sheet keeps another one.
    if (/^total/i.test(procedencia)) break;
    if (!procedencia) continue;

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
