import { test } from "node:test";
import assert from "node:assert/strict";
import { parseQualitySheet } from "./quality-sheet";

// Forma anterior de la pestaña: sin «Reservado». Quoted decimals.
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

// Filas literales del CSV del 2026-09-29: apareció «Reservado» después de «En
// bodega», el encabezado de arriba se corrió, y debajo del TOTAL la hoja lleva
// otra tabla que no es inventario por calidad.
const SHEET_RESERVADO = [
  "55,,,,,,,,,Discriminado x Calidad,,,,",
  ",,,,Cantidad,,,,Valor compra,Corriente,,Premium,Organico,CADMIO",
  "OC # / CDC,Fecha entrada ,Procedencia,Licor,Por llegar,Tolimax,En bodega,Reservado,,B,C,,,",
  ",5-may-2025,Uraba (Asopraur),,,,197,,$38.000,,,,197,",
  '82,23-sept-2026,Deleite,,,,"3992,9",,$15.800,,,"3992,9",,',
  ",,,,,,0,,,,,,,",
  '1926,23-sept-2025,Nilo finca,,,,"100,65",,$8.500,,,,"100,65",ALTO',
  '1931,10-feb-2026,Nilo finca,,,,"7,9",,$8.500,"7,9",,,,ALTO',
  ',21-feb-2025,Licor Tolimax (Mezclas frutales - Nilo),14,,,,,,,,,,',
  ',,TOTAL,"60,8",0,0,"4356,55",0,,"20,9",0,4038,"297,65",',
  ',,TOTAL GENERAL,,"4356,55",,,,,,,,,',
  "Fecha ,CODIGO  DE PROCEDENCIA  ,# Remision ,CADMIO,CANTIDAD DISPONIBLE EN BODEGA,Inventario bultos,VALOR DE COMPRA,,,,,,,",
  '5-may-2025,CO-ANT-URA-050525,2007,,"197,00",0, $0,,,,,,,',
].join("\n");

test("una columna nueva no corre los campos de la pestaña de calidad", () => {
  const { rows } = parseQualitySheet(SHEET_RESERVADO);

  // La tabla de abajo del TOTAL no entra.
  assert.deepEqual(
    rows.map((r) => r.procedencia),
    ["Uraba (Asopraur)", "Deleite", "Nilo finca", "Nilo finca", "Licor Tolimax (Mezclas frutales - Nilo)"],
  );

  // Antes: el precio caía en calidad B y los kilos orgánicos en cadmio.
  assert.equal(rows[0].purchase_price_cop_kg, 38000);
  assert.equal(rows[0].qty_b_kg, 0);
  assert.equal(rows[0].qty_organico_kg, 197);
  assert.equal(rows[0].cadmio, null);

  assert.equal(rows[1].qty_premium_kg, 3992.9);
  assert.equal(rows[1].oc, "82");
  assert.equal(rows[2].cadmio, "ALTO");
  assert.equal(rows[3].qty_b_kg, 7.9);
  assert.equal(rows[4].licor_kg, 14);
});
