import { test } from "node:test";
import assert from "node:assert/strict";
import { partirDocumento, posicionValida, unirDocumento } from "./tipos";

test("unirDocumento y partirDocumento van y vuelven", () => {
  assert.equal(unirDocumento("CC", " 1.234.567 "), "C.C. 1.234.567");
  assert.equal(unirDocumento("NIT", "900.123.456-7"), "NIT 900.123.456-7");
  assert.equal(unirDocumento("PAS", "AB123", "en"), "Passport AB123");
  assert.equal(unirDocumento("CC", "  "), "");
  for (const tipo of ["CC", "NIT", "CE", "PAS", "PPT", "TAX"] as const) {
    assert.deepEqual(partirDocumento(unirDocumento(tipo, "12345")), { tipo, numero: "12345" });
  }
});

test("partirDocumento entiende lo escrito a mano antes del menú", () => {
  assert.deepEqual(partirDocumento("CC 80123456"), { tipo: "CC", numero: "80123456" });
  assert.deepEqual(partirDocumento("Cédula 80.123.456"), { tipo: "CC", numero: "80.123.456" });
  assert.deepEqual(partirDocumento("cédula de extranjería 1234"), { tipo: "CE", numero: "1234" });
  assert.deepEqual(partirDocumento("Nit: 900123456-7"), { tipo: "NIT", numero: "900123456-7" });
  assert.deepEqual(partirDocumento("80123456"), { tipo: "CC", numero: "80123456" });
  assert.deepEqual(partirDocumento(""), { tipo: "CC", numero: "" });
  assert.deepEqual(partirDocumento(null), { tipo: "CC", numero: "" });
});

test("posicionValida rechaza recuadros fuera de la página", () => {
  const ok = { pagina: 2, x: 0.1, y: 0.8, w: 0.3, h: 0.07 };
  assert.ok(posicionValida(ok, 2));
  assert.ok(!posicionValida({ ...ok, pagina: 3 }, 2));
  assert.ok(!posicionValida({ ...ok, x: 0.8 }, 2));
  assert.ok(!posicionValida({ ...ok, y: -0.1 }, 2));
  assert.ok(!posicionValida({ ...ok, w: Number.NaN }, 2));
  assert.ok(!posicionValida(null, 2));
});
