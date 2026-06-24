import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularLiquidacion, PARAMS_DEFAULT, type LiquidacionParams } from "./liquidacion";

const P: LiquidacionParams = { ...PARAMS_DEFAULT };

test("liquidación — calidad dentro de norma: sin sanciones ni bonificaciones", () => {
  const r = calcularLiquidacion({
    pesoRecibidoKg: 1000,
    precioKg: 12500,
    humedadPct: 7, // = máximo, no descuenta
    fermentacionPct: 65, // = mínimo, no bonifica
    impurezasPct: 1, // = máximo, no descuenta
    params: P,
  });
  assert.equal(r.valorBase, 12_500_000);
  assert.equal(r.totalSanciones, 0);
  assert.equal(r.totalBonificaciones, 0);
  assert.equal(r.valorTotal, 12_500_000);
});

test("liquidación — humedad por encima del máximo descuenta", () => {
  const r = calcularLiquidacion({
    pesoRecibidoKg: 1000,
    precioKg: 12500,
    humedadPct: 9, // 2 puntos sobre 7 → 2 × 1% = 2% de la base
    fermentacionPct: 65,
    impurezasPct: 1,
    params: P,
  });
  assert.equal(r.descuentoHumedad, 250_000); // 2% de 12.5M
  assert.equal(r.valorTotal, 12_250_000);
});

test("liquidación — fermentación por encima del mínimo bonifica", () => {
  const r = calcularLiquidacion({
    pesoRecibidoKg: 1000,
    precioKg: 12500,
    humedadPct: 7,
    fermentacionPct: 75, // 10 puntos sobre 65 → 10 × 0.5% = 5% de la base
    impurezasPct: 1,
    params: P,
  });
  assert.equal(r.bonifFermentacion, 625_000); // 5% de 12.5M
  assert.equal(r.valorTotal, 13_125_000);
});

test("liquidación — combina sanciones, bonificaciones y ajustes manuales", () => {
  const r = calcularLiquidacion({
    pesoRecibidoKg: 1000,
    precioKg: 12500,
    humedadPct: 8, // 1 punto → 1% = 125.000
    fermentacionPct: 70, // 5 puntos → 2.5% = 312.500
    impurezasPct: 2, // 1 punto → 1% = 125.000
    params: { ...P, ajusteManualDescuento: 50_000, ajusteManualBonificacion: 10_000 },
  });
  assert.equal(r.descuentoHumedad, 125_000);
  assert.equal(r.descuentoImpurezas, 125_000);
  assert.equal(r.bonifFermentacion, 312_500);
  assert.equal(r.totalSanciones, 125_000 + 125_000 + 50_000);
  assert.equal(r.totalBonificaciones, 312_500 + 10_000);
  assert.equal(r.valorTotal, 12_500_000 - 300_000 + 322_500);
});

test("liquidación — nunca paga negativo", () => {
  const r = calcularLiquidacion({
    pesoRecibidoKg: 100,
    precioKg: 1000, // base = 100.000
    humedadPct: 7,
    fermentacionPct: 0,
    impurezasPct: 0,
    params: { ...P, ajusteManualDescuento: 1_000_000 }, // sanción mayor que la base
  });
  assert.equal(r.valorTotal, 0);
});

test("liquidación — calidad nula no rompe el cálculo", () => {
  const r = calcularLiquidacion({
    pesoRecibidoKg: 500,
    precioKg: 10000,
    humedadPct: null,
    fermentacionPct: null,
    impurezasPct: null,
    params: P,
  });
  assert.equal(r.valorBase, 5_000_000);
  assert.equal(r.valorTotal, 5_000_000);
});
