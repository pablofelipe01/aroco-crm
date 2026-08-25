import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarTablero, toneladasPorDelta, TableroIlegible } from "./tablero-imagen";

test("los deltas de put quedan negativos aunque el tablero los muestre sin signo", () => {
  const t = normalizarTablero({
    contract_month: "dec26",
    strikes: [{ strike: 5500, put_delta: 34.2, call_delta: 65.8, put_premium: 120, call_premium: 560 }],
  });
  // Un delta de put positivo diría que el put sube cuando sube el subyacente.
  // Con eso la cobertura se calcularía al revés.
  assert.equal(t.strikes[0].put_delta, -34.2);
  assert.equal(t.strikes[0].call_delta, 65.8);
  assert.equal(t.contract_month, "DEC26", "el mes queda en mayúsculas");
});

test("un tablero sin mes de contrato se rechaza", () => {
  assert.throws(
    () => normalizarTablero({ strikes: [{ strike: 5500 }] }),
    TableroIlegible,
  );
});

test("una imagen sin strikes legibles se rechaza en vez de guardar un tablero vacío", () => {
  assert.throws(() => normalizarTablero({ contract_month: "DEC26", strikes: [] }), TableroIlegible);
});

test("las filas sin strike usable se descartan y las demás se ordenan", () => {
  const t = normalizarTablero({
    contract_month: "DEC26",
    strikes: [{ strike: 6000 }, { strike: null }, { strike: 5500 }, { strike: 0 }],
  });
  assert.deepEqual(t.strikes.map((s) => s.strike), [5500, 6000]);
});

test("una fecha de vencimiento mal formada no se guarda a medias", () => {
  const t = normalizarTablero({
    contract_month: "DEC26",
    expiration: "04/10/26",
    strikes: [{ strike: 5500 }],
  });
  assert.equal(t.expiration, null, "solo se acepta ISO");
});

test("la cobertura se pondera por delta, no por contratos", () => {
  // 10 contratos de puts = 100 t nominales. Con delta -0,15 protegen 15 t.
  const deltas = new Map([[5000, { call: null, put: -0.15 }]]);
  const r = toneladasPorDelta(
    [{ option_type: "PUT", long_qty: 10, short_qty: 0, strike: 5000 }],
    deltas,
  );
  assert.equal(r.conDelta, 15);
  assert.equal(r.sinDelta, 0);
});

test("un delta en porcentaje se entiende igual que en decimal", () => {
  const deltas = new Map([[5000, { call: null, put: -15 }]]);
  const r = toneladasPorDelta([{ option_type: "PUT", long_qty: 10, short_qty: 0, strike: 5000 }], deltas);
  assert.equal(r.conDelta, 15);
});

test("sin delta conocido no se asume cobertura total: se cuenta aparte", () => {
  const r = toneladasPorDelta(
    [{ option_type: "PUT", long_qty: 4, short_qty: 0, strike: 9999 }],
    new Map(),
  );
  // Asumir delta 1 diría que 40 t están protegidas sin saberlo.
  assert.equal(r.conDelta, 0);
  assert.equal(r.sinDelta, 40);
});
