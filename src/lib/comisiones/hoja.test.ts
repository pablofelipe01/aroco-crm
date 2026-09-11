import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BloqueFaltante,
  fechaISO,
  numero,
  numeroDeMes,
  parseLiquidacion,
  porcentaje,
} from "./hoja";

/**
 * Trozo de la hoja real de agosto-2026, con su forma de cuadrícula: los
 * parámetros a la izquierda, el resumen en la columna 6 y los bloques
 * separados por filas en blanco.
 */
function hoja(cambios: { sinLiquidacion?: boolean; columnaExtra?: boolean } = {}) {
  const f = (...celdas: [number, string][]) => {
    const fila: string[] = new Array(22).fill("");
    for (const [c, v] of celdas) fila[c] = v;
    return cambios.columnaExtra ? ["", ...fila] : fila;
  };

  const filas = [
    f([0, "AROCO - LIQUIDACION DE BONIFICACIONES COMERCIALES"]),
    f([0, "Comision sobre la UTILIDAD NETA = col AZ..."]),
    f(),
    f([0, "1. PARAMETROS"]),
    f([0, "Mes a liquidar"], [1, "AGOSTO"], [3, "Mes #"], [4, "8"], [6, "RESUMEN DEL MES"]),
    f([0, "Año"], [1, "2026"], [6, "Toneladas despachadas"], [8, "39,37"]),
    f([0, "Mercado por defecto (si el destino no esta en el maestro)"], [1, "Nacional"], [6, "Utilidad del mes"], [8, "$13.718.684"]),
    f([0, "Umbral Senior (Toneladas)"], [1, "50"], [6, "Total comisiones a pagar"], [8, "$350.446"]),
    f(),
    f([0, "2. SUPUESTOS - % de comision sobre la utilidad (editable)"]),
    f([0, "Mercado"], [1, "% Senior"], [2, "% Junior"]),
    f([0, "Nacional"], [1, "5%"], [2, "3%"]),
    f([0, "Internacional"], [1, "8%"], [2, "6%"]),
    f([3, "COSTOS QUE SE DESCUENTAN DE LA UTILIDAD"]),
    f([0, "% del techo para el VENDEDOR"], [1, "60%"], [3, "Transporte ($/kg)"], [4, "150"]),
    f([0, "% del techo para el COMPRADOR"], [1, "40%"], [3, "Seleccion ($/kg)"], [4, "83"]),
    f(),
  ];

  if (!cambios.sinLiquidacion) {
    filas.push(
      f([0, "4. LIQUIDACION DEL MES - POR COMERCIAL"]),
      f([0, "Comercial"], [1, "Ton Venta"], [2, "Ton Compra"], [3, "Ton Total"], [4, "Nivel"], [5, "% Techo efectivo"], [6, "Utilidad Venta"], [7, "Utilidad Compra"], [8, "Comision Venta"], [9, "Comision Compra"], [10, "TOTAL A PAGAR"]),
      f([0, "Alvaro"], [1, "39,37"], [2, "0,00"], [3, "39,37"], [4, "Junior"], [5, "3,00%"], [6, "$13.718.684"], [7, "$0"], [8, "$246.936"], [9, "$0"], [10, "$246.936"]),
      f([0, "AROCO"], [1, "0,00"], [2, "4,60"], [3, "4,60"], [4, "Junior"], [5, "0,00%"], [6, "$0"], [7, "$5.092.899"], [8, "$0"], [9, "$0"], [10, "$0"]),
      f([0, "John"], [1, "0,00"], [2, "34,78"], [3, "34,78"], [4, "Junior"], [5, "3,00%"], [6, "$0"], [7, "$8.625.785"], [8, "$0"], [9, "$103.509"], [10, "$103.509"]),
      f([0, "TOTAL GENERAL"], [8, "$246.936"], [9, "$103.509"], [10, "$350.446"]),
      f([0, "Esto viene DESPUES del total y no es un comercial"], [10, "$999"]),
      f(),
    );
  }

  filas.push(
    f([0, "5. DETALLE DE OPERACIONES DEL MES"]),
    f([0, "Fecha"], [1, "Cliente"], [2, "ODC"], [3, "Origen / Descripcion"], [4, "Kg (col M)"], [5, "Utilidad bruta (col AZ)"], [6, "Toneladas"], [7, "idx"], [8, "Proveedor"], [9, "Vendedor"], [10, "Comprador"], [11, "Kg AROCO (col L)"], [12, "Costo transp+selec"], [13, "UTILIDAD NETA"], [14, "Remision (col E)"], [15, "Destino (inventario)"], [16, "Mercado"], [19, "Comision vendedor"], [20, "Comision comprador"]),
    f([0, "13/08/2026"], [1, "LUKER"], [2, "ODC-57"], [3, "ODC 57 DELEITE"], [4, "7.911,40"], [5, "$7.824.728"], [8, "Deleite"], [9, "Alvaro"], [10, "John"], [12, "$0"], [13, "$7.824.728"], [14, "2142"], [15, "CASA LUKER"], [16, "Nacional"], [19, "$140.845"], [20, "$93.897"]),
    f([0, "13/08/2026"], [1, "LUKER"], [2, "ODC-010"], [3, "PADILLA"], [4, "1.066,60"], [5, "- $3.944.526"], [8, "Padilla"], [9, "Alvaro"], [10, "AROCO"], [13, "- $3.944.526"], [15, "CASA LUKER"], [16, "Nacional"], [19, "- $71.001"], [20, "$0"]),
    f(),
  );
  return filas;
}

test("los números de la hoja se leen en formato colombiano, con negativos", () => {
  assert.equal(numero("$13.718.684"), 13_718_684);
  assert.equal(numero("39,37"), 39.37);
  assert.equal(numero("- $3.944.526"), -3_944_526);
  assert.equal(numero(""), 0);
});

test("los porcentajes llegan en tanto por uno", () => {
  assert.equal(porcentaje("3,00%"), 0.03);
  assert.equal(porcentaje("5%"), 0.05);
  assert.equal(porcentaje("60%"), 0.6);
  assert.equal(porcentaje(""), 0);
});

test("las fechas se pasan a ISO y lo que no encaja no se inventa", () => {
  assert.equal(fechaISO("13/08/2026"), "2026-08-13");
  assert.equal(fechaISO("1/8/2026"), "2026-08-01");
  assert.equal(fechaISO("agosto"), null);
  assert.equal(numeroDeMes("AGOSTO"), 8);
  assert.equal(numeroDeMes("Diciembre"), 12);
  assert.equal(numeroDeMes("no es un mes"), null);
});

test("se leen el periodo, los parámetros y el resumen", () => {
  const L = parseLiquidacion(hoja());
  assert.equal(L.anio, 2026);
  assert.equal(L.mes, 8);
  assert.equal(L.mesNombre, "AGOSTO");
  assert.equal(L.umbralSeniorTon, 50);
  assert.equal(L.mercadoPorDefecto, "Nacional");
  assert.equal(L.toneladas, 39.37);
  assert.equal(L.utilidad, 13_718_684);
  assert.equal(L.totalComisiones, 350_446);
  assert.equal(L.shareVendedor, 0.6);
  assert.equal(L.shareComprador, 0.4);
  assert.equal(L.transporteKg, 150);
  assert.equal(L.seleccionKg, 83);
});

test("la liquidación por comercial se corta en TOTAL GENERAL", () => {
  // Debajo del total la hoja sigue teniendo filas que NO son comerciales.
  // Sin el corte, «Esto viene DESPUES del total» entraría como una persona.
  const L = parseLiquidacion(hoja());
  assert.deepEqual(L.lineas.map((l) => l.comercial), ["Alvaro", "AROCO", "John"]);

  const alvaro = L.lineas[0];
  assert.equal(alvaro.tonVenta, 39.37);
  assert.equal(alvaro.nivel, "Junior");
  assert.equal(alvaro.pctTecho, 0.03);
  assert.equal(alvaro.totalPagar, 246_936);

  // AROCO es la casa: mueve toneladas pero no cobra comisión.
  assert.equal(L.lineas[1].totalPagar, 0);
});

test("el detalle de operaciones conserva las utilidades negativas", () => {
  // Una operación en pérdida resta de la comisión del mes. Si el signo se
  // perdiera, la liquidación saldría más alta de lo que corresponde.
  const L = parseLiquidacion(hoja());
  assert.equal(L.operaciones.length, 2);
  const padilla = L.operaciones[1];
  assert.equal(padilla.odc, "ODC-010");
  assert.equal(padilla.utilidadNeta, -3_944_526);
  assert.equal(padilla.comisionVendedor, -71_001);
  assert.equal(padilla.fecha, "2026-08-13");
  assert.equal(padilla.vendedor, "Alvaro");
  assert.equal(padilla.comprador, "AROCO");
});

test("una columna insertada a la izquierda no corrompe nada", () => {
  // Se lee por etiqueta y por encabezado, no por posición.
  const L = parseLiquidacion(hoja({ columnaExtra: true }));
  assert.equal(L.anio, 2026);
  assert.equal(L.lineas.length, 3);
  assert.equal(L.lineas[0].totalPagar, 246_936);
  assert.equal(L.operaciones.length, 2);
});

test("si falta el bloque de liquidación, falla de frente", () => {
  // En silencio guardaría un mes con cero comisiones, que se ve igual que un
  // mes en el que nadie cobró.
  assert.throws(() => parseLiquidacion(hoja({ sinLiquidacion: true })), BloqueFaltante);
});

test("sin periodo legible no se guarda nada", () => {
  assert.throws(() => parseLiquidacion([["1. PARAMETROS"], ["Mes a liquidar", "???"]]), BloqueFaltante);
});
