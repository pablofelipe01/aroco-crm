import { test } from "node:test";
import assert from "node:assert/strict";
import { leadValueCop, pickReferencePrice, leadValueForMarket } from "./lead-value";

const PRICES = { luker: 14100, ice: 17200 };

test("leadValueCop — toneladas × 1000 × precio", () => {
  // 25 T × 1000 kg × 14.100 COP/kg = 352.500.000
  assert.equal(leadValueCop(25, 14100), 352_500_000);
  assert.equal(leadValueCop(1, 17200), 17_200_000);
});

test("leadValueCop — datos faltantes / inválidos → null", () => {
  assert.equal(leadValueCop(null, 14100), null);
  assert.equal(leadValueCop(0, 14100), null);
  assert.equal(leadValueCop(-5, 14100), null);
  assert.equal(leadValueCop(10, null), null);
  assert.equal(leadValueCop(10, 0), null);
  assert.equal(leadValueCop(NaN, 14100), null);
});

test("pickReferencePrice — Luker (Nacional) / ICE (Internacional)", () => {
  assert.equal(pickReferencePrice("Nacional", PRICES), 14100);
  assert.equal(pickReferencePrice("Internacional", PRICES), 17200);
  assert.equal(pickReferencePrice(null, PRICES), null);
  assert.equal(pickReferencePrice("Nacional", { luker: null, ice: 17200 }), null);
});

test("leadValueForMarket — combina mercado + precios", () => {
  assert.equal(leadValueForMarket(10, "Nacional", PRICES), 141_000_000);
  assert.equal(leadValueForMarket(10, "Internacional", PRICES), 172_000_000);
  assert.equal(leadValueForMarket(10, null, PRICES), null);
  assert.equal(leadValueForMarket(null, "Nacional", PRICES), null);
});
