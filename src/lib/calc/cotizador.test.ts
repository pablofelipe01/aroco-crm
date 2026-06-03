import { test } from "node:test";
import assert from "node:assert/strict";
import { cotizar, FNC_PCT, MERMA_PCT, type CotizadorInput } from "./cotizador";

const TRM = 3557.81;

function closeTo(actual: number, expected: number, tol: number, msg?: string) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg ?? ""} esperado ≈ ${expected}, obtenido ${actual} (tol ${tol})`,
  );
}

const baseModifiers = {
  trm: TRM,
  precioCompraKg: 12100,
  volumenTM: 1,
  transporteBodega: 0,
  seleccion: 0,
  fumigacion: 0,
  estibas: 0,
  costales: 0,
  coberturas: 0,
  costosExportacion: 0,
};

// ── NACIONAL (fully reproducible from SPEC §8.1) ─────────────────────────────
test("cotizador NACIONAL — reference values", () => {
  const input: CotizadorInput = {
    ...baseModifiers,
    incoterm: "NACIONAL",
    cocoaUsdT: 0,
    diferencial: 0,
    comisionPct: 0.05,
    targetUtilityPct: 0.0884,
    transporteBodega: 150,
    seleccion: 83,
    bonifCalidad: 113.95,
    bonifCadmio: 280,
    bonifTrazabilidad: 120,
    bonifTransporte: 180,
  };
  const r = cotizar(input);
  closeTo(r.netCostK!, 3206.49, 0.2, "K");
  closeTo(r.precioFinalUsdTm, 3506.3, 0.5, "precioFinal");
  closeTo(r.comisionUsdTm, 14.99, 0.1, "comisión");
  closeTo(r.utilidadPct, 0.0884, 0.0005, "utilidad");
  // FNC must be zero for NACIONAL.
  assert.equal(r.lines.find((l) => l.key === "fnc")!.usdPerTm, 0);
});

// ── FOB ──────────────────────────────────────────────────────────────────────
// NOTE: fumigacion/costosExportacion below are the modifier set deduced to
// reproduce the SPEC §8.1 reference aggregate. The per-line split should be
// confirmed with AROCO (alongside bonifCalidad). The formula structure is the
// validated part.
test("cotizador FOB — reference values", () => {
  const input: CotizadorInput = {
    ...baseModifiers,
    incoterm: "FOB",
    cocoaUsdT: 3901,
    diferencial: 0.05,
    comisionPct: 0.08,
    transporteBodega: 150,
    seleccion: 83,
    fumigacion: 60,
    estibas: 0,
    costosExportacion: 720,
  };
  const r = cotizar(input);
  closeTo(r.precioFinalUsdTm, 4096.05, 0.01, "precioFinal");
  closeTo(r.comisionUsdTm, 23.31, 0.1, "comisión");
  closeTo(r.costoTotalUsdTm, 3828.03, 0.2, "costoTotal");
  closeTo(r.utilidadPct, 0.07, 0.0005, "utilidad");
  // Estibas zeroed for FOB.
  assert.equal(r.lines.find((l) => l.key === "estibas")!.usdPerTm, 0);
  // FNC and merma percentages.
  const compraUsd = r.lines.find((l) => l.key === "compra")!.usdPerTm;
  closeTo(r.lines.find((l) => l.key === "fnc")!.usdPerTm, FNC_PCT * compraUsd, 1e-6);
  closeTo(
    r.lines.find((l) => l.key === "merma")!.usdPerTm,
    MERMA_PCT * compraUsd,
    1e-6,
  );
});

// ── CIF ──────────────────────────────────────────────────────────────────────
test("cotizador CIF — reference values", () => {
  const input: CotizadorInput = {
    ...baseModifiers,
    incoterm: "CIF",
    cocoaUsdT: 3901,
    diferencial: 0,
    comisionPct: 0.1,
    transporteBodega: 150, // zeroed by CIF rule
    seleccion: 83,
    fumigacion: 60,
    estibas: 323,
    costosExportacion: 720,
  };
  const r = cotizar(input);
  closeTo(r.precioFinalUsdTm, 3901.0, 0.01, "precioFinal");
  closeTo(r.comisionUsdTm, 4.76, 0.1, "comisión");
  closeTo(r.costoTotalUsdTm, 3858.12, 0.2, "costoTotal");
  closeTo(r.utilidadPct, 0.0111, 0.0005, "utilidad");
  // Transporte a bodega zeroed for CIF.
  assert.equal(
    r.lines.find((l) => l.key === "transporte_bodega")!.usdPerTm,
    0,
  );
});

test("cotizador — operation totals scale with volume", () => {
  const input: CotizadorInput = {
    ...baseModifiers,
    incoterm: "FOB",
    cocoaUsdT: 3901,
    diferencial: 0.05,
    comisionPct: 0.08,
    volumenTM: 25,
  };
  const r = cotizar(input);
  closeTo(r.totalOperacionUsd, r.precioFinalUsdTm * 25, 1e-6);
  closeTo(r.totalOperacionCop, r.precioFinalCopTm * 25, 1e-6);
});

test("cotizador — TRM <= 0 throws", () => {
  assert.throws(() =>
    cotizar({ ...baseModifiers, trm: 0, incoterm: "FOB", cocoaUsdT: 3901, diferencial: 0, comisionPct: 0.08 }),
  );
});
