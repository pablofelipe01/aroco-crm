import { test } from "node:test";
import assert from "node:assert/strict";
import {
  estaArchivada,
  etiquetaMes,
  mesEnBogota,
  mesesArchivados,
  rangoDelMes,
} from "./archivo";

/** 4 de septiembre de 2026, media mañana en Bogotá. */
const HOY = new Date("2026-09-04T15:00:00Z");

test("el mes se cuenta en hora de Bogotá, no en UTC", () => {
  // 31 de agosto, 8 de la noche en Bogotá. En UTC ya es 1 de septiembre: si el
  // mes se sacara del instante crudo, esta tarea caería en el archivo
  // equivocado y nadie sabría explicar por qué.
  assert.equal(mesEnBogota("2026-09-01T01:00:00Z"), "2026-08");
  // Y al revés: 1 de septiembre a las 6 de la mañana sí es septiembre.
  assert.equal(mesEnBogota("2026-09-01T11:00:00Z"), "2026-09");
});

test("solo se archiva lo completado en un mes anterior", () => {
  const enAgosto = { status: "done", completed_at: "2026-08-20T14:00:00Z" };
  const esteMes = { status: "done", completed_at: "2026-09-02T14:00:00Z" };
  const abierta = { status: "pending", completed_at: null };

  assert.equal(estaArchivada(enAgosto, HOY), true);
  // Lo que se cerró este mes sigue en el tablero: la gente espera ver lo que
  // acaba de terminar.
  assert.equal(estaArchivada(esteMes, HOY), false);
  assert.equal(estaArchivada(abierta, HOY), false);
});

test("una tarea completada sin fecha no se archiva sola", () => {
  // Preferimos que se quede a la vista antes que desaparecer sin rastro.
  assert.equal(estaArchivada({ status: "done", completed_at: null }, HOY), false);
});

test("reabrir una tarea la saca del archivo", () => {
  // El trigger limpia `completed_at` al salir de «done»; aquí se comprueba que
  // el lado del cliente no la siga escondiendo por el estado viejo.
  assert.equal(
    estaArchivada({ status: "progress", completed_at: null }, HOY),
    false,
  );
});

test("los meses del archivo van del más reciente al más viejo y sin el actual", () => {
  const meses = mesesArchivados(
    [
      "2026-06-10T14:00:00Z",
      "2026-08-20T14:00:00Z",
      "2026-08-25T14:00:00Z",
      "2026-09-02T14:00:00Z", // mes corriente: todavía no es archivo
      null,
    ],
    HOY,
  );
  assert.deepEqual(meses, ["2026-08", "2026-06"]);
});

test("el rango del mes cierra con el primer instante del mes siguiente", () => {
  const r = rangoDelMes("2026-08");
  assert.ok(r);
  // Medianoche del 1 de agosto en Bogotá son las 05:00 UTC.
  assert.equal(r.desde, "2026-08-01T05:00:00.000Z");
  assert.equal(r.hasta, "2026-09-01T05:00:00.000Z");
});

test("diciembre pasa al año siguiente", () => {
  const r = rangoDelMes("2026-12");
  assert.ok(r);
  assert.equal(r.hasta, "2027-01-01T05:00:00.000Z");
});

test("un mes inventado no revienta", () => {
  assert.equal(rangoDelMes("2026-13"), null);
  assert.equal(rangoDelMes("agosto"), null);
  assert.equal(etiquetaMes("agosto"), "agosto");
});

test("la etiqueta del mes sale en español", () => {
  assert.match(etiquetaMes("2026-08"), /agosto/i);
  assert.match(etiquetaMes("2026-08"), /2026/);
});
