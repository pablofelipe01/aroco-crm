import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ColumnaFaltante,
  costoRealPorKg,
  fechaISO,
  numero,
  parseOperaciones,
} from "./operaciones";

/**
 * Forma real de «VENTAS 2026»: dos filas de rótulos sueltos encima, y luego el
 * encabezado de verdad. Se reproducen los nombres REPETIDOS, que son lo que
 * hace difícil leer esta hoja.
 */
const ENC = [
  "", "CLIENTE DESTINO", "FECHA  LLEGADA BTA", "ODC", "REMISION AROCO",
  "FACT AROCO", "RECEPCION", "PEDIDO", "ORIGEN", "BULTOS",
  "PESO REMISION (Kg)", "AROCO  Kg", "RECEPCION CACAO Kg",
  "Valor  Kilo\nNegociado", "Valor Total", "Valor Bonificacion", "VALOR A PAGAR",
  "Precio base negociado con proveedor", "pago Base negociado",
  "Descuento por Humedad", "Valor Descuento", "Subtotal",
  "Valor Bonificación", "Subtotal", "RET FTE", "Valor Retenciones",
  "VALOR A PAGAR AL PROVEEDOR", "VALOR A FAVOR DE AROCO",
  "FACT AROCO", "COMISION FLETE CACAO", "Subtotal", "VALOR DISPONIBLE AROCO",
  "FACT AROCO", "COMISION SOSTENIBLE", "VALOR DISPONIBLE AROCO",
  "COSTO TRANSPORTE Y SELECCION", "UTILIDAD", "VENTA (60%)", "COMPRA (40%)",
];

const i = (nombre: string, ocurrencia = 1) => {
  let vistas = 0;
  for (let k = 0; k < ENC.length; k++) {
    if (ENC[k] === nombre && ++vistas === ocurrencia) return k;
  }
  throw new Error(`no está ${nombre}`);
};

/** Fila con los valores reales de la ODC-52 de agosto. */
function fila(cambios: Record<number, string> = {}): string[] {
  const f = new Array(ENC.length).fill("");
  f[i("CLIENTE DESTINO")] = "LUKER";
  f[i("FECHA  LLEGADA BTA")] = "13/08/2026";
  f[i("ODC")] = "ODC-52";
  f[i("REMISION AROCO")] = "2142";
  f[i("RECEPCION")] = "2411";
  f[i("ORIGEN")] = "CISCA ruta #3";
  f[i("RECEPCION CACAO Kg")] = "1.510,700";
  f[i("Valor Total")] = "$ 22.026.943";
  f[i("Valor Bonificacion")] = "$ 1.053.896";
  f[i("VALOR A PAGAR")] = "$ 23.080.839";
  f[i("Precio base negociado con proveedor")] = "$ 12.012,00";
  f[i("pago Base negociado")] = "$ 18.146.528,40";
  f[i("Valor Descuento")] = "$ 0,00";
  f[i("Valor Bonificación")] = "$ 1.053.895,67";
  f[i("Valor Retenciones")] = "$ 288.006,36";
  f[i("VALOR A PAGAR AL PROVEEDOR")] = "$ 18.912.417,71";
  f[i("VALOR A FAVOR DE AROCO")] = "$ 3.475.996,55";
  f[i("COMISION FLETE CACAO")] = "$ 271.174,00";
  f[i("COMISION SOSTENIBLE")] = "$ 0,00";
  f[i("VALOR DISPONIBLE AROCO", 2)] = "$ 3.459.164,00";
  for (const [k, v] of Object.entries(cambios)) f[Number(k)] = v;
  return f;
}

const hoja = (...filas: string[][]) => [
  ["", "", "", "", "", "", "VENTAS CASA LUKER"],
  ["", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "", "7,50%"],
  ENC,
  ...filas,
];

test("los montos en formato colombiano se leen con su signo", () => {
  assert.equal(numero("$ 19.198.800,00"), 19_198_800);
  assert.equal(numero("-$ 3.836.839,85"), -3_836_839.85);
  assert.equal(numero("8.939,6"), 8939.6);
  assert.equal(numero(""), 0);
});

test("las fechas se pasan a ISO", () => {
  assert.equal(fechaISO("13/08/2026"), "2026-08-13");
  assert.equal(fechaISO("2026-08-13"), "2026-08-13");
  assert.equal(fechaISO("agosto"), null);
});

test("los encabezados repetidos no se confunden entre sí", () => {
  // «Valor Bonificación» sale dos veces —una del lado de la venta y otra del
  // lado del proveedor— y son cifras distintas del mismo negocio. Quedarse con
  // la última mezclaría los dos lados.
  const { operaciones } = parseOperaciones(hoja(fila()));
  const o = operaciones[0];
  assert.equal(o.valorBonificacion, 1_053_896, "la de la venta");
  assert.equal(o.bonificacionProveedor, 1_053_895.67, "la del proveedor");

  // «VALOR A PAGAR» y «VALOR A PAGAR AL PROVEEDOR» son columnas distintas: una
  // comparación por prefijo las confundiría.
  assert.equal(o.valorAPagar, 23_080_839);
  assert.equal(o.pagoProveedor, 18_912_417.71);

  // «VALOR DISPONIBLE AROCO» sale dos veces; la liquidación usa la segunda.
  assert.equal(o.disponibleAroco, 3_459_164);
});

test("el costo real NO es el precio base negociado", () => {
  // Es el punto de toda la pestaña: el CRM tenía 12.012 y la operación costó
  // 12.519, porque al proveedor se le paga además la bonificación de calidad.
  const { operaciones } = parseOperaciones(hoja(fila()));
  const o = operaciones[0];
  assert.equal(o.precioBaseProveedor, 12_012);
  assert.equal(costoRealPorKg(o), 12_518.98);
});

test("la cadena del proveedor se comprueba y cuadra", () => {
  // pago base − descuento + bonificación − retenciones = a pagar al proveedor.
  const { descuadres } = parseOperaciones(hoja(fila()));
  assert.deepEqual(descuadres, []);
});

test("si la cadena no cuadra, se reporta en vez de guardarse callando", () => {
  // Es la señal de que se está leyendo una columna equivocada. Sin esto, un
  // cambio de forma de la hoja entraría como un costo plausible y falso.
  const rota = fila({ [i("VALOR A PAGAR AL PROVEEDOR")]: "$ 17.000.000,00" });
  const { descuadres, operaciones } = parseOperaciones(hoja(rota));
  assert.equal(descuadres.length, 1);
  assert.equal(descuadres[0].odc, "ODC-52");
  assert.equal(descuadres[0].encontrado, 17_000_000);
  // La fila igual se guarda: el descuadre se avisa, no se descarta el dato.
  assert.equal(operaciones.length, 1);
});

test("las filas sin ODC o sin kilos se descartan diciendo por qué", () => {
  const sinOdc = fila({ [i("ODC")]: "" });
  const sinKg = fila({ [i("RECEPCION CACAO Kg")]: "0" });
  const { operaciones, descartadas } = parseOperaciones(hoja(fila(), sinOdc, sinKg));
  assert.equal(operaciones.length, 1);
  assert.equal(descartadas.length, 2);
  assert.match(descartadas[0].motivo, /sin ODC/);
  assert.match(descartadas[1].motivo, /sin kilos/);
});

test("el encabezado no se busca en una fila fija", () => {
  // Encima hay dos filas de rótulos sueltos, y alguien puede meter otra.
  const conMasRuido = [["nota suelta"], [], ...hoja(fila())];
  const { operaciones } = parseOperaciones(conMasRuido);
  assert.equal(operaciones[0].odc, "ODC-52");
});

test("si falta una columna de la cadena, falla de frente", () => {
  const sinPago = ENC.map((c) =>
    c === "VALOR A PAGAR AL PROVEEDOR" ? "OTRA COSA" : c,
  );
  assert.throws(
    () => parseOperaciones([[], [], sinPago, fila()]),
    ColumnaFaltante,
  );
});
