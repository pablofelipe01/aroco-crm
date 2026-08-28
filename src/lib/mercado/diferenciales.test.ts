import { test } from "node:test";
import assert from "node:assert/strict";
import {
  numero, parsearMatriz, separarGrado, buscarFila, estimarColombia,
  POSICION_COLOMBIA,
} from "./diferenciales";

test("los paréntesis del reporte son negativos", () => {
  // Convención contable habitual en estos PDF: (75) es −75, no 75.
  assert.equal(numero("(75)"), -75);
  assert.equal(numero("+150"), 150);
  assert.equal(numero("-1,250"), -1250);
  assert.equal(numero("  325 "), 325);
  assert.equal(numero("n/a"), null);
  assert.equal(numero(""), null);
});

test("el grado se separa del origen", () => {
  assert.deepEqual(separarGrado("Guayaquil grade 2"), { origen: "Guayaquil", grado: "grade 2" });
  assert.deepEqual(separarGrado("Peru grade 1"), { origen: "Peru", grado: "grade 1" });
  assert.deepEqual(separarGrado("Ivory Coast"), { origen: "Ivory Coast", grado: null });
});

test("la matriz se lee sin asumir en qué columna está el valor", () => {
  // El PDF no tiene grilla: la matriz llega como el agente pudo agruparla, y
  // las columnas varían entre semanas. Se toma el primer número de la fila.
  const { filas, ignoradas } = parsearMatriz([
    ["Origin", "Differential", "Change"],
    ["Ivory Coast", "+325", "+10"],
    ["Guayaquil grade 2", "+150", "0"],
    ["Peru grade 1", "(75)", "-5"],
    ["", "", ""],
    ["Source: StoneX"],
  ]);
  assert.deepEqual(filas.map((f) => [f.origen, f.grado, f.valor]), [
    ["Ivory Coast", null, 325],
    ["Guayaquil", "grade 2", 150],
    ["Peru", "grade 1", -75],
  ]);
  // El encabezado y el pie no se descartan en silencio: quedan reportados.
  assert.ok(ignoradas.some((x) => x.includes("Origin")));
  assert.ok(ignoradas.some((x) => x.includes("Source")));
});

const BASE = parsearMatriz([
  ["Guayaquil grade 2", "+150"],
  ["Peru grade 1", "(75)"],
]).filas;

test("Colombia queda al 77,5 % del tramo, no en el percentil de la tabla", () => {
  const r = estimarColombia(BASE);
  assert.ok(!("error" in r));
  if ("error" in r) return;
  // De −75 a +150 hay 225. El 77,5 % son 174,375 → −75 + 174,375 = 99,375.
  assert.equal(r.valor, 99.38);
  assert.equal(r.referenciaBaja.etiqueta, "Peru grade 1");
  assert.equal(r.referenciaAlta.etiqueta, "Guayaquil grade 2");
  assert.match(r.metodo, /No es una cotización de mercado/);
});

test("Colombia queda más cerca del caro que del barato", () => {
  const r = estimarColombia(BASE);
  if ("error" in r) throw new Error(r.error);
  const distAlCaro = Math.abs(r.referenciaAlta.valor - r.valor);
  const distAlBarato = Math.abs(r.valor - r.referenciaBaja.valor);
  assert.ok(distAlCaro < distAlBarato, "debe estar del lado caro del tramo");
});

test("si Perú cotiza por encima de Ecuador, el tramo se da vuelta solo", () => {
  // Cuál es el caro se decide con los valores, no con el nombre. Si no, un mes
  // en que Perú suba dejaría a Colombia del lado barato sin que nadie lo note.
  const filas = parsearMatriz([
    ["Guayaquil grade 2", "+50"],
    ["Peru grade 1", "+200"],
  ]).filas;
  const r = estimarColombia(filas);
  if ("error" in r) throw new Error(r.error);
  assert.equal(r.referenciaBaja.etiqueta, "Guayaquil grade 2");
  assert.equal(r.referenciaAlta.etiqueta, "Peru grade 1");
  assert.equal(r.valor, 50 + 0.775 * 150);
});

test("la posición es un parámetro: Comercial puede moverla", () => {
  const a = estimarColombia(BASE, 0.75);
  const b = estimarColombia(BASE, 0.8);
  if ("error" in a || "error" in b) throw new Error("no debía fallar");
  assert.equal(a.valor, -75 + 0.75 * 225);
  assert.equal(b.valor, -75 + 0.8 * 225);
  assert.ok(a.valor < b.valor);
  assert.equal(POSICION_COLOMBIA, 0.775, "el default es el centro del 75-80 %");
});

test("sin una de las dos referencias no se inventa un número", () => {
  const soloEcuador = parsearMatriz([["Guayaquil grade 2", "+150"]]).filas;
  const r = estimarColombia(soloEcuador);
  assert.ok("error" in r && /Peru grade 1/.test(r.error));
});

test("una posición fuera de 0-1 se rechaza", () => {
  const r = estimarColombia(BASE, 1.5);
  assert.ok("error" in r && /entre 0 y 1/.test(r.error));
});

test("buscarFila tolera mayúsculas y espacios de más", () => {
  assert.equal(buscarFila(BASE, "peru   GRADE 1")?.valor, -75);
});
