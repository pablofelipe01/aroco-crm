import { test } from "node:test";
import assert from "node:assert/strict";
import { TICKER } from "./precio";

test("el ticker es el cacao de ICE NY", () => {
  // Si esto cambia sin querer, la pantalla valoraría el inventario con el
  // precio de otro producto y nada lo delataría: la cifra seguiría siendo
  // plausible.
  assert.equal(TICKER, "CC=F");
});
