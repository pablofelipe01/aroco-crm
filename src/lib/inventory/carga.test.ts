import { test } from "node:test";
import assert from "node:assert/strict";
import { ajusteSchema, codigoIngreso, ingresoSchema, revisarSalida, salidaSchema, type ClaseCrm } from "./carga";

const vacio = (): Record<ClaseCrm, number> => ({
  premium: 0, estandar: 0, fairtrade: 0, rainforest: 0, corriente: 0,
  corriente_c: 0, pasilla: 0, organico: 0, baba: 0,
});

test("un ingreso necesita kilos de alguna clase; la bodega puede ir automática", () => {
  const base = { entry_date: "2026-11-06", bodega: "nilo", kilos: { estandar: 0 } };
  assert.equal(ingresoSchema.safeParse(base).success, false);
  assert.equal(ingresoSchema.safeParse({ ...base, kilos: { baba: 300 } }).success, true);
  assert.equal(ingresoSchema.safeParse({ ...base, bodega: "medellin", kilos: { baba: 1 } }).success, false);
  assert.equal(ingresoSchema.safeParse({ ...base, bodega: null, kilos: { baba: 1 } }).success, true);
  assert.equal(ingresoSchema.safeParse({ ...base, kilos: { baba: -5 } }).success, false);
});

test("una salida sin líneas o con kilos en cero no pasa", () => {
  const base = { dispatch_date: "2026-11-06", destination: "CASA LUKER" };
  assert.equal(salidaSchema.safeParse({ ...base, lineas: [] }).success, false);
  const lote = "920a9353-2dc1-4b52-aedf-e25415c61b34";
  assert.equal(salidaSchema.safeParse({ ...base, lineas: [{ lote_id: lote, clase: "estandar", kg: 0 }] }).success, false);
  assert.equal(salidaSchema.safeParse({ ...base, lineas: [{ lote_id: lote, clase: "estandar", kg: 100 }] }).success, true);
});

test("revisarSalida suma las líneas del mismo lote y clase antes de comparar", () => {
  const disp = new Map([["a", { ...vacio(), estandar: 100 }]]);
  const nombre = () => "Lote A";
  assert.equal(revisarSalida([{ lote_id: "a", clase: "estandar", kg: 60 }], disp, nombre), null);
  const err = revisarSalida(
    [
      { lote_id: "a", clase: "estandar", kg: 60 },
      { lote_id: "a", clase: "estandar", kg: 50 },
    ],
    disp,
    nombre,
  );
  assert.match(err ?? "", /Lote A: pides 110 kg de Estándar y quedan 100 kg/);
  assert.match(revisarSalida([{ lote_id: "a", clase: "baba", kg: 1 }], disp, nombre) ?? "", /Baba/);
});

test("una reclasificación necesita una clase de destino distinta", () => {
  const base = { lot_id: "920a9353-2dc1-4b52-aedf-e25415c61b34", fecha: "2026-11-06", kg: 5 };
  assert.equal(ajusteSchema.safeParse({ ...base, tipo: "merma", clase_origen: "baba" }).success, true);
  assert.equal(ajusteSchema.safeParse({ ...base, tipo: "reclasificacion", clase_origen: "estandar" }).success, false);
  assert.equal(
    ajusteSchema.safeParse({ ...base, tipo: "reclasificacion", clase_origen: "estandar", clase_destino: "estandar" }).success,
    false,
  );
  assert.equal(
    ajusteSchema.safeParse({ ...base, tipo: "reclasificacion", clase_origen: "estandar", clase_destino: "pasilla" }).success,
    true,
  );
});

test("codigoIngreso sigue el patrón del archivo", () => {
  assert.equal(
    codigoIngreso({ departamento: "Santander", municipio: "Lebrija", proveedor: "Los Sauces", entry_date: "2026-11-04" }),
    "CO-SAN-LEB-LOS SAUCES-041126",
  );
  assert.equal(codigoIngreso({ departamento: "Cundinamarca", municipio: "Nilo", entry_date: "2026-11-06" }), "CO-CUN-NIL--061126");
});
