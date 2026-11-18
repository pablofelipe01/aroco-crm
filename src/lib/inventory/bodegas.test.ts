import { test } from "node:test";
import assert from "node:assert/strict";
import { bodegaAutomatica, bodegaPorOrigen, coberturaPrecio, leerBodega, valorPorKg, disponiblePorTipo, resumenPorBodega, totalTipos, type DisponiblePorClase } from "./bodegas";

const lote = (o: Partial<DisponiblePorClase> & { bodega?: string | null }) => ({
  qty_avail_premium_kg: 0,
  qty_avail_estandar_kg: 0,
  qty_avail_corriente_kg: 0,
  qty_avail_corriente_c_kg: 0,
  qty_avail_fairtrade_kg: 0,
  qty_avail_rainforest_kg: 0,
  qty_avail_organico_kg: 0,
  qty_avail_pasilla_kg: 0,
  bodega: null,
  ...o,
});

test("las ocho calidades caen en Primera, Segunda u Orgánico sin perder kilos", () => {
  const l = lote({
    qty_avail_premium_kg: 1,
    qty_avail_estandar_kg: 2,
    qty_avail_fairtrade_kg: 4,
    qty_avail_rainforest_kg: 8,
    qty_avail_corriente_kg: 16,
    qty_avail_corriente_c_kg: 32,
    qty_avail_pasilla_kg: 64,
    qty_avail_organico_kg: 128,
  });
  const t = disponiblePorTipo({ ...l, qty_avail_baba_kg: 256 });
  assert.deepEqual(t, { organico: 128, primera: 15, segunda: 112, baba: 256 });
  assert.equal(totalTipos(t), 511);
});

test("el resumen separa por bodega y deja aparte los lotes sin asignar", () => {
  const { filas, total } = resumenPorBodega([
    lote({ bodega: "cauca", qty_avail_estandar_kg: 888 }),
    lote({ bodega: "nilo", qty_avail_organico_kg: 101, qty_avail_corriente_c_kg: 28 }),
    lote({ bodega: null, qty_avail_estandar_kg: 9510 }),
    lote({ bodega: "cauca" }), // agotado: no cuenta
  ]);
  const de = (b: string | null) => filas.find((f) => f.bodega === b)!;
  assert.equal(de("cauca").total, 888);
  assert.equal(de("cauca").lotes, 1);
  assert.deepEqual(de("nilo").tipos, { organico: 101, primera: 0, segunda: 28, baba: 0 });
  assert.equal(de("bogota").total, 0);
  assert.equal(de(null).total, 9510);
  assert.equal(total.total, 888 + 129 + 9510);
  assert.equal(total.lotes, 3);
});

test("sin lotes sin asignar no aparece la fila de pendientes", () => {
  const { filas } = resumenPorBodega([lote({ bodega: "bogota", qty_avail_premium_kg: 5 })]);
  assert.deepEqual(filas.map((f) => f.bodega), ["cauca", "bogota", "nilo"]);
});

test("bodegaPorOrigen: Cauca a Cauca, Cundinamarca y Tolima a Nilo, lo demás a Bogotá", () => {
  assert.equal(bodegaPorOrigen("CAUCA"), "cauca");
  assert.equal(bodegaPorOrigen("Cundinamarca"), "nilo");
  assert.equal(bodegaPorOrigen("TOLIMA"), "nilo");
  assert.equal(bodegaPorOrigen("SANTANDER"), "bogota");
  assert.equal(bodegaPorOrigen("META"), "bogota");
  // Sin departamento, por el código.
  assert.equal(bodegaPorOrigen(null, "CO-CAU-GUACH (RESCATE)-190825"), "cauca");
  assert.equal(bodegaPorOrigen("", "COL-TOL-LIM-110826(ACOPIO)"), "nilo");
  assert.equal(bodegaPorOrigen(null, "Cauca-190226(Ruta Padilla)"), "bogota");
  assert.equal(bodegaPorOrigen(null, null), "bogota");
});

test("leerBodega entiende cómo la escribe la bodega y no adivina lo demás", () => {
  assert.equal(leerBodega("Bogotá"), "bogota");
  assert.equal(leerBodega(" BODEGA BOGOTA "), "bogota");
  assert.equal(leerBodega("El Nilo"), "nilo");
  assert.equal(leerBodega("cauca"), "cauca");
  assert.equal(leerBodega("Medellín"), null);
  assert.equal(leerBodega(""), null);
  assert.equal(leerBodega(null), null);
});

test("la hoja gana sobre el origen: 888 kg del Cauca en Bogotá van a Bogotá", () => {
  const l = { departamento: "CAUCA", code: "CO-CAUCA -Ruta 4 - CALOTO", bodega_hoja: "bogota" };
  assert.deepEqual(bodegaAutomatica(l), { bodega: "bogota", origen: "hoja" });
  assert.deepEqual(bodegaAutomatica({ ...l, bodega_hoja: null }), {
    bodega: "cauca",
    origen: "estimada",
  });
});

test("valor por kg: promedio ponderado por kilos, sin contar como $0 los lotes sin precio", () => {
  const { filas, total } = resumenPorBodega([
    { ...lote({ qty_avail_estandar_kg: 1000, bodega: "bogota" }), purchase_price_cop_kg: 15000 },
    { ...lote({ qty_avail_premium_kg: 3000, bodega: "bogota" }), purchase_price_cop_kg: 17000 },
    { ...lote({ qty_avail_corriente_kg: 1000, bodega: "bogota" }), purchase_price_cop_kg: null },
    { ...lote({ qty_avail_corriente_kg: 500, bodega: "cauca" }), purchase_price_cop_kg: null },
  ]);
  const bog = filas.find((f) => f.bodega === "bogota")!;
  assert.equal(valorPorKg(bog), 16500); // (1000×15000 + 3000×17000) / 4000
  assert.equal(coberturaPrecio(bog), 0.8);
  assert.equal(valorPorKg(filas.find((f) => f.bodega === "cauca")!), null);
  assert.equal(valorPorKg(total), 16500);
  assert.equal(coberturaPrecio(total), 4000 / 5500);
});
