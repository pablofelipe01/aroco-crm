import { test } from "node:test";
import assert from "node:assert/strict";
import {
  leerDesgraneMayo,
  leerFecha,
  leerFilaBache,
  leerFilaRegistro,
  normalizarEmpleado,
  normalizarLabor,
  parsearValvulas,
} from "./hoja";

/*
 * Las filas de prueba son copias de filas reales del «REPORTE DIARIO 2026
 * FINCA» leídas con `sheet_to_json(..., { header: 1, raw: true })`: seriales
 * de Excel para fechas y fracciones de día para horas.
 */

/** Fila 9 de la hoja: poda del 2-ene, que la hoja guardó con año 2025. */
const PODA = [
  5,
  1,
  "#NUM!",
  2,
  "Vie",
  45659.000185,
  "Heriberto Pinzon",
  "Poda",
  21,
  93,
  null,
  null,
  93,
  "Arboles",
  0.25,
  0.5833333333,
  480,
  8,
  1,
  "93 Plantas",
];

test("fila real: año corregido, horas recalculadas, unidad normalizada", () => {
  const r = leerFilaRegistro(PODA, 9);
  assert.ok(r);
  assert.equal(r.fecha, "2026-01-02");
  assert.ok(r.dudas.some((d) => d.includes("2025→2026")));
  assert.equal(r.empleado, "Heriberto Pinzón");
  assert.equal(r.labor.nombre, "Poda");
  assert.deepEqual(r.valvulas, ["21"]);
  assert.equal(r.horaInicio, "06:00");
  assert.equal(r.horaFin, "14:00");
  assert.equal(r.horas, 8);
  assert.equal(r.cantidad, 93);
  assert.equal(r.unidad, "árboles");
  assert.equal(r.observaciones, "93 Plantas");
});

test("fila 83: 80 horas no se aceptan", () => {
  const r = leerFilaRegistro(
    [
      80,
      1,
      1,
      13,
      "Mar",
      46035.000185,
      "Juan Carlos Garcia ",
      "Lectura de Tenciometros",
      null,
      null,
      null,
      null,
      0,
      null,
      0.25,
      3.3333333333,
      4440,
      74,
    ],
    83,
  );
  assert.ok(r);
  assert.equal(r.horas, null);
  assert.ok(r.dudas.some((d) => d.startsWith("horas imposibles")));
  assert.equal(r.labor.nombre, "Lectura de tensiómetros");
});

test("encabezado y filas vacías no son registros", () => {
  assert.equal(
    leerFilaRegistro(
      [
        "Cons",
        "Mes",
        "No. Sem",
        "DIA",
        "DIA SEM",
        "FECHA",
        "NOMBRE",
        "Actividad",
      ],
      3,
    ),
    null,
  );
  assert.equal(leerFilaRegistro([null, null, null], 2000), null);
});

test("las 24 escrituras quedan en 7 personas", () => {
  const escrituras = [
    "Juan Carlos Garcia",
    "juan Carlos Garcia",
    "Juan Carlos Gracia",
    "Juan Carlos Garcuia",
    "Juan  Carlos Garcia",
    "Heriberto Pinzon",
    "Heriberto Pinson",
    "Heriberto Pinszon",
    "Heriberto pinzon",
    "William Osorio",
    "william Osorio",
    "Willian Osorio",
    "WilliaM Osorio",
    "Willianm Osorio",
    "Luis Henrique Hernandez",
    "luis Enrique Hernandez",
    "Katherine Ortiz",
    "Katherine Ortiz Ospina",
    "Katherine Ortiz Ospino",
    "katherine Ortiz",
    "katherne Ortiz Ospino",
    "Lilibeth Sanhes Florian",
    "Martha Liliana Perez",
    "Martha Liliana perez",
  ];
  const nombres = new Set(escrituras.map((e) => normalizarEmpleado(e)));
  assert.ok([...nombres].every((n) => n.conocido));
  assert.equal(new Set([...nombres].map((n) => n.nombre)).size, 7);
});

test("labores: variantes al mismo nombre; ausencias aparte", () => {
  assert.equal(normalizarLabor("poda").labor.nombre, "Poda");
  assert.equal(
    normalizarLabor("Desgrane Rajadode Fruta").labor.nombre,
    "Desgrane rajado de fruta",
  );
  assert.equal(
    normalizarLabor("Desagrane Rajado de Fruta").labor.nombre,
    "Desgrane rajado de fruta",
  );
  assert.equal(
    normalizarLabor("riego con Valde").labor.nombre,
    "Riego con balde",
  );
  assert.equal(
    normalizarLabor("Contril Quimico Malezas").labor.nombre,
    "Control químico de malezas",
  );
  assert.equal(normalizarLabor("Mantenimiento riego").labor.categoria, "riego");
  assert.equal(
    normalizarLabor("incapacitada por accidente").labor.categoria,
    "ausencia",
  );
  assert.equal(
    normalizarLabor("Incapacitadfo por enfermedad").labor.nombre,
    "Incapacidad",
  );
  // Lo agrupado conserva el texto original; lo que solo cambia de tildes, no.
  assert.equal(
    normalizarLabor("Atencion Visita  Belgica").detalle,
    "Atencion Visita Belgica",
  );
  assert.equal(normalizarLabor("Riego").detalle, null);
  assert.equal(normalizarLabor("Algo nuevo").conocida, false);
});

test("válvulas escritas a mano", () => {
  assert.deepEqual(parsearValvulas("3;- 8 - 21").valvulas, ["3", "8", "21"]);
  assert.deepEqual(parsearValvulas("9_ 10").valvulas, ["9", "10"]);
  assert.deepEqual(parsearValvulas(17).valvulas, ["17"]);
  assert.deepEqual(parsearValvulas("1 Frutal").valvulas, ["1 Frutal"]);
  assert.deepEqual(parsearValvulas("1-2-3-1fr- 20 - 21").valvulas, [
    "1",
    "1 Frutal",
    "2",
    "3",
    "20",
    "21",
  ]);
  assert.deepEqual(parsearValvulas("8 a 21").valvulas, [
    "8",
    "9",
    "10",
    "14",
    "15",
    "16",
    "17",
    "18",
    "19",
    "20",
    "21",
  ]);
  assert.deepEqual(parsearValvulas("1 a la 21").valvulas.length, 14);
  assert.deepEqual(parsearValvulas("16-!8_19").valvulas, ["16", "18", "19"]);
  assert.equal(parsearValvulas("todas Valbulas").valvulas.length, 15);
});

test("sitios que no son válvulas", () => {
  assert.deepEqual(parsearValvulas("Quinta"), {
    valvulas: [],
    sitio: "Quinta",
    duda: null,
  });
  assert.equal(parsearValvulas("Vivero").sitio, "Vivero");
});

test("válvulas que no se pueden leer quedan en duda", () => {
  const cuatro = parsearValvulas("1, 2, 4");
  assert.deepEqual(cuatro.valvulas, ["1", "2"]);
  assert.match(cuatro.duda ?? "", /fuera de la lista \(4\)/);
  // Excel convirtió el texto en fecha (46248) y en hora (0,1395).
  assert.match(parsearValvulas(46248).duda ?? "", /ilegible/);
  assert.match(parsearValvulas(0.13958333333333334).duda ?? "", /ilegible/);
});

test("fechas como texto", () => {
  assert.deepEqual(leerFecha("15//8/26"), {
    fecha: "2026-08-15",
    duda: "fecha escrita como texto «15//8/26»",
  });
  assert.equal(leerFecha("21/1/206").fecha, "2026-01-21");
  assert.equal(leerFecha("11/05726").fecha, "2026-05-11");
  assert.equal(leerFecha("basura").fecha, null);
});

test("bache real 1798: el secado salió con año 2025", () => {
  const b = leerFilaBache([
    1798,
    "1 A 19",
    "Finca",
    "A",
    46030.000185,
    51.35,
    45672.000185,
    35.7,
    17.05,
    46053.000185,
    0.332,
    46063.000185,
    17.05,
    "Llevado por la señora Angela",
  ]);
  assert.ok(b);
  assert.equal(b.calidad, "A");
  assert.equal(b.fechaInicio, "2026-01-08");
  assert.equal(b.fechaSalidaSecado, "2026-01-15");
  assert.equal(b.pesoBaba, 51.35);
  assert.equal(b.pesoFinal, 17.05);
  assert.ok(b.dudas.some((d) => d.startsWith("salida de secado")));
});

test("baches numerados sin datos se saltan", () => {
  assert.equal(
    leerFilaBache([
      1908,
      null,
      "Finca",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "#DIV/0!",
    ]),
    null,
  );
});

test("desgrane de mayo: el día está en el año", () => {
  const filas = [
    ["DESGRASNE en Baba"],
    ["Mes ", 38838, 39203, "masy 9", 47239, null],
    ["Cacao A", 410.8, 368.1, 361.4, 117.95, 1258.25],
    ["Cacao C", 28.1, 30.25, null, null, 58.35],
  ];
  const d = leerDesgraneMayo(filas);
  assert.deepEqual(
    d.map((x) => x.fecha),
    ["2026-05-06", "2026-05-07", "2026-05-09", "2026-05-29"],
  );
  assert.equal(d[0].kgA, 410.8);
  assert.equal(d[2].kgC, null);
  assert.ok(d[2].duda);
});
