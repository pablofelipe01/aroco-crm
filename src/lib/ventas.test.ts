import { test } from "node:test";
import assert from "node:assert/strict";
import { agregarVentas, META_ANUAL_KG, type VentaRow } from "./ventas";
import { numero, parseVentasSheet } from "./ventas/sheet";

const v = (
  fecha: string,
  cliente: string,
  kg: number,
  valor = 0,
  extra: Partial<VentaRow> = {},
): VentaRow => ({
  fecha,
  cliente,
  odc: null,
  kg,
  valor_total: valor,
  bonificacion: 0,
  valor_pagar: valor,
  mercado: "Nacional",
  ...extra,
});

const HOY = new Date(Date.UTC(2026, 5, 30));

test("los montos en formato colombiano se leen bien", () => {
  // La hoja escribe el punto como separador de miles y la coma como decimal,
  // al revés de JavaScript. Leerlos con Number() daría 104 en vez de 104 millones.
  assert.equal(numero("$ 104.868.000"), 104_868_000);
  assert.equal(numero("8739,0"), 8739);
  assert.equal(numero("11863,3"), 11863.3);
  assert.equal(numero("$ 0"), 0);
  assert.equal(numero(""), 0);
});

test("la hoja se lee por nombre de columna, no por posición", () => {
  // Una columna nueva al principio no debe corromper nada.
  const csv = [
    '"Nota","Fecha","Cliente","ODC","KG Vendidos","Valor Total","Bonificación","Valor a Pagar","Mercado"',
    '"x","2026-04-08","LUKER","ODC-32","8939,6","$ 84.926.200","$ 9.511.734","$ 94.437.934","Nacional"',
  ].join("\n");
  const { filas } = parseVentasSheet(csv);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].cliente, "LUKER");
  assert.equal(filas[0].kg, 8939.6);
  assert.equal(filas[0].valor_pagar, 94_437_934);
});

test("las filas sin fecha usable se descartan y se dicen", () => {
  const csv = [
    '"Fecha","Cliente","KG Vendidos","Valor Total","Bonificación","Valor a Pagar"',
    '"2026-04-08","LUKER","100","$ 1.000","$ 0","$ 1.000"',
    '"EMPRESA","","","","",""',
    '"2026-05-08","","50","$ 500","$ 0","$ 500"',
  ].join("\n");
  const { filas, descartadas } = parseVentasSheet(csv);
  assert.equal(filas.length, 1);
  assert.equal(descartadas.length, 2, "la fila basura y la que no tiene cliente");
  assert.match(descartadas[0].motivo, /fecha ilegible/);
});

test("falta una columna obligatoria: la corrida falla en vez de guardar basura", () => {
  const csv = '"Fecha","Cliente"\n"2026-04-08","LUKER"';
  assert.throws(() => parseVentasSheet(csv), /KG Vendidos/);
});

test("agregarVentas separa el año y suma kilos y plata", () => {
  const r = agregarVentas(
    [
      v("2026-04-10", "LUKER", 100, 1_000_000),
      v("2026-05-05", "COCOAWISE", 50, 600_000, { mercado: "Internacional" }),
      v("2025-12-01", "LUKER", 999, 9_000_000),
    ],
    2026,
    HOY,
  );
  assert.equal(r.kgAnio, 150);
  assert.equal(r.valorAnio, 1_600_000);
  assert.deepEqual(r.porCliente, [
    { cliente: "LUKER", kg: 100, valor: 1_000_000 },
    { cliente: "COCOAWISE", kg: 50, valor: 600_000 },
  ]);
  assert.deepEqual(r.porMercado, [
    { mercado: "Nacional", kg: 100, valor: 1_000_000 },
    { mercado: "Internacional", kg: 50, valor: 600_000 },
  ]);
  // El histórico sí incluye el año anterior.
  assert.equal(r.kgHistorico, 1149);
});

test("los envíos sin precio no hunden el precio promedio", () => {
  const r = agregarVentas(
    [
      v("2026-04-10", "LUKER", 100, 1_200_000), // $12.000/kg
      v("2026-04-20", "LUKER", 100, 0), // todavía sin valorar
    ],
    2026,
    HOY,
  );
  assert.equal(r.kgAnio, 200);
  assert.equal(r.kgSinValor, 100);
  assert.equal(r.operacionesSinValor, 1);
  // Sobre los 100 kg que sí tienen precio, no sobre los 200.
  assert.equal(r.precioPromedioKg, 12_000);
});

test("la serie trae los doce meses, con los vacíos incluidos", () => {
  const r = agregarVentas(
    [v("2026-04-10", "LUKER", 100, 1_000), v("2026-06-01", "LUKER", 40, 400)],
    2026,
    HOY,
  );
  assert.equal(r.meses.length, 12);
  assert.equal(r.meses[4].kg, 0, "mayo sin ventas");
  assert.equal(r.meses[4].acumulado, 100, "el acumulado se arrastra");
  assert.equal(r.meses[11].acumulado, 140);
});

test("las dos proyecciones difieren cuando el arranque del año fue flojo", () => {
  const r = agregarVentas(
    [
      v("2026-01-15", "LUKER", 10),
      v("2026-02-15", "LUKER", 10),
      v("2026-04-15", "LUKER", 60_000),
      v("2026-05-15", "LUKER", 60_000),
      v("2026-06-15", "LUKER", 60_000),
    ],
    2026,
    HOY,
  );
  assert.ok(r.proyeccionUltimosMeses > r.proyeccionRitmoAnual);
  assert.equal(r.mesesUsadosEnProyeccion, 3);
});

test("la meta anual son 900 toneladas", () => {
  // Fijada como constante y no escrita en la vista: la meta se usa en el
  // avance, en las dos proyecciones y en la línea del gráfico, y con tres
  // copias basta con olvidar una para que la página se contradiga sola.
  assert.equal(META_ANUAL_KG, 900_000);
});

test("el avance se mide contra la meta", () => {
  const r = agregarVentas([v("2026-04-10", "LUKER", 250_000)], 2026, HOY, 500_000);
  assert.equal(r.avancePct, 50);
});
