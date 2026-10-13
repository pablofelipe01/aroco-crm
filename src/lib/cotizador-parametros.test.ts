import { test } from "node:test";
import assert from "node:assert/strict";
import { cotizar, type Incoterm } from "./calc/cotizador";
import { PARAMETROS_HOJA, costosPorDefecto, comisionPorDefecto } from "./cotizador-parametros";

// «Cotizador Comercial Aroco» leída el 2026-10-13: cada pestaña con sus costos
// de la columna M, TRM 3.181,10, cacao 5.425, diferencial 0. El bug de la
// revisión del 2026-10-09 era que FOB y CIF tomaban los costos de NACIONAL.
const TRM = 3181.1;

function cotizarConDefectos(incoterm: Incoterm, precioCompraKg: number) {
  return cotizar({
    incoterm,
    trm: TRM,
    precioCompraKg,
    cocoaUsdT: 5425,
    diferencial: 0,
    volumenTM: 1,
    comisionPct: comisionPorDefecto(PARAMETROS_HOJA, incoterm),
    ...camel(costosPorDefecto(PARAMETROS_HOJA, incoterm)),
    bonifCadmio: PARAMETROS_HOJA.bonif_cadmio,
    bonifTrazabilidad: PARAMETROS_HOJA.bonif_trazabilidad,
    bonifTransporte: PARAMETROS_HOJA.bonif_transporte,
  });
}

function camel(c: ReturnType<typeof costosPorDefecto>) {
  return {
    transporteBodega: c.transporte_bodega,
    seleccion: c.seleccion,
    fumigacion: c.fumigacion,
    estibas: c.estibas,
    costales: c.costales,
    coberturas: c.coberturas,
    costosExportacion: c.costos_exportacion,
  };
}

function closeTo(actual: number, expected: number, tol: number, msg: string) {
  assert.ok(
    Math.abs(actual - expected) <= tol,
    `${msg}: esperado ≈ ${expected}, obtenido ${actual} (tol ${tol})`,
  );
}

test("FOB toma sus propios costos: transporte 104 y exportación 836,15", () => {
  const c = costosPorDefecto(PARAMETROS_HOJA, "FOB");
  assert.equal(c.transporte_bodega, 104);
  assert.equal(c.costos_exportacion, 836.15);
  assert.equal(c.estibas, 0);
  // FOB!E38 = 6.021,89 (la hoja suma 836,14512; aquí 836,15 → ±0,01).
  closeTo(cotizarConDefectos("FOB", 17200).costoTotalUsdTm, 6021.893408, 0.01, "costo total FOB");
});

test("CIF toma sus propios costos: fumigación 100, costales 215, exportación 720", () => {
  const c = costosPorDefecto(PARAMETROS_HOJA, "CIF");
  assert.equal(c.transporte_bodega, 0);
  assert.equal(c.fumigacion, 100);
  assert.equal(c.costales, 215);
  assert.equal(c.costos_exportacion, 720);
  closeTo(cotizarConDefectos("CIF", 16200).costoTotalUsdTm, 5643.64528, 0.001, "costo total CIF");
});

test("NACIONAL solo lleva transporte y selección", () => {
  const c = costosPorDefecto(PARAMETROS_HOJA, "NACIONAL");
  assert.deepEqual(c, {
    transporte_bodega: 150,
    seleccion: 83,
    fumigacion: 0,
    estibas: 0,
    costales: 0,
    coberturas: 0,
    costos_exportacion: 0,
  });
  const r = cotizarConDefectos("NACIONAL", 16200);
  // NACIONAL!E42 y E43, con la bonificación de calidad toda para AROCO (×1).
  closeTo(r.costoTotalUsdTm, 4774.130196, 0.001, "costo total NACIONAL");
  closeTo(r.utilidadPct, 0.09969360635, 1e-6, "utilidad NACIONAL");
  closeTo(r.valorUtilidadUsdTm, 475.9502565, 0.001, "valor utilidad NACIONAL");
});
