import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQualitySheet } from "./quality-sheet";

// Three header rows, then data. Col 2 = procedencia, col 6 = en bodega,
// col 7 = valor compra, cols 8-11 = B/C/Premium/Orgánico. Quoted decimals.
const SHEET = [
  ",,,,,,,,Discriminado x Calidad,,,,,",
  ",,,,Cantidad,,,Valor compra,Corriente,,Premium,Organico,,",
  "OC #,Fecha entrada,Procedencia,Licor,Por llegar,Tolimax,En bodega,,B,C,,,CADMIO",
  ",5-may-2025,Uraba (Asopraur),,,,197,$38.000,,,,197,",
  '25,19-feb-2026,Cauca-(Ruta Guachene),,,,"1308,5",$15.060,,,"1308,5",,',
  // merged date: blank fecha inherits 19-feb-2026
  ',,Cauca-(Ruta Villa rica),,,,"951,27",$11.675,,,"951,27",,BAJO',
  ',,TOTAL,,12500,0,"16750,19",,"178,4","404,8","15869,99","297,65",',
].join("\n");

test("parseQualitySheet reads rows, fills merged dates, skips TOTAL", () => {
  const { rows, rowsRead } = parseQualitySheet(SHEET);

  assert.equal(rowsRead, 3);
  assert.equal(rows.length, 3);

  assert.deepEqual(rows[0], {
    position: 0,
    oc: null,
    entry_date: "2025-05-05",
    procedencia: "Uraba (Asopraur)",
    licor_kg: 0,
    por_llegar_kg: 0,
    tolimax_kg: 0,
    en_bodega_kg: 197,
    purchase_price_cop_kg: 38000,
    qty_b_kg: 0,
    qty_c_kg: 0,
    qty_premium_kg: 0,
    qty_organico_kg: 197,
    cadmio: null,
  });

  // Quality + Colombian decimal parsing.
  assert.equal(rows[1].procedencia, "Cauca-(Ruta Guachene)");
  assert.equal(rows[1].qty_premium_kg, 1308.5);
  assert.equal(rows[1].purchase_price_cop_kg, 15060);
  assert.equal(rows[1].oc, "25");

  // Merged date inherited + cadmio tag.
  assert.equal(rows[2].entry_date, "2026-02-19");
  assert.equal(rows[2].cadmio, "BAJO");

  // TOTAL row excluded.
  assert.ok(!rows.some((r) => /total/i.test(r.procedencia)));
});
