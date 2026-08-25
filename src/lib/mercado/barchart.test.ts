import { test } from "node:test";
import assert from "node:assert/strict";
import { armarCadena, mesContrato, subyacentePorParidad } from "./barchart";

test("el mes de contrato queda en el formato del tablero", () => {
  assert.equal(mesContrato("Oct 2026"), "OCT26");
  assert.equal(mesContrato("December 2026"), "DEC26");
  assert.equal(mesContrato("May 2027"), "MAY27");
});

test("calls y puts se cruzan en una fila por strike", () => {
  // Barchart los manda en dos listas; el tablero es una fila con los dos lados.
  const filas = armarCadena({
    Call: [
      { raw: { strike: 3250, lastPrice: 2695, premium: 26950 } },
      { raw: { strike: 3300, lastPrice: 2650 } },
    ],
    Put: [{ raw: { strike: 3250, lastPrice: 1, premium: 10 } }],
  });
  assert.equal(filas.length, 2);
  assert.deepEqual(filas[0], {
    strike: 3250,
    // lastPrice (puntos), no premium (dólares): tiene que quedar en la misma
    // unidad que el strike.
    call_premium: 2695,
    put_premium: 1,
    call_delta: null,
    put_delta: null,
  });
  assert.equal(filas[1].put_premium, null, "un strike sin put queda en null");
});

test("los strikes salen ordenados aunque lleguen revueltos", () => {
  const filas = armarCadena({
    Call: [{ raw: { strike: 4000, lastPrice: 10 } }, { raw: { strike: 3000, lastPrice: 900 } }],
  });
  assert.deepEqual(filas.map((f) => f.strike), [3000, 4000]);
});

test("los N/A de Barchart no se guardan como cero", () => {
  const filas = armarCadena({ Call: [{ raw: { strike: 3250, lastPrice: null } }] });
  // Cero afirma que la opción no vale nada; null dice que no cotizó.
  assert.equal(filas[0].call_premium, null);
});

test("una fila sin strike se descarta en vez de romper la cadena", () => {
  const filas = armarCadena({ Call: [{ raw: { lastPrice: 5 } }, { raw: { strike: 3000, lastPrice: 900 } }] });
  assert.equal(filas.length, 1);
  assert.equal(filas[0].strike, 3000);
});

test("el subyacente se deduce por paridad put-call", () => {
  // Datos reales del OCT26 el 25-ago-2026: los dos extremos de la escalera
  // apuntan al mismo subyacente, ~5.945.
  const filas = [
    { strike: 3250, call_premium: 2695, put_premium: 1, call_delta: null, put_delta: null },
    { strike: 7250, call_premium: 14, put_premium: 1318, call_delta: null, put_delta: null },
  ];
  assert.equal(subyacentePorParidad(filas), 5945);
});

test("una prima vieja no arrastra el subyacente", () => {
  const filas = [
    { strike: 3000, call_premium: 2900, put_premium: 5, call_delta: null, put_delta: null },
    { strike: 3100, call_premium: 2800, put_premium: 5, call_delta: null, put_delta: null },
    // Cotización rancia: por promedio movería la cifra; por mediana no.
    { strike: 9000, call_premium: 9000, put_premium: 1, call_delta: null, put_delta: null },
  ];
  assert.equal(subyacentePorParidad(filas), 5895);
});

test("sin ningún strike con los dos lados, no se inventa un subyacente", () => {
  assert.equal(
    subyacentePorParidad([{ strike: 3000, call_premium: 100, put_premium: null, call_delta: null, put_delta: null }]),
    null,
  );
});
