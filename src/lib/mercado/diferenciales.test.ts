import { test } from "node:test";
import assert from "node:assert/strict";
import {
  numero,
  moneda,
  parsearMatriz,
  buscarFila,
  estimarColombia,
  etiqueta,
  baseColombia,
} from "./diferenciales";

/** El reporte real del 20-ago-2026, tal como lo entrega el agente. */
const REAL: string[][] = [
  ["Cocoa Differentials"],
  ["August 20th, 2026"],
  ["a"],
  ["DIFFERENTIAL", "PRICE"],
  ["Ivory Coast", "13-Aug", "20-Aug", "Change", "GBP", "EUR", "USD"],
  ["CIF N. Europe", "£ 380", "£ 450", "£ 70", "£ 4,786", "€ 5,587", "$ 6,521"],
  ["CIF N. Europe + LID", "£ 295", "£ 295", "£ -", "£ 4,631", "€ 5,406", "$ 6,310"],
  ["ExW US", "$ 400", "$ 450", "$ 50", "£ 4,781", "€ 5,581", "$ 6,514"],
  ["Ghana"],
  ["CIF UK + LID", "£ 581", "£ 600", "£ 19", "£ 4,936", "€ 5,762", "$ 6,725"],
  ["ExW US", "$ 850", "$ 825", "$ (25)", "£ 5,056", "€ 5,903", "$ 6,889"],
  ["Ecuador Grade 2"],
  ["CIF N. Europe", "£ 430", "£ 430", "£ -", "£ 4,766", "€ 5,564", "$ 6,494"],
  ["ExW US", "$ 380", "$ 320", "$ (60)", "£ 4,686", "€ 5,470", "$ 6,384"],
  ["FOB Guayaquil", "$ 90", "$ (30)", "$ (120)", "£ 4,429", "€ 5,170", "$ 6,034"],
  ["Other Origins"],
  ["Peru Grade 1 ExW US", "$ 326", "$ 281", "$ (45)", "£ 4,657", "€ 5,437", "$ 6,345"],
  ["FUTURES", "EXCHANGE RATES"],
  ["NY-DEC", "$5,719", "$6,064", "$345", "EURUSD", "$ 1.1525", "$ 1.1671", "0.0146"],
  ["Source: CRA, Reuters"],
];

const { filas, ignoradas } = parsearMatriz(REAL);

test("los paréntesis son negativos y las comas son miles", () => {
  assert.equal(numero("$ (250)"), -250);
  assert.equal(numero("£ 4,786"), 4786);
  assert.equal(numero("£ -"), null, "un guion es «sin cambio», no cero");
  assert.equal(moneda("£ 450"), "GBP");
  assert.equal(moneda("$ 450"), "USD");
});

test("el origen viene de la sección, no de cada fila", () => {
  const ghana = filas.filter((f) => f.origen === "Ghana");
  assert.equal(ghana.length, 2);
  assert.deepEqual(ghana.map((f) => f.incoterm), ["CIF UK + LID", "ExW US"]);
  // La primera sección sale del encabezado de columnas, que la lleva pegada.
  assert.ok(filas.some((f) => f.origen === "Ivory Coast"));
});

test("se toma el diferencial VIGENTE, no el de la semana pasada", () => {
  // Ghana ExW US: 850 la semana pasada, 825 esta. Tomar el primero daría un
  // número viejo con toda la apariencia de estar al día.
  const g = filas.find((f) => f.origen === "Ghana" && f.incoterm === "ExW US")!;
  assert.equal(g.valor, 825);
  assert.equal(g.valorAnterior, 850);
});

test("la moneda se lee por fila, no por tabla", () => {
  const cif = filas.find((f) => f.origen === "Ivory Coast" && f.incoterm === "CIF N. Europe")!;
  const exw = filas.find((f) => f.origen === "Ivory Coast" && f.incoterm === "ExW US")!;
  assert.equal(cif.moneda, "GBP");
  assert.equal(exw.moneda, "USD");
});

test("los negativos del reporte se conservan", () => {
  const fob = filas.find((f) => f.incoterm === "FOB Guayaquil")!;
  assert.equal(fob.valor, -30);
  assert.equal(fob.origen, "Ecuador Grade 2");
});

test("la tabla de futuros y el pie no entran como orígenes", () => {
  assert.ok(!filas.some((f) => /NY-DEC|Source|FUTURES/i.test(f.origen)));
  assert.ok(ignoradas.length > 0, "lo descartado se reporta, no se calla");
});

test("con el mismo incoterm, Colombia queda entre Perú y Ecuador", () => {
  // Perú Grade 1 ExW US = 281 · Ecuador Grade 2 ExW US = 320.
  const r = estimarColombia(filas, "Peru Grade 1", "Ecuador Grade 2 ExW US");
  if ("error" in r) throw new Error(r.error);
  assert.equal(r.referenciaBaja.valor, 281);
  assert.equal(r.referenciaAlta.valor, 320);
  // 281 + 77,5 % de 39 = 311,225, redondeado a dos decimales.
  assert.equal(r.valor, 311.23);
  assert.equal(r.incoterm, "ExW US");
  assert.equal(r.advertencia, null, "mismo incoterm, sin advertencia");
});

test("mezclar incoterms se permite pero se advierte", () => {
  // Perú ExW US (281) contra FOB Guayaquil (−30): la diferencia incluye flete.
  const r = estimarColombia(filas, "FOB Guayaquil", "Peru Grade 1");
  if ("error" in r) throw new Error(r.error);
  assert.equal(r.referenciaBaja.valor, -30);
  assert.equal(r.referenciaAlta.valor, 281);
  assert.match(r.advertencia ?? "", /incoterms distintos/);
});

test("cuál es la cara se decide por valor, no por nombre", () => {
  // En este reporte Ecuador FOB (−30) es MÁS BARATO que Perú (281): si la cara
  // se fijara por nombre, Colombia caería del lado equivocado.
  const r = estimarColombia(filas, "Peru Grade 1", "FOB Guayaquil");
  if ("error" in r) throw new Error(r.error);
  assert.equal(r.referenciaAlta.etiqueta, "Peru Grade 1 · ExW US");
});

test("no se interpola entre monedas distintas", () => {
  const r = estimarColombia(filas, "Ivory Coast CIF N. Europe", "Peru Grade 1");
  assert.ok("error" in r && /no son comparables/.test(r.error));
});

test("una fila con su propio origen manda sobre la sección", () => {
  // «Peru Grade 1 ExW US» dentro de «Other Origins»: el origen real es Perú.
  const p = filas.find((f) => f.origen === "Peru Grade 1")!;
  assert.equal(p.incoterm, "ExW US");
  assert.equal(p.valor, 281);
  assert.ok(!filas.some((f) => f.origen === "Other Origins"));
});

test("la etiqueta junta origen e incoterm", () => {
  const f = filas.find((x) => x.incoterm === "FOB Guayaquil")!;
  assert.equal(etiqueta(f), "Ecuador Grade 2 · FOB Guayaquil");
  assert.equal(buscarFila(filas, "fob guayaquil")?.valor, -30);
});

test("la base del estimado de Colombia sale del incoterm de las referencias", () => {
  // Hoy las referencias son ExW US. Rotular eso «FOB Cartagena» pondría el
  // estimado unos 350 USD/t por encima de lo que dice ser.
  assert.equal(baseColombia("ExW US"), "ExW US");
  assert.equal(baseColombia("CIF N. Europe"), "CIF N. Europe");

  // Con referencias FOB, el puerto que corresponde es el nuestro.
  assert.equal(baseColombia("FOB Guayaquil"), "FOB Cartagena");
  assert.equal(baseColombia("FOB + tax"), "FOB Cartagena");
  assert.equal(baseColombia("fob guayaquil"), "FOB Cartagena");
});

test("sin incoterm común no se inventa una base", () => {
  // `estimarColombia` deja `incoterm` en null cuando las dos referencias no
  // coinciden; ahí la fila se queda sin base antes que afirmar una falsa.
  assert.equal(baseColombia(null), null);
});
