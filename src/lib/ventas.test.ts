import { test } from "node:test";
import assert from "node:assert/strict";
import { agregarVentas, clienteCanonico, esVenta, type DespachoVenta } from "./ventas";

const d = (
  fecha: string | null,
  destino: string | null,
  kg: number,
  clasif: Partial<DespachoVenta> = {},
): DespachoVenta => ({
  dispatch_date: fecha,
  destination: destino,
  qty_kg: kg,
  qty_premium_kg: 0,
  qty_corriente_kg: 0,
  qty_corriente_c_kg: 0,
  qty_organico_kg: 0,
  ...clasif,
});

test("las salidas de merma y muestras no son ventas", () => {
  assert.equal(esVenta("CASA LUKER"), true);
  assert.equal(esVenta("MUESTRAS"), false);
  assert.equal(esVenta("MERMA POR MOVIMIENTO"), false);
  assert.equal(esVenta("MERMA POR MOVOMIENTO"), false); // errata real de la hoja
  assert.equal(esVenta("SELECCION PASILLA"), false);
  assert.equal(esVenta(null), false);
});

test("clienteCanonico unifica las variantes del mismo cliente", () => {
  for (const v of ["CASA LUKER", "CASALUKER", "CASA  LUKER", "CASA LIKER", "LUKER"]) {
    assert.equal(clienteCanonico(v), "Casa Luker", v);
  }
  assert.equal(clienteCanonico("NAL. CHOCOLATES"), "Nacional de Chocolates");
  assert.equal(clienteCanonico("NACIONAL"), "Nacional de Chocolates");
  assert.equal(clienteCanonico("TIEMPO CHICOLATE"), "Tiempo de Chocolate");
  // Un cliente que no está en la lista se respeta tal cual.
  assert.equal(clienteCanonico("UNICONF"), "UNICONF");
});

test("agregarVentas separa ventas, merma y despachos sin fecha", () => {
  const v = agregarVentas(
    [
      d("2026-04-10", "CASA LUKER", 100),
      d("2026-04-20", "CASALUKER", 50),
      d("2026-05-05", "UNICONF", 30),
      d("2026-05-06", "MUESTRAS", 5),
      d(null, "CASA LUKER", 7),
      d("2025-12-01", "CASA LUKER", 999), // otro año
    ],
    2026,
    new Date(Date.UTC(2026, 5, 30)),
  );

  assert.equal(v.kgAnio, 180, "solo 2026 y solo ventas con fecha");
  assert.equal(v.kgNoVenta, 5);
  assert.equal(v.kgSinFecha, 7);
  // Las dos grafías de Casa Luker suman en una sola fila.
  assert.deepEqual(v.porCliente, [
    { cliente: "Casa Luker", kg: 150 },
    { cliente: "UNICONF", kg: 30 },
  ]);
});

test("la serie trae los doce meses, con los vacíos incluidos", () => {
  const v = agregarVentas(
    [d("2026-04-10", "CASA LUKER", 100), d("2026-06-01", "UNICONF", 40)],
    2026,
    new Date(Date.UTC(2026, 5, 30)),
  );
  assert.equal(v.meses.length, 12);
  // Un mes sin despachos es información: en 2026 no hubo salidas en marzo.
  assert.equal(v.meses[2].kg, 0);
  assert.equal(v.meses[3].kg, 100);
  assert.equal(v.meses[4].acumulado, 100, "el acumulado se arrastra en los meses vacíos");
  assert.equal(v.meses[11].acumulado, 140);
});

test("las dos proyecciones difieren cuando el arranque del año fue flojo", () => {
  // Enero y febrero casi en cero, luego tres meses fuertes: el ritmo del año
  // castiga por el arranque; el promedio reciente refleja la capacidad actual.
  const v = agregarVentas(
    [
      d("2026-01-15", "CASA LUKER", 10),
      d("2026-02-15", "CASA LUKER", 10),
      d("2026-04-15", "CASA LUKER", 60_000),
      d("2026-05-15", "CASA LUKER", 60_000),
      d("2026-06-15", "CASA LUKER", 60_000),
    ],
    2026,
    new Date(Date.UTC(2026, 5, 30)),
  );
  assert.equal(v.kgAnio, 180_020);
  assert.ok(
    v.proyeccionUltimosMeses > v.proyeccionRitmoAnual,
    "el promedio reciente debe proyectar más que el ritmo del año",
  );
  assert.equal(v.mesesUsadosEnProyeccion, 3);
});

test("los cuatro grados se reportan aunque den cero", () => {
  const v = agregarVentas(
    [d("2026-04-10", "CASA LUKER", 100, { qty_premium_kg: 100 })],
    2026,
    new Date(Date.UTC(2026, 5, 30)),
  );
  // Ocultar los ceros hacía leer «Premium 100 %» como si la app no conociera
  // los otros grados. Aparecen los cuatro.
  assert.deepEqual(
    v.porClasificacion.map((c) => c.tipo),
    ["Premium", "Corriente", "Corriente C", "Orgánico"],
  );
});

test("los kilos sin grado se nombran en vez de desaparecer", () => {
  // Un despacho creado a mano en el CRM sin elegir clasificación: kilos en
  // qty_kg y las cuatro columnas de grado en cero.
  const v = agregarVentas(
    [
      d("2026-04-10", "CASA LUKER", 100, { qty_premium_kg: 100 }),
      d("2026-04-11", "UNICONF", 40),
    ],
    2026,
    new Date(Date.UTC(2026, 5, 30)),
  );
  assert.equal(v.kgAnio, 140);
  const sinClasificar = v.porClasificacion.find((c) => c.tipo === "Sin clasificar");
  assert.equal(sinClasificar?.kg, 40, "los 40 kg sin grado deben quedar visibles");
  // El desglose tiene que cuadrar con el total del año, no con un subtotal.
  assert.equal(
    v.porClasificacion.reduce((s, c) => s + c.kg, 0),
    v.kgAnio,
  );
});

test("el avance se mide contra la meta", () => {
  const v = agregarVentas(
    [d("2026-04-10", "CASA LUKER", 250_000)],
    2026,
    new Date(Date.UTC(2026, 5, 30)),
    500_000,
  );
  assert.equal(v.avancePct, 50);
});
