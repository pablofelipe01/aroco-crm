import { test } from "node:test";
import assert from "node:assert/strict";
import { parseEsDate } from "@/lib/inventory/sheet-sync";
import { parsePricesSheet, resolveCompany } from "./sheet-sync";

test("parseEsDate accepts 2-digit years (20YY)", () => {
  assert.equal(parseEsDate("18-jun-26"), "2026-06-18");
  assert.equal(parseEsDate("9-jun-26"), "2026-06-09");
  assert.equal(parseEsDate("29-may-26"), "2026-05-29");
  // 4-digit still works (inventory sheet).
  assert.equal(parseEsDate("5-may-2025"), "2025-05-05");
});

test("resolveCompany maps to canonical price_history labels", () => {
  assert.equal(resolveCompany("Bajo Cadmio", "CASA LUKER"), "CASA LUKER");
  assert.equal(
    resolveCompany("Alto Cadmio", "CASA LUKER"),
    "CASA LUKER (Alto Cadmio)",
  );
  assert.equal(
    resolveCompany("Más $500 premium", "NAC. CHOCOLATE BTA"),
    "Nacional de Chocolates",
  );
  // Unknown row falls back to "company (category)".
  assert.equal(resolveCompany("Otra", "NUEVA EMPRESA"), "NUEVA EMPRESA (Otra)");
});

// Rebuild the sheet shape: 8 padding/title rows, a FECHA row, data rows, then
// the VARIACION block. Columns: 0=category, 1=company, 2+=values.
const SHEET = [
  ",,,",
  "blah",
  ",,COMPAÑÍA,VALOR REAL,VALOR REAL,VALOR REAL",
  ",FECHA,18-jun-26,17-jun-26,9-jun-26",
  "Bajo Cadmio,CASA LUKER,$11.600,$11.700,$11.250",
  "Alto Cadmio,CASA LUKER,$11.400,$11.500,$11.000",
  "Más $500 premium,NAC. CHOCOLATE BTA,$10.500,$10.500,$10.900",
  "Más $500 premium,Nac. CHOCOLATE IBAGUE,$10.450,$10.450,$10.850",
  ",,VARIACION  PRECIO,VARIACION  PRECIO,VARIACION  PRECIO",
  ",LUKER,-$ 100,$ 0,$ 100",
].join("\n");

test("parsePricesSheet un-pivots the matrix into price_history rows", () => {
  const { rows, dateCols, companies } = parsePricesSheet(SHEET);

  assert.equal(dateCols, 3); // three date columns
  assert.equal(companies, 3); // three company series (Ibagué excluded)
  assert.equal(rows.length, 9); // 3 companies × 3 dates

  // Ibagué is excluded from the sync.
  assert.ok(!rows.some((r) => /ibagu/i.test(r.company)));

  // Spot-check a few mapped rows.
  const luker0618 = rows.find(
    (r) => r.company === "CASA LUKER" && r.date === "2026-06-18",
  );
  assert.deepEqual(luker0618, {
    company: "CASA LUKER",
    date: "2026-06-18",
    price_cop_kg: 11600,
  });

  const altoLuker = rows.find((r) => r.company === "CASA LUKER (Alto Cadmio)");
  assert.ok(altoLuker);
  assert.equal(altoLuker.price_cop_kg, 11400);

  // The VARIACION block must NOT leak into the rows.
  assert.ok(!rows.some((r) => /variaci|luker$/i.test(r.company) && r.price_cop_kg < 0));
  assert.ok(rows.every((r) => r.price_cop_kg > 0));
});
