import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularRiesgo, escenarios, TONELADAS_POR_CONTRATO } from "./riesgo";
import { expandirRango, normalizarTrm } from "./trm";

const base = {
  kgFisico: 7334.95,
  costoPromedioCopKg: 13558,
  posiciones: [],
  precioCacaoUsdT: 5945,
  trm: 3056.51,
};

test("la situación real de hoy: todo el inventario descubierto", () => {
  const r = calcularRiesgo(base);
  assert.equal(r.toneladasFisicas, 7.335);
  assert.equal(r.toneladasCubiertas, 0);
  assert.equal(r.coberturaPct, 0);
  assert.equal(r.toneladasDescubiertas, 7.335);
  assert.equal(r.collar, null, "sin posiciones no hay collar");
});

test("un futuro COMPRADO no cuenta como cobertura", () => {
  // Cubrir inventario es venderlo a futuro. Un futuro largo duplica la
  // exposición; sumarlo diría que hay protección donde hay el doble de riesgo.
  const r = calcularRiesgo({
    ...base,
    kgFisico: 100_000,
    posiciones: [{ option_type: "FUTURE", long_qty: 5, short_qty: 0, strike: null, contract_month: "DEC26" }],
  });
  assert.equal(r.toneladasCubiertas, 0);
  assert.equal(r.contratos.futurosLargos, 5);
});

test("puts largos y futuros cortos sí cubren", () => {
  const r = calcularRiesgo({
    ...base,
    kgFisico: 100_000, // 100 t
    posiciones: [
      { option_type: "PUT", long_qty: 3, short_qty: 0, strike: 5500, contract_month: "DEC26" },
      { option_type: "FUTURE", long_qty: 0, short_qty: 2, strike: null, contract_month: "DEC26" },
    ],
  });
  assert.equal(r.toneladasCubiertas, 5 * TONELADAS_POR_CONTRATO);
  assert.equal(r.coberturaPct, 50);
  assert.equal(r.toneladasDescubiertas, 50);
});

test("el collar necesita las dos patas", () => {
  const soloPut = calcularRiesgo({
    ...base,
    posiciones: [{ option_type: "PUT", long_qty: 1, short_qty: 0, strike: 5500, contract_month: "DEC26" }],
  });
  assert.equal(soloPut.collar, null, "un piso solo no es un collar");

  const completo = calcularRiesgo({
    ...base,
    posiciones: [
      { option_type: "PUT", long_qty: 1, short_qty: 0, strike: 5500, contract_month: "DEC26" },
      { option_type: "CALL", long_qty: 0, short_qty: 1, strike: 6800, contract_month: "DEC26" },
    ],
  });
  assert.deepEqual(completo.collar, { piso: 5500, techo: 6800 });
});

test("el precio internacional se lleva a COP/kg para poder comparar", () => {
  const r = calcularRiesgo(base);
  // 5.945 USD/t × 3.056,51 COP/USD ÷ 1000 = 18.170 COP/kg
  assert.equal(r.precioMercadoCopKg, 18170.95);
  // El inventario vale más de lo que costó: (18.170,95 − 13.558) × 7.334,95 kg
  assert.equal(r.pnlFisicoCop, Math.round((18170.95 - 13558) * 7334.95));
  assert.ok(r.pnlFisicoCop! > 0);
});

test("sin TRM no se inventa un precio: se dice qué falta", () => {
  const r = calcularRiesgo({ ...base, trm: null });
  assert.equal(r.precioMercadoCopKg, null);
  assert.equal(r.pnlFisicoCop, null);
  assert.deepEqual(r.faltantes, ["TRM"]);
});

test("los escenarios solo salen si hay con qué calcularlos", () => {
  assert.deepEqual(escenarios(calcularRiesgo({ ...base, trm: null }), base.kgFisico), []);
  const e = escenarios(calcularRiesgo(base), base.kgFisico);
  assert.equal(e.length, 5);
  assert.ok(e[0].pnlCop < e[4].pnlCop, "si el precio sube, el inventario vale más");
});

test("la TRM de un viernes se arrastra al fin de semana", () => {
  // La del 22-ago-2026 rige hasta el lunes 24. Guardar solo el 22 dejaría el
  // sábado y el domingo sin tasa.
  const filas = expandirRango({
    valor: "3048.12",
    vigenciadesde: "2026-08-22T00:00:00.000",
    vigenciahasta: "2026-08-24T00:00:00.000",
  });
  assert.deepEqual(filas.map((f) => f.date), ["2026-08-22", "2026-08-23", "2026-08-24"]);
  assert.equal(filas[2].trm, 3048.12);
});

test("cuando dos registros pisan el mismo día, gana el más reciente", () => {
  const filas = normalizarTrm([
    { valor: "3056.51", vigenciadesde: "2026-08-25T00:00:00.000", vigenciahasta: "2026-08-25T00:00:00.000" },
    { valor: "3048.12", vigenciadesde: "2026-08-22T00:00:00.000", vigenciahasta: "2026-08-25T00:00:00.000" },
  ]);
  assert.equal(filas.find((f) => f.date === "2026-08-25")?.trm, 3056.51);
  assert.equal(filas.length, 4);
});

test("un rango absurdo no genera miles de filas", () => {
  const filas = expandirRango({
    valor: "3000",
    vigenciadesde: "2026-01-01T00:00:00.000",
    vigenciahasta: "2099-01-01T00:00:00.000",
  });
  assert.equal(filas.length, 31, "se topa en 31 días");
});
