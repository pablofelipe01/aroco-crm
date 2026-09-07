import { test } from "node:test";
import assert from "node:assert/strict";
import { diaEnBogota, diasAbierta, fechasDeTarea } from "./fechas";

test("el día se cuenta en hora de Bogotá", () => {
  // Una tarea creada a las siete de la noche del 4 en Bogotá es del 4, aunque
  // en UTC ya sea el 5.
  assert.equal(diaEnBogota("2026-09-05T00:00:00Z"), "2026-09-04");
  assert.equal(diaEnBogota("2026-09-05T12:00:00Z"), "2026-09-05");
  assert.equal(diaEnBogota("no es una fecha"), null);
});

test("si la tarea declaró su inicio, manda esa fecha", () => {
  const f = fechasDeTarea({
    start_date: "2026-09-01",
    created_at: "2026-08-12T15:00:00Z",
    due_date: "2026-09-20",
  });
  assert.deepEqual(f, {
    inicio: "2026-09-01",
    origen: "declarado",
    vence: "2026-09-20",
  });
});

test("sin fecha de inicio se dice la de creación, y se dice que lo es", () => {
  // Las 539 tareas anteriores a la migración 0079. No se les inventa un
  // inicio: se dice cuándo entraron al CRM, que es lo que sí se sabe.
  const f = fechasDeTarea({
    start_date: null,
    created_at: "2026-08-12T15:00:00Z",
    due_date: null,
  });
  assert.equal(f.inicio, "2026-08-12");
  assert.equal(f.origen, "creacion");
  assert.equal(f.vence, null);
});

test("los días abiertos se cuentan desde el inicio", () => {
  assert.equal(diasAbierta("2026-09-01", "2026-09-07"), 6);
  assert.equal(diasAbierta("2026-09-07", "2026-09-07"), 0);
  // Acepta un instante completo, que es como llega `completed_at`.
  assert.equal(diasAbierta("2026-09-01", "2026-09-07T18:00:00Z"), 6);
});

test("una tarea que arranca la semana entrante no lleva días abierta", () => {
  // Sin esto la tarjeta diría «lleva −3 días».
  assert.equal(diasAbierta("2026-09-10", "2026-09-07"), null);
  assert.equal(diasAbierta(null, "2026-09-07"), null);
});
