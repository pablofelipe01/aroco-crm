import { test } from "node:test";
import assert from "node:assert/strict";
import { etapaDe, grupoDe, diasQuieta, siguientePaso } from "./flujo";

test("una aprobada sin pagar está por comprar", () => {
  assert.equal(etapaDe({ estado: "Aprobada" }), "Por comprar");
  assert.equal(grupoDe({ estado: "Aprobada" }), "En proceso");
});

test("pagada y sin recibir sigue en proceso", () => {
  const s = { estado: "Aprobada", pagada_en: "2026-08-01T00:00:00Z" };
  assert.equal(etapaDe(s), "Por recibir");
  assert.equal(grupoDe(s), "En proceso");
});

test("recibida cierra la solicitud", () => {
  const s = {
    estado: "Aprobada",
    pagada_en: "2026-08-01T00:00:00Z",
    recibida_en: "2026-08-05T00:00:00Z",
  };
  assert.equal(etapaDe(s), "Recibida");
  assert.equal(grupoDe(s), "Finalizada");
});

test("recibida sin pago registrado también cierra", () => {
  // Pasa: llega el insumo y el pago se registra tarde, o nunca. Lo que cierra
  // una compra es que llegue, no que se pague.
  const s = { estado: "Aprobada", recibida_en: "2026-08-05T00:00:00Z" };
  assert.equal(etapaDe(s), "Recibida");
});

test("rechazada manda sobre las fechas", () => {
  // Una solicitud pagada y luego rechazada es un problema, pero la vista tiene
  // que decir «Rechazada»: es el hecho, y esconderlo lo dejaría sin resolver.
  const s = { estado: "Rechazada", pagada_en: "2026-08-01T00:00:00Z" };
  assert.equal(etapaDe(s), "Rechazada");
  assert.equal(grupoDe(s), "Finalizada");
});

test("borrador y pendiente están abiertas", () => {
  assert.equal(grupoDe({ estado: "Borrador" }), "Abierta");
  assert.equal(etapaDe({ estado: "Pendiente" }), "Esperando aprobación");
  assert.equal(grupoDe({ estado: "Pendiente" }), "Abierta");
});

test("el siguiente paso distingue si faltan cotizaciones", () => {
  assert.match(siguientePaso({ estado: "Borrador" }, 0), /Súbele cotizaciones/);
  assert.match(siguientePaso({ estado: "Borrador" }, 2), /Mándala a aprobación/);
  assert.match(siguientePaso({ estado: "Pendiente" }, 0), /Falta cotización/);
});

test("los días quietos cuentan desde el último hito, no desde que se creó", () => {
  const ahora = new Date("2026-09-01T00:00:00Z");
  const s = {
    estado: "Aprobada",
    created_at: "2026-08-01T00:00:00Z",
    aprobada_en: "2026-08-30T00:00:00Z",
  };
  // Se pidió hace un mes pero se aprobó anteayer: lleva 2 días quieta.
  assert.equal(diasQuieta(s, ahora), 2);
});

test("sin hitos posteriores, se cuenta desde la creación", () => {
  const ahora = new Date("2026-09-01T00:00:00Z");
  assert.equal(
    diasQuieta({ estado: "Borrador", created_at: "2026-08-25T00:00:00Z" }, ahora),
    7,
  );
});

test("una fecha futura no da días negativos", () => {
  const ahora = new Date("2026-09-01T00:00:00Z");
  assert.equal(
    diasQuieta({ estado: "Borrador", created_at: "2026-09-05T00:00:00Z" }, ahora),
    0,
  );
});
