import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCoNumber,
  parseEsDate,
  parseCsv,
  parseInventorySheet,
  dominantQuality,
} from "./sheet-sync";
import { construirMapa, columna, ColumnaFaltante } from "./sheet-columns";

test("parseEsDate handles Spanish abbreviations", () => {
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

test("dominantQuality picks the classification with most kilos", () => {
  assert.equal(dominantQuality({ premium: 0, corriente: 0, corrienteC: 0, organico: 200 }), "Orgánico");
  assert.equal(dominantQuality({ premium: 100, corriente: 0, corrienteC: 40, organico: 0 }), "Premium");
  assert.equal(dominantQuality({ premium: 0, corriente: 0, corrienteC: 0, organico: 0 }), null);
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

// ── Hoja completa ───────────────────────────────────────────────────────────

/**
 * Reconstruye la hoja real: fila en blanco, grupos macro, subgrupos y nombres
 * finales. `extra` inserta columnas nuevas para comprobar que el parser las
 * ignora en vez de descolocarse — que es justo lo que rompió el sync dos veces.
 */
function hoja({
  extra = false,
  recepciones = null,
}: {
  extra?: boolean;
  /**
   * Dos filas del MISMO lote y la MISMA remisión, cada una con su recepción:
   * el caso que la 0061 hizo posible y que dejó el sync caído seis días.
   */
  recepciones?: [string, string] | null;
} = {}) {
  const sub: string[] = [];
  const hojaFila: string[] = [];
  const push = (s: string, h = "") => {
    sub.push(s);
    hojaFila.push(h);
  };

  push("Fecha");
  push("# Remision");
  push("# Recepcion");
  push("CODIGO  DE PROCEDENCIA  Y/O DESTINO");
  push("CANTIDAD INGRESADA (KG)");
  push("CANTIDAD SALIDA");
  push("CADMIO");
  if (extra) push("SELECION SI/NO"); // la columna que insertaron de verdad
  push("CANTIDAD INGRESADA", "PREMIUM");
  push("", "CORRIENTE");
  push("", "CORRIENTE C");
  push("", "ORGANICO");
  push("CANTIDAD DISPONIBLE EN BODEGA", "PREMIUM");
  push("", "CORRIENTE");
  push("", "CORRIENTE C");
  push("", "ORGANICO");
  const salidaEn = sub.length;
  for (const n of [1, 2]) {
    push(`SALIDA ${n}`, "FECHA");
    push("", "PREMIUM");
    push("", "CORRIENTE");
    push("", "CORRIENTE C");
    push("", n === 1 ? "ORGANNICO" : "ORGANICO"); // errata real de la hoja
    push("", "BULTOS");
    push("", "EMPRESA");
    push("", "REMISION SALIDA");
  }

  const fila = (v: Record<number, string>) => {
    const out = new Array(sub.length).fill("");
    for (const [i, x] of Object.entries(v)) out[Number(i)] = x;
    return out.map((f) => (f.includes(",") ? `"${f}"` : f)).join(",");
  };

  const off = extra ? 1 : 0;
  const csv = [
    "",
    ",,,,ENTRADAS",
    sub.map((s) => (s.includes(",") ? `"${s}"` : s)).join(","),
    hojaFila.map((s) => (s.includes(",") ? `"${s}"` : s)).join(","),
    fila({
      0: "5-may-2025",
      1: "2007",
      3: "CO-ANT-URA-050525",
      4: "200",
      5: "3",
      6: "ALTO",
      [10 + off]: "200", // ingresada · orgánico
      [14 + off]: "197", // disponible · orgánico
      [salidaEn]: "8-jul-2025",
      [salidaEn + 4]: "2",
      [salidaEn + 6]: "MACRORUEDA",
      [salidaEn + 7]: "2031",
      [salidaEn + 12]: "1", // salida 2 · orgánico, sin fecha
      [salidaEn + 14]: "MUESTRAS",
    }),
    fila({ 4: "201136,03", 5: "TOTAL" }), // fila TOTAL, sin código
  ];
  if (recepciones) {
    // El mismo código y la misma remisión, dos recepciones, una salida cada una.
    csv.splice(
      4,
      1,
      ...recepciones.map((rec, i) =>
        fila({
          0: "21-ago-2026",
          1: "24",
          2: rec,
          3: "COL-MET-GRA-210826(DELEITE)",
          4: i === 0 ? "4499,8" : "50",
          [10 + off]: i === 0 ? "4499,8" : "50",
          [salidaEn]: i === 0 ? "27-ago-2026" : "21-ago-2026",
          [salidaEn + 2]: i === 0 ? "4499,8" : "50",
          [salidaEn + 6]: i === 0 ? "CASA LUKER" : "TIEMPO CHOCOLATE",
          [salidaEn + 7]: i === 0 ? "2145" : "2144",
        }),
      ),
    );
  }
  return csv.join("\n");
}

test("parseInventorySheet lee lotes y salidas por nombre de columna", () => {
  const { lots, dispatches, rowsRead } = parseInventorySheet(hoja());
  assert.equal(rowsRead, 1);
  assert.equal(lots.length, 1);

  const l = lots[0];
  assert.equal(l.code, "CO-ANT-URA-050525");
  assert.equal(l.entry_date, "2025-05-05");
  assert.equal(l.qty_in_kg, 200);
  assert.equal(l.qty_out_kg, 3);
  assert.equal(l.cadmio, "ALTO");
  assert.equal(l.qty_in_organico_kg, 200);
  assert.equal(l.qty_avail_organico_kg, 197);
  assert.equal(l.quality, "Orgánico");

  assert.equal(dispatches.length, 2);
  assert.equal(dispatches[0].dispatch_date, "2025-07-08");
  assert.equal(dispatches[0].destination, "MACRORUEDA");
  assert.equal(dispatches[0].qty_kg, 2);
  assert.equal(dispatches[0].remision_salida, "2031");
  // Salida sin fecha: null en vez de inventarle un día.
  assert.equal(dispatches[1].dispatch_date, null);
  assert.equal(dispatches[1].destination, "MUESTRAS");
});

test("una columna nueva en medio no descoloca el resto", () => {
  // Es el fallo que rompió el sync dos veces: con índices fijos, insertar
  // "SELECION SI/NO" corría todo lo de la derecha una casilla.
  const sin = parseInventorySheet(hoja());
  const con = parseInventorySheet(hoja({ extra: true }));
  assert.deepEqual(con.lots, sin.lots);
  assert.deepEqual(con.dispatches, sin.dispatches);
});

test("parseInventorySheet falla si desaparece una columna obligatoria", () => {
  // Mejor una corrida en rojo que doscientas filas con los campos corridos.
  const roto = hoja().replace("CANTIDAD SALIDA", "CANT. DE SALIDA TOTAL");
  assert.throws(() => parseInventorySheet(roto), ColumnaFaltante);
});

test("la clave del despacho lleva la recepción, como la del lote", () => {
  // Un lote puede llegar varias veces bajo la misma remisión. La 0061 metió la
  // recepción en la clave del lote y dejó la del despacho como estaba, así que
  // la primera salida de dos recepciones distintas se llamaba igual y Postgres
  // abortaba el upsert entero: seis días de inventario congelado.
  const { lots, dispatches } = parseInventorySheet(
    hoja({ recepciones: ["2414", "2416"] }),
  );
  assert.equal(lots.length, 2);
  assert.equal(dispatches.length, 2);
  assert.notEqual(dispatches[0].source_key, dispatches[1].source_key);
  assert.match(dispatches[0].source_key, /#24#2414#s1$/);
  assert.match(dispatches[1].source_key, /#24#2416#s1$/);
});

test("lotes distintos dan claves de despacho distintas", () => {
  // Las dos claves van juntas: la del despacho es la del lote más la casilla.
  // Cambiar una sin la otra es exactamente el fallo de arriba, y este test es
  // lo que impide que vuelva a pasar sin que nadie se entere.
  const { lots, dispatches } = parseInventorySheet(
    hoja({ recepciones: ["2414", "2416"] }),
  );
  const clavesLote = new Set(
    lots.map((l) => `${l.code}|${l.remision ?? ""}|${l.recepcion ?? ""}`),
  );
  const prefijos = new Set(
    dispatches.map((d) => d.source_key.split("#").slice(0, 3).join("|")),
  );
  assert.equal(clavesLote.size, lots.length, "cada lote, una clave");
  for (const p of prefijos) {
    assert.ok(clavesLote.has(p), `«${p}» no corresponde a ningún lote`);
  }
});
