import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cotizar,
  esViable,
  FNC_PCT,
  MERMA_PCT,
  type CotizadorInput,
} from "./cotizador";

// Reference values: «Cotizador Comercial Aroco», tabs FOB / CIF / NACIONAL,
// as computed by Google Sheets on 2026-10-09.
const TRM = 3205.65;

function closeTo(actual: number, expected: number, tol: number, msg?: string) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg ?? ""} esperado ≈ ${expected}, obtenido ${actual} (tol ${tol})`,
  );
}

const zeros = {
  trm: TRM,
  precioCompraKg: 15750,
  cocoaUsdT: 5425,
  diferencial: 0,
  volumenTM: 1,
  transporteBodega: 0,
  seleccion: 0,
  fumigacion: 0,
  estibas: 0,
  costales: 0,
  coberturas: 0,
  costosExportacion: 0,
};

const nacional: CotizadorInput = {
  ...zeros,
  incoterm: "NACIONAL",
  comisionPct: 0.05,
  volumenTM: 13.919,
  transporteBodega: 150,
  seleccion: 83,
  bonifCalidadPct: 0.0495,
  bonifCalidadProveedorPct: 0,
  bonifCadmio: 280,
  bonifTrazabilidad: 120,
  bonifTransporte: 180,
};

test("cotizador NACIONAL — hoja", () => {
  const r = cotizar(nacional);
  closeTo(r.precioFinalUsdTm, 5065.154774, 1e-5, "precioFinal (E45)");
  closeTo(r.bonifCalidadUsdTm, 250.7251613, 1e-5, "bonif calidad (E35)");
  closeTo(r.comisionUsdTm, 24.31800907, 1e-5, "comisión (E40)");
  closeTo(r.costoTotalUsdTm, 4603.112602, 1e-5, "costo total (E42)");
  closeTo(r.utilidadPct, 0.1003760308, 1e-9, "utilidad (E43)");
  closeTo(r.totalOperacionUsd, 70501.8893, 1e-3, "operación (I45)");
  assert.equal(r.lines.find((l) => l.key === "fnc")!.usdPerTm, 0);
});

test("cotizador NACIONAL — la parte del proveedor reduce la bonificación de AROCO", () => {
  const todo = cotizar(nacional);
  const mitad = cotizar({ ...nacional, bonifCalidadProveedorPct: 0.5 });
  closeTo(mitad.bonifCalidadUsdTm, todo.bonifCalidadUsdTm / 2, 1e-9);
  // Same price, higher cost → lower margin.
  closeTo(mitad.precioFinalUsdTm, todo.precioFinalUsdTm, 1e-9);
  assert.ok(mitad.utilidadPct < todo.utilidadPct);
  const nada = cotizar({ ...nacional, bonifCalidadProveedorPct: 1 });
  assert.equal(nada.bonifCalidadUsdTm, 0);
});

test("cotizador NACIONAL — parte del proveedor fuera de 0..100 % falla", () => {
  assert.throws(() => cotizar({ ...nacional, bonifCalidadProveedorPct: 1.2 }));
  assert.throws(() => cotizar({ ...nacional, bonifCalidadProveedorPct: -0.1 }));
});

test("cotizador NACIONAL — ignora costos de exportación", () => {
  const r = cotizar({ ...nacional, costosExportacion: 720 });
  closeTo(r.utilidadPct, 0.1003760308, 1e-9);
});

test("cotizador FOB — hoja", () => {
  const r = cotizar({
    ...zeros,
    incoterm: "FOB",
    comisionPct: 0.08,
    volumenTM: 25,
    transporteBodega: 104,
    seleccion: 83,
    fumigacion: 90,
    estibas: 53, // zeroed for FOB
    costales: 226.1,
    coberturas: 15,
    costosExportacion: 836.14512,
  });
  closeTo(r.precioFinalUsdTm, 5425, 1e-9, "precioFinal (E41)");
  assert.equal(r.comisionUsdTm, 0, "comisión con pérdida = 0 (E36)");
  closeTo(r.costoTotalUsdTm, 5507.617837, 1e-5, "costo total (E38)");
  closeTo(r.utilidadPct, -0.01500064814, 1e-9, "utilidad (E39)");
  assert.equal(r.lines.find((l) => l.key === "estibas")!.usdPerTm, 0);
  const compraUsd = r.lines.find((l) => l.key === "compra")!.usdPerTm;
  closeTo(r.lines.find((l) => l.key === "fnc")!.usdPerTm, FNC_PCT * compraUsd, 1e-9);
  closeTo(r.lines.find((l) => l.key === "merma")!.usdPerTm, MERMA_PCT * compraUsd, 1e-9);
});

test("cotizador CIF — hoja", () => {
  const r = cotizar({
    ...zeros,
    incoterm: "CIF",
    comisionPct: 0.1,
    volumenTM: 5,
    transporteBodega: 600, // zeroed for CIF
    seleccion: 83,
    fumigacion: 100,
    estibas: 53,
    costales: 215,
    coberturas: 15,
    costosExportacion: 720,
  });
  assert.equal(r.comisionUsdTm, 0);
  closeTo(r.costoTotalUsdTm, 5455.133904, 1e-5, "costo total (E38)");
  closeTo(r.utilidadPct, -0.005523953166, 1e-9, "utilidad (E39)");
  assert.equal(r.lines.find((l) => l.key === "transporte_bodega")!.usdPerTm, 0);
});

test("cotizador FOB — comisión sobre la utilidad cuando hay ganancia", () => {
  const r = cotizar({ ...zeros, incoterm: "FOB", comisionPct: 0.08, diferencial: 0.1 });
  const compraUsd = (15750 * 1000) / TRM;
  const sinComision = compraUsd * (1 + FNC_PCT + MERMA_PCT);
  closeTo(r.comisionUsdTm, 0.08 * (5425 * 1.1 - sinComision), 1e-9);
});

test("cotizador — parámetros de admin reemplazan los de la hoja", () => {
  const r = cotizar({ ...zeros, incoterm: "FOB", comisionPct: 0, fncPct: 0, mermaPct: 0.01 });
  assert.equal(r.lines.find((l) => l.key === "fnc")!.usdPerTm, 0);
  closeTo(r.lines.find((l) => l.key === "merma")!.usdPerTm, (0.01 * 15750 * 1000) / TRM, 1e-9);
  const n = cotizar({ ...nacional, factorNacional: 0.95 });
  closeTo(n.precioFinalUsdTm, (15750 * 1000) / TRM / 0.95, 1e-9);
});

test("cotizador — totales de la operación escalan con el volumen", () => {
  const r = cotizar({ ...zeros, incoterm: "FOB", comisionPct: 0.08, volumenTM: 25 });
  closeTo(r.totalOperacionUsd, r.precioFinalUsdTm * 25, 1e-6);
  closeTo(r.totalOperacionCop, r.precioFinalCopTm * 25, 1e-6);
});

test("cotizador — TRM <= 0 falla", () => {
  assert.throws(() => cotizar({ ...zeros, trm: 0, incoterm: "FOB", comisionPct: 0.08 }));
});

test("esViable — umbral 10 % inclusive", () => {
  assert.equal(esViable(0.1), true);
  assert.equal(esViable(0.0999), false);
  assert.equal(esViable(0.05, 0.05), true);
});
