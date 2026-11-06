import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCoNumber,
  parseEsDate,
  parseCsv,
  parseInventorySheet,
  claseDominante,
  CLASES,
  type PorClase,
} from "./sheet-sync";
import { construirMapa, columna, columnaPrefijo, ColumnaFaltante } from "./sheet-columns";
import { readFileSync } from "node:fs";

test("parseEsDate handles Spanish abbreviations", () => {
  assert.equal(parseEsDate("23-sept-2025"), "2025-09-23");
  assert.equal(parseEsDate("5-may-2025"), "2025-05-05");
  assert.equal(parseEsDate("26-may-2025"), "2025-05-26");
  assert.equal(parseEsDate("1-ago-2025"), "2025-08-01");
  assert.equal(parseEsDate(""), null);
  assert.equal(parseEsDate("not a date"), null);
  assert.equal(parseEsDate(undefined), null);
});

test("parseCoNumber handles Colombian locale", () => {
  assert.equal(parseCoNumber("200"), 200);
  assert.equal(parseCoNumber("764,25"), 764.25);
  assert.equal(parseCoNumber("172.444,38"), 172444.38);
  assert.equal(parseCoNumber("$9.200"), 9200);
  assert.equal(parseCoNumber(""), null);
  assert.equal(parseCoNumber("TOTAL"), null);
});

test("parseCsv keeps quoted commas as one field", () => {
  const rows = parseCsv('a,"764,25",b\n1,2,3');
  assert.deepEqual(rows[0], ["a", "764,25", "b"]);
  assert.deepEqual(rows[1], ["1", "2", "3"]);
});

const cero = (): PorClase => Object.fromEntries(CLASES.map((c) => [c, 0])) as PorClase;

test("claseDominante elige la clasificación con más kilos", () => {
  assert.equal(claseDominante({ ...cero(), organico: 200 }), "organico");
  assert.equal(claseDominante({ ...cero(), premium: 100, corriente_c: 40 }), "premium");
  assert.equal(claseDominante(cero()), "");
});

// ── Localización de columnas por encabezado ─────────────────────────────────

test("construirMapa rellena las celdas combinadas del encabezado", () => {
  const sub = ["Fecha", "", "CANTIDAD INGRESADA", "", "", ""];
  const hoja = ["", "", "PREMIUM", "CORRIENTE", "CORRIENTE C", "ORGANICO"];
  const mapa = construirMapa(sub, hoja);
  assert.equal(columna(mapa, "Fecha"), 0);
  assert.equal(columna(mapa, "CANTIDAD INGRESADA|PREMIUM"), 2);
  // Las tres siguientes heredan el subgrupo de la celda combinada.
  assert.equal(columna(mapa, "CANTIDAD INGRESADA|ORGANICO"), 5);
});

test("columna ignora tildes, mayúsculas y espacios de más", () => {
  const mapa = construirMapa(["ITEMS DE EVALUACION"], ["Total  fermentación"]);
  assert.equal(columna(mapa, "items de evaluacion|total fermentacion"), 0);
});

test("columna lanza cuando el encabezado no existe", () => {
  const mapa = construirMapa(["Fecha"], [""]);
  assert.throws(() => columna(mapa, "CANTIDAD SALIDA"), ColumnaFaltante);
});

test("columnaPrefijo encuentra encabezados con la instrucción pegada", () => {
  const mapa = construirMapa(
    ["CANTIDAD MERMA (incluye selección, movimiento y almacenamiento) (KG)"],
    [""],
  );
  assert.equal(columnaPrefijo(mapa, "CANTIDAD MERMA"), 0);
  assert.throws(() => columnaPrefijo(mapa, "CANTIDAD SALIDAS"), ColumnaFaltante);
});

// ── Archivo de 2026-11 ──────────────────────────────────────────────────────
//
// El fixture son filas LITERALES del export CSV (encabezados + 11 filas con código y TOTALES),
// no inventadas: suponer el formato ya costó dos fallos silenciosos.

const FIXTURE = readFileSync(
  new URL("./fixtures/inventario-2026-11.csv", import.meta.url),
  "utf8",
);

test("lee lotes con sus ocho clasificaciones y el disponible del archivo", () => {
  const { lots, rowsRead } = parseInventorySheet(FIXTURE);
  // 11 filas con código; las dos órdenes de Chocomet sin llegar no son lotes.
  assert.equal(rowsRead, 11);
  assert.equal(lots.length, 9);

  const santander = lots.find((l) => l.remision === "0230")!;
  assert.equal(santander.clase, "estandar");
  assert.equal(santander.quality, "Estándar");
  assert.equal(santander.proveedor, "LOS SAUCES");
  assert.equal(santander.departamento, "SANTANDER");
  assert.equal(santander.code, "CO-SANTANDER -LEBRIJA -4112026");
  assert.equal(santander.entry_date, "2026-11-04");
  assert.equal(santander.qty_in_kg, 9560.3);
  assert.equal(santander.qty_avail_estandar_kg, 9510.4);
  assert.equal(santander.purchase_price_cop_kg, 15450);
  assert.equal(santander.odc, "98");
});

test("disponible = ingresos − salidas − merma, como el trigger de la base", () => {
  const { lots } = parseInventorySheet(FIXTURE);
  for (const l of lots) {
    const porClase =
      l.qty_avail_premium_kg + l.qty_avail_estandar_kg + l.qty_avail_corriente_kg +
      l.qty_avail_corriente_c_kg + l.qty_avail_fairtrade_kg + l.qty_avail_rainforest_kg +
      l.qty_avail_organico_kg + l.qty_avail_pasilla_kg;
    const calculado = l.qty_in_kg - l.qty_out_kg - l.merma_kg;
    assert.ok(Math.abs(calculado - porClase) < 0.05, `${l.code}: ${calculado} vs ${porClase}`);
  }
});

test("una recepción partida en dos filas por calidad da dos lotes distintos", () => {
  const { lots } = parseInventorySheet(FIXTURE);
  const partes = lots.filter((l) => l.code === "CO-CUN-NIL-230925");
  assert.deepEqual(partes.map((l) => l.clase).sort(), ["estandar", "organico"]);
  const cisca = lots.filter((l) => l.code === "COL-CAU-SAN-190926( CISCA RUTAS 2)");
  assert.deepEqual(cisca.map((l) => l.clase).sort(), ["estandar", "pasilla"]);
});

test("una celda #VALUE! no tumba la fila", () => {
  const { lots } = parseInventorySheet(FIXTURE);
  const finca = lots.find((l) => l.code === "COL-CUN-NIL-220926(FINCA)" && l.clase === "estandar")!;
  assert.equal(finca.qty_in_kg, 74);
  assert.ok(Math.abs(finca.qty_in_kg - finca.qty_out_kg - finca.merma_kg) < 0.01);
});

test("las salidas suman lo mismo que descuentan los lotes", () => {
  const { lots, dispatches } = parseInventorySheet(FIXTURE);
  const salidas = dispatches.reduce((s, d) => s + d.qty_kg, 0);
  const out = lots.reduce((s, l) => s + l.qty_out_kg, 0);
  assert.ok(Math.abs(salidas - out) < 0.01, `${salidas} vs ${out}`);
  const luker = dispatches.find((d) => d.remision_salida === "2010")!;
  assert.equal(luker.destination, "CASA LUKER");
  assert.equal(luker.dispatch_date, "2025-05-17");
});

test("la clave del despacho es la del lote más la casilla de salida", () => {
  const { lots, dispatches } = parseInventorySheet(FIXTURE);
  const clavesLote = new Set(lots.map((l) => `${l.code}#${l.remision ?? ""}#${l.recepcion ?? ""}#${l.clase}`));
  for (const d of dispatches) {
    const lote = d.source_key.replace(/#s\d+$/, "");
    assert.ok(clavesLote.has(lote), `${d.source_key} no corresponde a ningún lote`);
    assert.equal(lote, `${d.lot_code}#${d.lot_remision ?? ""}#${d.lot_recepcion ?? ""}#${d.lot_clase}`);
  }
  assert.equal(new Set(dispatches.map((d) => d.source_key)).size, dispatches.length);
});

test("una columna nueva en medio no descoloca el resto", () => {
  const filas = parseCsv(FIXTURE).map((f) => [...f.slice(0, 20), "", ...f.slice(20)]);
  filas[2][20] = "COLUMNA NUEVA";
  const csv = filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = parseInventorySheet(FIXTURE);
  const b = parseInventorySheet(csv);
  assert.deepEqual(b.lots, a.lots);
  assert.deepEqual(b.dispatches, a.dispatches);
});

test("falla si desaparece una columna obligatoria", () => {
  const filas = parseCsv(FIXTURE);
  const i = filas[2].findIndex((c) => c.startsWith("CANTIDAD SALIDAS"));
  filas[2][i] = "OTRA COSA";
  const csv = filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  assert.throws(() => parseInventorySheet(csv), ColumnaFaltante);
});

test("dos filas con la misma clave se nombran en el error", () => {
  const filas = parseCsv(FIXTURE);
  const fila = filas.find((f) => f[11] === "CO-ANT-URA-050525")!;
  filas.push([...fila]);
  const csv = filas.map((f) => f.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  assert.throws(() => parseInventorySheet(csv), /CO-ANT-URA-050525/);
});
