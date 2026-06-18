import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCoNumber,
  parseEsDate,
  parseCsv,
  parseInventorySheet,
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

// Reconstruct the real sheet shape: 3 header rows + data rows. Columns are
// padded so the salida blocks land at their fixed indexes (18, 22, …).
function dataRow(fields: Record<number, string>): string {
  const out: string[] = new Array(38).fill("");
  for (const [i, v] of Object.entries(fields)) out[Number(i)] = v;
  // Quote any field containing a comma so the CSV round-trips.
  return out.map((f) => (f.includes(",") ? `"${f}"` : f)).join(",");
}

const HEADER = ["", "ENTRADAS", "Fecha,# Remision", ""].join("\n");

test("parseInventorySheet maps lots and salidas, skips TOTAL rows", () => {
  const csv = [
    HEADER,
    dataRow({
      0: "5-may-2025",
      1: "2007",
      4: "CO-ANT-URA-050525",
      5: "200",
      6: "3",
      7: "197",
      17: "1",
      18: "8-jul-2025",
      19: "2",
      20: "MACRORUEDA",
      21: "2031",
    }),
    dataRow({
      0: "26-may-2025",
      1: "2016",
      4: "CO-MET-PRCO-260525",
      5: "1000",
      6: "1000",
      18: "27-may-2025",
      19: "764,25",
      20: "CASA LUKER",
      21: "2017",
      22: "4-may-2025",
      23: "100",
      24: "CONTRADE CORPORATION",
      25: "2018",
    }),
    // TOTAL row — no code, must be ignored.
    dataRow({ 6: "172444,38", 7: "TOTAL" }),
  ].join("\n");

  const { lots, dispatches, rowsRead } = parseInventorySheet(csv);

  assert.equal(rowsRead, 2);
  assert.equal(lots.length, 2);

  assert.deepEqual(lots[0], {
    code: "CO-ANT-URA-050525",
    entry_date: "2025-05-05",
    remision: "2007",
    qty_in_kg: 200,
    qty_out_kg: 3,
    samples_pasilla_merma_kg: 1,
    notes: null,
  });

  // First lot: one salida. Second lot: two salidas → 3 dispatches total.
  assert.equal(dispatches.length, 3);

  assert.deepEqual(dispatches[0], {
    source_key: "CO-ANT-URA-050525#2007#s1",
    dispatch_date: "2025-07-08",
    destination: "MACRORUEDA",
    qty_kg: 2,
    remision_salida: "2031",
    remision_entrada: "2007",
    origin: "CO-ANT-URA-050525",
  });

  const second = dispatches.filter((d) => d.origin === "CO-MET-PRCO-260525");
  assert.equal(second.length, 2);
  assert.equal(second[0].qty_kg, 764.25);
  assert.equal(second[0].source_key, "CO-MET-PRCO-260525#2016#s1");
  assert.equal(second[1].source_key, "CO-MET-PRCO-260525#2016#s2");
});
