import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fechaPlanilla,
  fueraDeOrden,
  leerCompra,
  leerCompras,
  leerEquipo,
  leerRiego,
} from "./combustible-hoja";

/*
 * Filas copiadas de la «Planilla Control Operacion combustible riego» real,
 * leídas con `sheet_to_json(..., { header: 1, raw: true })`: fechas y horas
 * como seriales y fracciones de Excel, tal como llegan.
 */

const ENC_DIESEL = ["FECHA", "RECIBO No.", "DESCRIPCION ", "NIT", "BENEFICIARIO", "CANTIDAD (Gal)", "RENDIMIENTO ESPERADO (hr)", "PRECIO", "CENTRO DE COSTOS", "VR.TOTAL", "Observaciones"];
const ENC_RIEGO = ["FECHA", "INVENTARIO INICIAL", "CONSUMO ESPERADO (HR)", "CARGA MOTOR", "CONSUMO", "INVENTARIO FINAL", "VALVULA/LOTE", "HORA INICIO", "HORA TERMINACIÓN", "HORAS DE RIEGO", "OBSERVACIONES"];

test("fechaPlanilla: serial, texto «31//07/21» y años mal digitados", () => {
  assert.deepEqual(fechaPlanilla(45828, null), { fecha: "2025-06-20", duda: null });
  // «31//07/21»: día y mes; el año, el de la fila de arriba (no «21»).
  const t = fechaPlanilla("31//07/21", "2025-07-30");
  assert.equal(t.fecha, "2025-07-31");
  assert.match(t.duda!, /texto/);
  // 2022 entre filas de diciembre de 2025.
  const a = fechaPlanilla(44915, "2025-12-19");
  assert.equal(a.fecha, "2025-12-20");
  assert.match(a.duda!, /2022→2025/);
  // DIESEL: «2025-01-08» después del 29-dic-2025 es el 8-ene-2026.
  const b = fechaPlanilla(45665, "2025-12-29");
  assert.equal(b.fecha, "2026-01-08");
  assert.match(b.duda!, /2025→2026/);
  // Un salto atrás que con otro año NO cae en su sitio se deja como está.
  assert.equal(fechaPlanilla(45867, "2025-09-27").fecha, "2025-07-29");
  assert.deepEqual(fechaPlanilla(null, "2025-09-27"), { fecha: null, duda: null });
});

test("fueraDeOrden: marca el día suelto, no todo lo que sigue", () => {
  // RIEGO real: un 25-jun antes de un bloque de mayo a junio.
  const f = ["2026-05-21", "2026-05-23", "2026-06-25", "2026-05-26", "2026-05-27", "2026-06-03", "2026-07-01"];
  assert.deepEqual(fueraDeOrden(f), [false, false, true, false, false, false, false]);
  // Hueco largo hacia adelante (enero → marzo): no es error.
  assert.deepEqual(fueraDeOrden(["2026-01-08", "2026-03-25", "2026-04-12"]), [false, false, false]);
  assert.deepEqual(fueraDeOrden([]), []);
});

test("leerCompra: fila de DIESEL con recibo y valor en celdas formato fecha", () => {
  // Fila 2 real: el recibo 48732 se ve «2033-06-02» en Excel.
  const c = leerCompra(
    [45828, 48732, "ACPM", "5659602-1", "E.S EL PORVENIR", 28.598665395614873, 29.48316020166482, 10490, "SISTEMA DE RIEGO", 300000, null],
    2,
    "acpm",
    null,
  )!;
  assert.equal(c.fecha, "2025-06-20");
  assert.equal(c.recibo, "48732");
  assert.equal(c.galones, 28.599);
  assert.equal(c.precio_galon, 10490);
  assert.equal(c.valor, 300000);
  assert.equal(c.proveedor, "E.S. El Porvenir");
  assert.equal(c.destino, "SISTEMA DE RIEGO");
  assert.deepEqual(c.dudas, []);
});

test("leerCompra: consignación sin galones (fila 24) y gasolina de la cooperativa", () => {
  const sin = leerCompra([46106, null, "ACPM", "56596602-1", "E.S EL PORVENIR", null, null, null, "SISTEMA DE RIEGO", 500000, "Consignaion por Nequi"], 24, "acpm", "2026-01-08")!;
  assert.equal(sin.galones, null);
  assert.ok(sin.dudas.includes("sin galones"));
  assert.equal(sin.observaciones, "Consignaion por Nequi");
  // GASOLINA fila 13: valor 45100 (se ve «2023-06-23»), recibo de texto.
  const coop = leerCompra([45995, "FEGS-438035", "GASOLINA", "890600056-6", "Coop Veracruz", 2.786, 2.872, 16188, "control Mecanico de  Malezas", 45100, null], 13, "gasolina", null)!;
  assert.equal(coop.recibo, "FEGS-438035");
  assert.equal(coop.valor, 45100);
  assert.equal(coop.proveedor, "Cooperativa Veracruz");
  assert.equal(coop.destino, "control Mecanico de Malezas");
});

test("leerCompras: las filas de plantilla del final no cuentan", () => {
  const filas = [
    ENC_DIESEL,
    [45828, 48732, "ACPM", "5659602-1", "E.S EL PORVENIR", 28.6, 29.5, 10490, "SISTEMA DE RIEGO", 300000, null],
    [null, null, null, "56596602-1", null, 0, 0, 15939, null, null, null],
    [null, null, null, "56596602-1", null, null, null, 15939, null, null, null],
  ];
  assert.equal(leerCompras(filas, "acpm").length, 1);
});

test("leerRiego: la fecha se hereda dentro del día y la carga va con su día", () => {
  const filas = [
    ENC_RIEGO,
    // 455–459 reales: un día, cinco grupos de válvulas, la fecha solo arriba.
    [46257, null, null, 18, null, null, "8, 14, 15", 0.125, 0.25, 3, null],
    [null, null, null, null, null, null, 17, 0.25, 0.4166666666666667, 4, null],
    [null, null, null, null, null, null, "1, 2, 3", 0.5833333333333334, 0.75, 4, "riego juan carlos"],
    // 2026-09-13: retanqueo sin riego.
    [46278, null, null, 3, null, null, null, null, null, 0, "se retanquea por lavado del tamque"],
    // Fórmula de horas en una fila vacía: no cuenta.
    [null, null, null, null, null, null, null, null, null, 0, null],
  ];
  const u = leerRiego(filas);
  assert.equal(u.length, 4);
  assert.deepEqual(u.map((x) => x.fecha), ["2026-08-23", "2026-08-23", "2026-08-23", "2026-09-13"]);
  assert.deepEqual(u[0].valvulas, ["8", "14", "15"]);
  assert.equal(u[0].horas, 3);
  assert.equal(u[0].hora_inicio, "03:00");
  assert.equal(u[0].carga_galones, 18);
  assert.equal(u[1].carga_galones, null, "la carga es del día, va en la primera fila");
  assert.deepEqual(u[1].valvulas, ["17"]);
  assert.equal(u[3].horas, null);
  assert.equal(u[3].carga_galones, 3);
  assert.deepEqual(u[3].dudas, []);
});

test("leerRiego: «Motor» es el sitio y la hora 1200 no es una hora", () => {
  const u = leerRiego([
    ENC_RIEGO,
    [45868, "", "", null, null, null, "Motor", 0.25, 0.3333333333333333, 2, "cambio de aceite"],
    [46010, "", null, null, null, null, "1, 2, 3", 1200, 0.5833333333333334, -28786, null],
  ]);
  assert.equal(u[0].sitio, "Motor");
  assert.deepEqual(u[0].valvulas, []);
  assert.deepEqual(u[0].dudas, []);
  assert.equal(u[1].horas, null);
  assert.match(u[1].dudas.join(), /horas imposibles/);
});

test("leerEquipo: guadaña, plantilla final y lugares que no son válvulas", () => {
  // Hoja «guadaña» desde B3: índice 0 = fila 3 de Excel.
  const filas: unknown[][] = Array.from({ length: 9 }, () => []);
  filas.push(["Item", "Fecha", "Actividad", "Inicial", "final", "Diferencia", "Valvula / Lote", "Inicio", "Final", "Horas Trabajadas", "Hora de Inicio", "observacion"]);
  filas.push([1, 45849, "Control Mecanico de Malezas", 0.4166666666666667, 0.5833333333333334, 0.16666666666666669, "9, _ 10", null, null, null, 0.05, "Consumo de 0,3 Litro Hr"]);
  filas.push([3, 45890, "Control Mecanico de Malezas", 0.25, 0.5833333333333334, 0.3333333333333333, "casa principal", null, null, null, 0.1, null]);
  filas.push([48, 46044, "Control Mecanico de Malezas", 0.25, 0.5833333333333334, 0.3333333333333333, "Lago Alrededor", null, null, null, 0.1, null]);
  filas.push([null, null, null, 0.25, 0.5833333333333334, 0.3333333333333333, null, null, null, null, 0.1, null]);
  filas.push([31, "Totales Galones /Horas", null, null, null, null, null, null, null, 0, 0.63, null]);
  const u = leerEquipo(filas, 3);
  assert.equal(u.length, 3, "sin el renglón de plantilla ni los totales");
  assert.equal(u[0].fila, 13);
  assert.equal(u[0].fecha, "2025-07-11");
  assert.deepEqual(u[0].valvulas, ["9", "10"]);
  assert.equal(u[0].horas, 4);
  assert.equal(u[0].observaciones, null, "la nota de consumo no es una observación");
  assert.equal(u[1].sitio, "Quinta");
  assert.equal(u[2].sitio, "Lago Alrededor");
  assert.deepEqual(u[2].dudas, []);
});

test("leerEquipo: en bombas la observación con nombre completo es el trabajador", () => {
  const filas: unknown[][] = [
    [18, 46085, "Control Monilia (Hongos)", 0.25, 0.5833333333333334, 0.3333333333333333, "1 Frutal - 21", null, null, 0, 0.33, "william osorio"],
    [5, 45927, "Control Monilia (Hongos)", 0.25, 0.4166666666666667, 0.16666666666666669, "1 frutal - 21", null, null, null, 0.17, "jonathan"],
  ];
  const u = leerEquipo(filas, 12);
  assert.equal(u[0].empleado, "William Osorio");
  assert.deepEqual(u[0].valvulas, ["1 Frutal", "21"]);
  assert.equal(u[1].empleado, null, "«jonathan» no está en la lista de trabajadores");
  assert.equal(u[1].observaciones, "jonathan");
});
