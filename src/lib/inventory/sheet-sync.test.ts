import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCoNumber,
  parseEsDate,
  parseCsv,
  parseInventorySheet,
  dominantQuality,
} from "./sheet-sync";

test("parseEsDate handles Spanish abbreviations", () => {
  assert.equal(parseEsDate("5-may-2025"), "2025-05-05");
  assert.equal(parseEsDate("26-may-2025"), "2025-05-26");
  assert.equal(parseEsDate("17-jun-2025"), "2025-06-17");
  assert.equal(parseEsDate("1-ago-2025"), "2025-08-01");
  assert.equal(parseEsDate(""), null);
  assert.equal(parseEsDate("not a date"), null);
  assert.equal(parseEsDate(undefined), null);
});

test("parseCoNumber handles Colombian locale", () => {
  assert.equal(parseCoNumber("200"), 200);
  assert.equal(parseCoNumber("764,25"), 764.25);
  assert.equal(parseCoNumber("172.444,38"), 172444.38);
  assert.equal(parseCoNumber("1.000"), 1000);
  // El valor de compra viene con símbolo de moneda.
  assert.equal(parseCoNumber("$9.200"), 9200);
  assert.equal(parseCoNumber(""), null);
  assert.equal(parseCoNumber("TOTAL"), null);
  assert.equal(parseCoNumber(undefined), null);
});

test("parseCsv keeps quoted commas as one field", () => {
  const rows = parseCsv('a,"764,25",b\n1,2,3');
  assert.deepEqual(rows[0], ["a", "764,25", "b"]);
  assert.deepEqual(rows[1], ["1", "2", "3"]);
});

test("parseCsv handles escaped quotes", () => {
  const rows = parseCsv('"he said ""hi""",x');
  assert.deepEqual(rows[0], ['he said "hi"', "x"]);
});

test("dominantQuality picks the classification with most kilos", () => {
  assert.equal(
    dominantQuality({ premium: 0, corriente: 0, corrienteC: 0, organico: 200 }),
    "Orgánico",
  );
  assert.equal(
    dominantQuality({ premium: 100, corriente: 0, corrienteC: 40, organico: 0 }),
    "Premium",
  );
  assert.equal(
    dominantQuality({ premium: 0, corriente: 0, corrienteC: 0, organico: 0 }),
    null,
  );
});

// Reconstruye la forma real de la hoja: cuatro filas de encabezado y filas de
// datos de 83 columnas, para que los bloques SALIDA caigan en 35, 43, … 75.
function dataRow(fields: Record<number, string>): string {
  const out: string[] = new Array(83).fill("");
  for (const [i, v] of Object.entries(fields)) out[Number(i)] = v;
  // Quote any field containing a comma so the CSV round-trips.
  return out.map((f) => (f.includes(",") ? `"${f}"` : f)).join(",");
}

const HEADER = [
  "",
  ",,,,,ENTRADAS,,,,,,,,CLASIFICACION",
  "Fecha,# Remision,# ODC,# Recepcion,CODIGO",
  ",,,,,Bultos ingresan,Bultos salen,Total bultos",
].join("\n");

test("parseInventorySheet maps lots, classification and the six salidas", () => {
  const csv = [
    HEADER,
    // Lote orgánico con dos salidas, la segunda sin fecha ni remisión.
    dataRow({
      0: "5-may-2025",
      1: "2007",
      4: "CO-ANT-URA-050525",
      10: "200",
      11: "3",
      12: "197",
      17: "200", // ingresada · orgánico
      21: "197", // disponible · orgánico
      35: "8-jul-2025",
      39: "2", // salida 1 · orgánico
      41: "MACRORUEDA",
      42: "2031",
      47: "1", // salida 2 · orgánico, sin fecha
      49: "MUESTRAS",
    }),
    // Lote premium con datos de entrada, calidad y una salida en el bloque 6.
    dataRow({
      0: "11-jun-2025",
      1: "2020",
      2: "ODC-77",
      3: "REC-12",
      4: "CO-TOL-FAL-110625",
      5: "195",
      8: "$9.200",
      9: "15000",
      10: "1.705",
      11: "1.705",
      12: "0",
      13: "ALTO",
      14: "1.705", // ingresada · premium
      22: "12,5", // merma
      23: "4", // pasilla
      24: "1,2", // % merma
      25: "0,4", // % pasilla
      26: "64",
      27: "23",
      28: "3",
      29: "6,5",
      30: "1",
      32: "8,5",
      33: "1,33",
      34: "87",
      35: "17-jun-2025",
      36: "1.700", // salida 1 · premium
      40: "20", // bultos
      41: "CASA LUKER",
      42: "2022",
      75: "20-jul-2025",
      76: "5", // salida 6 · premium
      81: "TOLIMAX",
      82: "2050",
    }),
    // Fila TOTAL — sin código, debe ignorarse.
    dataRow({ 10: "201136,03", 11: "TOTAL" }),
  ].join("\n");

  const { lots, dispatches, rowsRead } = parseInventorySheet(csv);

  assert.equal(rowsRead, 2);
  assert.equal(lots.length, 2);

  const organico = lots[0];
  assert.equal(organico.code, "CO-ANT-URA-050525");
  assert.equal(organico.entry_date, "2025-05-05");
  assert.equal(organico.remision, "2007");
  assert.equal(organico.qty_in_kg, 200);
  assert.equal(organico.qty_out_kg, 3);
  assert.equal(organico.qty_in_organico_kg, 200);
  assert.equal(organico.qty_avail_organico_kg, 197);
  assert.equal(organico.quality, "Orgánico");

  const premium = lots[1];
  assert.equal(premium.odc, "ODC-77");
  assert.equal(premium.recepcion, "REC-12");
  assert.equal(premium.bultos_in, 195);
  assert.equal(premium.purchase_price_cop_kg, 9200);
  assert.equal(premium.qty_requested_kg, 15000);
  assert.equal(premium.qty_in_kg, 1705);
  assert.equal(premium.cadmio, "ALTO");
  assert.equal(premium.quality, "Premium");
  assert.equal(premium.merma_kg, 12.5);
  assert.equal(premium.pasilla_kg, 4);
  assert.equal(premium.merma_pct, 1.2);
  assert.equal(premium.pct_bien_fermentado, 64);
  assert.equal(premium.pct_purpura, 6.5);
  assert.equal(premium.pct_hongos, null); // columna vacía → null, no 0
  assert.equal(premium.pct_humedad, 8.5);
  assert.equal(premium.indice_grano_100g, 1.33);
  assert.equal(premium.pct_fermentacion_total, 87);

  // Dos salidas del primer lote + dos del segundo (bloques 1 y 6).
  assert.equal(dispatches.length, 4);

  assert.deepEqual(dispatches[0], {
    source_key: "CO-ANT-URA-050525#2007#s1",
    dispatch_date: "2025-07-08",
    destination: "MACRORUEDA",
    qty_kg: 2,
    qty_premium_kg: 0,
    qty_corriente_kg: 0,
    qty_corriente_c_kg: 0,
    qty_organico_kg: 2,
    bultos: null,
    remision_salida: "2031",
    remision_entrada: "2007",
    origin: "CO-ANT-URA-050525",
  });

  // Salida sin fecha: se guarda null en vez de inventar el día de hoy.
  assert.equal(dispatches[1].source_key, "CO-ANT-URA-050525#2007#s2");
  assert.equal(dispatches[1].dispatch_date, null);
  assert.equal(dispatches[1].destination, "MUESTRAS");
  assert.equal(dispatches[1].qty_kg, 1);

  assert.equal(dispatches[2].source_key, "CO-TOL-FAL-110625#2020#s1");
  assert.equal(dispatches[2].qty_kg, 1700);
  assert.equal(dispatches[2].qty_premium_kg, 1700);
  assert.equal(dispatches[2].bultos, 20);
  assert.equal(dispatches[2].destination, "CASA LUKER");

  // El sexto bloque de salida existe en la hoja y debe leerse.
  assert.equal(dispatches[3].source_key, "CO-TOL-FAL-110625#2020#s6");
  assert.equal(dispatches[3].qty_kg, 5);
  assert.equal(dispatches[3].destination, "TOLIMAX");
  assert.equal(dispatches[3].dispatch_date, "2025-07-20");
});

test("parseInventorySheet ignora bloques de salida vacíos", () => {
  const csv = [
    HEADER,
    dataRow({ 0: "5-may-2025", 4: "CO-X-1", 10: "100", 14: "100" }),
  ].join("\n");

  const { lots, dispatches } = parseInventorySheet(csv);
  assert.equal(lots.length, 1);
  assert.equal(dispatches.length, 0);
});
