import { test } from "node:test";
import assert from "node:assert/strict";
import {
  escalaDePrecio,
  fechaOperacion,
  instrumentoDeContrato,
  ladoDe,
  mesDeContrato,
  traducirPosicion,
} from "./posicion-extracto";

/** La posición real del extracto del 11-sep-2026, tal como llega del MCP. */
const REAL = {
  trade_date: "9/11/6",
  card: "4420",
  at: "U1",
  qty: 1,
  direction: "long",
  contract: "DEC 26 ICE COCOA",
  settlement_type: "E",
  open_price: 60.3,
  currency: "US",
  ote_amount: 690,
  ote_sign: "loss",
  last_trade_date: "12/15/26",
  close_price: 59.61,
  avg_price: 60.3,
};

test("el mes del contrato sale del nombre", () => {
  assert.equal(mesDeContrato("DEC 26 ICE COCOA"), "DEC26");
  assert.equal(mesDeContrato("MAR 27 ICE COCOA"), "MAR27");
  assert.equal(mesDeContrato("algo raro"), null);
  assert.equal(mesDeContrato(null), null);
});

test("un futuro no lleva tipo ni strike; una opción sí", () => {
  // `option_type` nulo significa futuro, que es lo que el resto del módulo
  // ya espera para medir cobertura.
  assert.deepEqual(instrumentoDeContrato("DEC 26 ICE COCOA"), {
    option_type: null,
    strike: null,
  });
  // El strike se busca DESPUÉS de la palabra, para no confundirlo con el año.
  assert.deepEqual(instrumentoDeContrato("DEC 26 ICE COCOA PUT 6000"), {
    option_type: "PUT",
    strike: 6000,
  });
  assert.deepEqual(instrumentoDeContrato("DEC 26 ICE COCOA CALL 6,750"), {
    option_type: "CALL",
    strike: 6750,
  });
});

test("el lado se cree cuando el extracto lo dice", () => {
  assert.equal(ladoDe(REAL), "long");
  assert.equal(ladoDe({ ...REAL, direction: "short" }), "short");
});

test("sin dirección, el lado se deduce del resultado", () => {
  // Una posición larga gana cuando el precio sube. Con apertura, cierre y el
  // signo del flotante, el lado queda determinado sin adivinar nada.
  const sinDir = { ...REAL, direction: null };
  // Bajó (60,3 → 59,61) y perdió ⇒ estaba largo.
  assert.equal(ladoDe(sinDir), "long");
  // Bajó y ganó ⇒ estaba corto.
  assert.equal(ladoDe({ ...sinDir, ote_sign: "gain" }), "short");
  // Subió y ganó ⇒ largo.
  assert.equal(ladoDe({ ...sinDir, close_price: 61, ote_sign: "gain" }), "long");
  // Subió y perdió ⇒ corto.
  assert.equal(ladoDe({ ...sinDir, close_price: 61, ote_sign: "loss" }), "short");
});

test("si no se puede saber el lado, NO se inventa", () => {
  // Es la fila del 9-sep: sin dirección y sin precio de cierre. Poner un lado
  // al azar convierte una cobertura en una exposición en la pantalla que sirve
  // para decidir si hace falta cubrirse.
  assert.equal(ladoDe({ ...REAL, direction: null, close_price: null }), null);
  assert.equal(ladoDe({ ...REAL, direction: null, ote_sign: null }), null);
  // Sin movimiento de precio tampoco hay de dónde deducirlo.
  assert.equal(ladoDe({ ...REAL, direction: null, close_price: 60.3 }), null);
});

test("la escala del precio se comprueba contra el flotante", () => {
  // |60,3 − 59,61| × 100 × 10 t × 1 contrato = 690, que es justo el flotante
  // que declara el extracto. La escala es 100: el cacao está en 6.030, no en
  // 60,3.
  assert.equal(escalaDePrecio(REAL), 100);
});

test("si ninguna escala cuadra, el precio no se guarda", () => {
  // Un precio de cacao con dos ceros de menos, en una pantalla de coberturas,
  // es peor que una celda vacía.
  assert.equal(escalaDePrecio({ ...REAL, ote_amount: 12345 }), null);
  assert.equal(escalaDePrecio({ ...REAL, close_price: null }), null);
  assert.equal(escalaDePrecio({ ...REAL, qty: 0 }), null);
});

test("la fecha de operación toma el año del extracto", () => {
  // «9/11/6» trae un solo dígito de año. Interpretarlo tal cual daba 2006.
  assert.equal(fechaOperacion("9/11/6", "2026-09-11"), "2026-09-11");
  assert.equal(fechaOperacion("9/09/6", "2026-09-09"), "2026-09-09");
  // Dos y cuatro dígitos también se aceptan.
  assert.equal(fechaOperacion("12/15/26", "2026-09-11"), "2026-12-15");
  assert.equal(fechaOperacion("2026-09-11", "2026-09-11"), "2026-09-11");
});

test("un año que no encaja con el del extracto no se reconstruye", () => {
  // Si el dígito no coincide, la fecha no se puede saber y no se inventa.
  assert.equal(fechaOperacion("9/11/3", "2026-09-11"), null);
  assert.equal(fechaOperacion("13/40/6", "2026-09-11"), null);
  assert.equal(fechaOperacion("", "2026-09-11"), null);
});

test("la posición del 11-sep se traduce entera", () => {
  const p = traducirPosicion(REAL, "2026-09-11");
  assert.equal(p.contract_month, "DEC26");
  assert.equal(p.option_type, null, "es un futuro");
  assert.equal(p.long_qty, 1);
  assert.equal(p.short_qty, 0);
  assert.equal(p.trade_date, "2026-09-11");
  assert.equal(p.settle_price, 5961, "cierre 59,61 × escala 100");
  assert.equal(p.market_value, -690, "el flotante es pérdida");
  assert.equal(p.dr_cr, "DR");
  assert.equal(p.sinLado, false);
  assert.equal(p.card, "4420");
});

test("una posición sin lado se traduce sin cantidades y se declara", () => {
  // Queda visible como problema en vez de pasar por «no hay nada abierto».
  const p = traducirPosicion(
    { ...REAL, direction: null, close_price: null },
    "2026-09-11",
  );
  assert.equal(p.long_qty, 0);
  assert.equal(p.short_qty, 0);
  assert.equal(p.sinLado, true);
  assert.equal(p.contract_month, "DEC26", "el contrato sí se conoce");
});

test("un corto se guarda del lado corto", () => {
  const p = traducirPosicion({ ...REAL, direction: "short", qty: 3 }, "2026-09-11");
  assert.equal(p.short_qty, 3);
  assert.equal(p.long_qty, 0);
});
