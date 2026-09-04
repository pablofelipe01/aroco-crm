import { test } from "node:test";
import assert from "node:assert/strict";
import {
  anosHasta,
  deltaCall,
  deltaDesdePrima,
  deltaPut,
  precioCall,
  precioPut,
  volImplicita,
  vencimientoOpcion,
} from "./black76";

/**
 * Tablero de opciones de StoneX del 3-sep-2026, tal como lo mandó Vladimir.
 * Subyacente 6225 para los tres meses.
 */
const F = 6225;
const DEC = { dte: 71, volC: 0.556, volP: 0.5589, r: 0.0379 };
const NOV = { dte: 36, volC: 0.5477, volP: 0.55, r: 0.0371 };
const OCT = { dte: 8, volC: 0.533, volP: 0.5364, r: 0.0364 };

const cerca = (a: number, b: number, tol: number, msg: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerancia ${tol})`);

test("el delta calculado reproduce el del tablero del bróker", () => {
  // Con la volatilidad del propio tablero, la diferencia queda por debajo de
  // una décima de punto de delta cerca del dinero.
  const casos: [string, number, number, number, typeof DEC][] = [
    // mes, strike, delta call del tablero, delta put del tablero, columna
    ["DEC26", 6250, 53.88, -45.39, DEC],
    ["DEC26", 6000, 60.31, -38.98, DEC],
    ["NOV26", 6250, 52.33, -47.25, NOV],
    ["NOV26", 5800, 68.89, -30.63, NOV],
    ["OCT26", 6250, 49.58, -50.33, OCT],
  ];
  for (const [mes, K, dc, dp, col] of casos) {
    const T = col.dte / 365;
    cerca(
      deltaCall({ F, K, T, sigma: col.volC, r: col.r }) * 100,
      dc,
      0.15,
      `${mes} call ${K}`,
    );
    cerca(
      deltaPut({ F, K, T, sigma: col.volP, r: col.r }) * 100,
      dp,
      0.3,
      `${mes} put ${K}`,
    );
  }
});

test("la volatilidad implícita devuelve la prima de la que salió", () => {
  const base = { F, K: 6250, T: DEC.dte / 365, r: DEC.r };
  const sigma = volImplicita("call", 595, base);
  assert.ok(sigma, "debería haber solución");
  cerca(precioCall({ ...base, sigma }), 595, 0.01, "prima reconstruida");
  // El tablero cotiza 55,6 % para toda la columna; este strike, por sí solo,
  // sale cerca pero no idéntico. Esa es la sonrisa de volatilidad.
  cerca(sigma, 0.556, 0.05, "volatilidad del strike");
});

test("el delta sale de la prima, que es lo único que da Barchart", () => {
  const base = { F, K: 6250, T: DEC.dte / 365, r: DEC.r };
  // Prima 595 → delta ≈ 53,9 %, el mismo número del tablero, sin tablero.
  const d = deltaDesdePrima("call", 595, base);
  assert.ok(d !== null);
  cerca(d * 100, 53.88, 0.6, "delta desde la prima");

  const dp = deltaDesdePrima("put", 622, base);
  assert.ok(dp !== null);
  cerca(dp * 100, -45.39, 0.6, "delta put desde la prima");
});

test("una prima imposible no produce un delta inventado", () => {
  const base = { F, K: 5000, T: DEC.dte / 365, r: DEC.r };
  // Por debajo del valor intrínseco: la call vale al menos 6225 − 5000.
  assert.equal(volImplicita("call", 50, base), null);
  assert.equal(deltaDesdePrima("call", 50, base), null);
  // Prima cero o negativa: un strike que lleva días sin operar.
  assert.equal(deltaDesdePrima("call", 0, base), null);
  // Sin plazo no hay delta definido.
  assert.equal(deltaDesdePrima("call", 1300, { ...base, T: 0 }), null);
});

test("el put profundamente dentro del dinero tiene delta cercano a −1", () => {
  const base = { F, K: 9000, T: DEC.dte / 365, r: DEC.r };
  const d = deltaPut({ ...base, sigma: 0.5589 });
  assert.ok(d < -0.9 && d > -1.001, `delta fuera de rango: ${d}`);
});

test("la paridad put-call se cumple", () => {
  // c − p = e^{−rT}(F − K). Si esto no se cumpliera, las dos fórmulas no
  // estarían describiendo el mismo mercado.
  const e = { F, K: 6250, T: DEC.dte / 365, sigma: 0.556, r: DEC.r };
  const izq = precioCall(e) - precioPut(e);
  const der = Math.exp(-e.r * e.T) * (e.F - e.K);
  cerca(izq, der, 0.01, "paridad");
});

test("el vencimiento es el segundo viernes del mes anterior", () => {
  // Las tres fechas del tablero del 3-sep-2026, exactas.
  assert.equal(vencimientoOpcion("OCT26"), "2026-09-11");
  assert.equal(vencimientoOpcion("NOV26"), "2026-10-09");
  assert.equal(vencimientoOpcion("DEC26"), "2026-11-13");
});

test("un contrato de enero retrocede al diciembre anterior", () => {
  // Diciembre de 2026: los viernes son 4, 11, 18 y 25.
  assert.equal(vencimientoOpcion("JAN27"), "2026-12-11");
});

test("un mes que no existe no devuelve una fecha cualquiera", () => {
  assert.equal(vencimientoOpcion("XYZ26"), null);
  assert.equal(vencimientoOpcion(""), null);
  assert.equal(vencimientoOpcion("DEC"), null);
});

test("los días al vencimiento coinciden con los del tablero", () => {
  const hoy = "2026-09-03";
  const dias = (mes: string) => {
    const t = anosHasta(hoy, vencimientoOpcion(mes)!);
    return t === null ? null : Math.round(t * 365);
  };
  assert.equal(dias("OCT26"), 8);
  assert.equal(dias("NOV26"), 36);
  assert.equal(dias("DEC26"), 71);
});

test("un vencimiento ya pasado no deja plazo", () => {
  // El día del vencimiento el delta deja de estar definido; devolver «casi
  // cero» daría una cobertura falsamente enorme.
  assert.equal(anosHasta("2026-11-13", "2026-11-13"), null);
  assert.equal(anosHasta("2026-11-14", "2026-11-13"), null);
});
