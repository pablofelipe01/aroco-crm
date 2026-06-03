import { test } from "node:test";
import assert from "node:assert/strict";
import {
  simulateCommission,
  pctForRole,
  splitCommission,
  DEFAULT_RULES,
  VENTA_SHARE,
  COMPRA_SHARE,
} from "./comisiones";

function closeTo(actual: number, expected: number, tol = 1e-6, msg?: string) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg ?? ""} esperado ≈ ${expected}, obtenido ${actual}`,
  );
}

// ── SPEC §8.2 reference ──────────────────────────────────────────────────────
test("comisiones — reference (Intl/Senior, Compra+Venta)", () => {
  const r = simulateCommission({
    ventaTotal: 65000,
    costoTotal: 36000,
    market: "Internacional",
    level: "Senior",
    role: "Compra+Venta",
  });
  closeTo(r.utilidadBruta, 29000, 1e-6, "utilidadBruta");
  closeTo(r.margen, 29000 / 65000, 1e-9, "margen");
  closeTo(r.pctAplicable, 0.08, 1e-9, "pctAplicable");
  closeTo(r.comision, 2320, 1e-6, "comisión");
});

test("comisiones — role splits derive from pct_full (60/40)", () => {
  assert.equal(pctForRole(0.1, "Compra+Venta"), 0.1);
  closeTo(pctForRole(0.1, "Solo Venta"), 0.06);
  closeTo(pctForRole(0.1, "Solo Compra"), 0.04);
});

test("comisiones — Solo Venta / Solo Compra over an operation", () => {
  const venta = simulateCommission({
    ventaTotal: 65000,
    costoTotal: 36000,
    market: "Internacional",
    level: "Senior",
    role: "Solo Venta",
  });
  closeTo(venta.comision, 29000 * 0.08 * VENTA_SHARE);
  const compra = simulateCommission({
    ventaTotal: 65000,
    costoTotal: 36000,
    market: "Internacional",
    level: "Senior",
    role: "Solo Compra",
  });
  closeTo(compra.comision, 29000 * 0.08 * COMPRA_SHARE);
});

test("comisiones — two-agent split sums to the full commission", () => {
  const total = 2320;
  const { venta, compra } = splitCommission(total);
  closeTo(venta, total * VENTA_SHARE);
  closeTo(compra, total * COMPRA_SHARE);
  closeTo(venta + compra, total);
});

test("comisiones — default seed matrix matches SPEC §6", () => {
  const get = (m: "Nacional" | "Internacional", l: "Senior" | "Junior") =>
    DEFAULT_RULES.find((r) => r.market === m && r.level === l)!.pct_full;
  assert.equal(get("Nacional", "Senior"), 0.05);
  assert.equal(get("Nacional", "Junior"), 0.03);
  assert.equal(get("Internacional", "Senior"), 0.08);
  assert.equal(get("Internacional", "Junior"), 0.06);
});

test("comisiones — unknown rule throws", () => {
  assert.throws(() =>
    simulateCommission({
      ventaTotal: 1,
      costoTotal: 0,
      market: "Nacional",
      level: "Senior",
      role: "Compra+Venta",
      rules: [],
    }),
  );
});
