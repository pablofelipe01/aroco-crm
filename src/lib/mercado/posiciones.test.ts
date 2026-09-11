import { test } from "node:test";
import assert from "node:assert/strict";
import {
  etiquetaPosicion,
  posicionEfectiva,
  vigente,
  type MovimientoManual,
  type Posicion,
} from "./posiciones";

const pos = (
  option_type: string | null,
  long_qty: number,
  short_qty: number,
  strike: number | null = null,
  contract_month = "DEC26",
): Posicion => ({ option_type, long_qty, short_qty, strike, contract_month });

let n = 0;
const mov = (m: Partial<MovimientoManual> = {}): MovimientoManual => ({
  id: `m${++n}`,
  fecha: "2026-09-09",
  accion: "abre",
  tipo: "FUT",
  lado: "corto",
  contrato: "DEC26",
  strike: null,
  contratos: 1,
  ...m,
});

test("un movimiento posterior al extracto manda; el del mismo día ya no", () => {
  // El extracto del día 8 no puede contener lo que pasó el 9.
  assert.equal(vigente({ fecha: "2026-09-09" }, "2026-09-08"), true);
  // El del propio día del extracto ya debería venir dentro de él.
  assert.equal(vigente({ fecha: "2026-09-08" }, "2026-09-08"), false);
  assert.equal(vigente({ fecha: "2026-09-07" }, "2026-09-08"), false);
  // Sin extracto ninguno, todo lo anotado vale.
  assert.equal(vigente({ fecha: "2026-09-09" }, null), true);
});

test("abrir suma al lado indicado", () => {
  // El caso del 9-sep: Álvaro abre 2 contratos y el CRM sigue en cero.
  const r = posicionEfectiva(
    [],
    [mov({ accion: "abre", lado: "corto", contratos: 2 })],
    "2026-09-08",
  );
  assert.equal(r.posiciones.length, 1);
  assert.equal(r.posiciones[0].short_qty, 2);
  assert.equal(r.posiciones[0].long_qty, 0);
  assert.equal(r.posiciones[0].delExtracto.short, 0, "el extracto no traía nada");
  assert.equal(r.posiciones[0].ajusteManual.short, 2);
  assert.equal(r.aplicados.length, 1);
  assert.equal(r.superados.length, 0);
});

test("cerrar baja el MISMO lado, no sube el contrario", () => {
  // «Cerré el futuro vendido» baja el corto. Si subiera el largo, la pantalla
  // diría que hay una posición nueva abierta justo al revés.
  const r = posicionEfectiva(
    [pos(null, 0, 3)],
    [mov({ accion: "cierra", lado: "corto", contratos: 1 })],
    "2026-09-08",
  );
  assert.equal(r.posiciones[0].short_qty, 2);
  assert.equal(r.posiciones[0].long_qty, 0);
  assert.equal(r.posiciones[0].ajusteManual.short, -1);
});

test("el extracto manda en cuanto alcanza la fecha del movimiento", () => {
  const m = [mov({ fecha: "2026-09-09", accion: "abre", lado: "corto", contratos: 2 })];

  // Con el extracto del 8, el movimiento suma.
  const antes = posicionEfectiva([pos(null, 0, 1)], m, "2026-09-08");
  assert.equal(antes.posiciones[0].short_qty, 3);

  // Llega el extracto del 9 —que ya trae los 3— y el movimiento deja de
  // aplicarse solo. Sin esta regla se sumaría dos veces: 5 contratos donde
  // hay 3, y la pantalla diría casi el doble de cobertura.
  const despues = posicionEfectiva([pos(null, 0, 3)], m, "2026-09-09");
  assert.equal(despues.posiciones[0].short_qty, 3);
  assert.equal(despues.aplicados.length, 0);
  assert.equal(despues.superados.length, 1);
});

test("un movimiento superado se conserva para poder comprobarlo", () => {
  // El 1-sep pasó esto: un futuro vendido que se había cerrado seguía
  // apareciendo abierto en el extracto de la mañana. El movimiento superado
  // es la prueba de que se cerró; esconderlo dejaría la discrepancia invisible.
  const r = posicionEfectiva(
    [pos(null, 0, 1)],
    [mov({ fecha: "2026-09-01", accion: "cierra", lado: "corto" })],
    "2026-09-02",
  );
  assert.equal(r.superados.length, 1);
  assert.equal(r.posiciones[0].short_qty, 1, "el extracto sigue mandando");
});

test("los movimientos caen sobre la posición correcta por mes y strike", () => {
  const r = posicionEfectiva(
    [pos("PUT", 5, 0, 6000), pos("PUT", 2, 0, 6500)],
    [mov({ tipo: "PUT", strike: 6000, lado: "largo", accion: "cierra", contratos: 2 })],
    "2026-09-08",
  );
  const p6000 = r.posiciones.find((p) => p.strike === 6000)!;
  const p6500 = r.posiciones.find((p) => p.strike === 6500)!;
  assert.equal(p6000.long_qty, 3);
  assert.equal(p6500.long_qty, 2, "el otro strike no se toca");
});

test("un futuro no se mezcla con una opción del mismo mes", () => {
  const r = posicionEfectiva(
    [pos(null, 0, 2)],
    [mov({ tipo: "PUT", strike: 6000, lado: "largo", contratos: 1 })],
    "2026-09-08",
  );
  assert.equal(r.posiciones.length, 2);
  assert.equal(r.posiciones.find((p) => p.option_type === null)!.short_qty, 2);
  assert.equal(r.posiciones.find((p) => p.option_type === "PUT")!.long_qty, 1);
});

test("el extracto con la misma posición en varias filas se suma", () => {
  // StoneX puede partir una posición en varias líneas por fecha de operación.
  const r = posicionEfectiva([pos(null, 0, 2), pos(null, 0, 3)], [], "2026-09-08");
  assert.equal(r.posiciones.length, 1);
  assert.equal(r.posiciones[0].short_qty, 5);
});

test("una posición que queda en cero desaparece, una negativa se queda", () => {
  const cerrada = posicionEfectiva(
    [pos(null, 0, 1)],
    [mov({ accion: "cierra", lado: "corto", contratos: 1 })],
    "2026-09-08",
  );
  assert.equal(cerrada.posiciones.length, 0, "cerrada del todo, fuera de la lista");

  // Cerrar más de lo que hay es un error de registro y tiene que verse.
  const pasada = posicionEfectiva(
    [pos(null, 0, 1)],
    [mov({ accion: "cierra", lado: "corto", contratos: 3 })],
    "2026-09-08",
  );
  assert.equal(pasada.posiciones[0].short_qty, -2);
});

test("la etiqueta distingue futuro de opción", () => {
  assert.equal(
    etiquetaPosicion({ option_type: null, contract_month: "DEC26", strike: null }),
    "Futuro DEC26",
  );
  assert.match(
    etiquetaPosicion({ option_type: "PUT", contract_month: "DEC26", strike: 6000 }),
    /^PUT DEC26 6\.000$/,
  );
});
