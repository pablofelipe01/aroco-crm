import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparAcopios,
  claveVereda,
  numero,
  numeroDeRuta,
  parseHojaRuta,
  ColumnaFaltante,
} from "./hoja";

/** Encabezado real de la hoja de ruta, con las columnas bancarias incluidas. */
const ENC = [
  "Fecha", "Lote", "Cédula", "Tipo productor", "Productor", "Ruta", "Vereda",
  "Calidad", "Cédula Titular de la cuenta", "Nombre titular de la cuenta",
  "Banco", "# De cuenta Bancaria", "Tipo de Cuenta", "Kg primera",
  "Precio base", "Bonificación por calidad", "Precio kg primera",
  "Total primera", "Kg segunda", "Precio kg segunda", "Total segunda",
  "TOTAL VENTA", "Teléfono productor", "Correo productor",
];

const fila = (extra: Partial<Record<string, string>> = {}) => {
  const base: Record<string, string> = {
    Fecha: "2026-09-03",
    Lote: "26-75",
    "Cédula": "25375352",
    "Tipo productor": "Productor ROC",
    Productor: "ALBA MARIA CARABALI CASTILLO",
    Ruta: "RUTA 3",
    Vereda: "AGUA AZUL",
    Calidad: "Primera",
    "Cédula Titular de la cuenta": "52247555",
    "Nombre titular de la cuenta": "MAVIA EDITH DIAZ OSP",
    Banco: "NEQUI",
    "# De cuenta Bancaria": "3172343623",
    "Tipo de Cuenta": "Ahorros",
    "Kg primera": "25,5",
    "Precio base": "$ 11.000",
    "Bonificación por calidad": "$ 200",
    "Precio kg primera": "$ 11.200",
    "Total primera": "$ 285.600",
    "Kg segunda": "",
    "Precio kg segunda": "",
    "Total segunda": "",
    "TOTAL VENTA": "$ 285.600",
    ...extra,
  };
  return ENC.map((c) => base[c] ?? "");
};

test("los montos en formato colombiano se leen bien", () => {
  assert.equal(numero("$ 104.868.000"), 104_868_000);
  assert.equal(numero("25,5"), 25.5);
  assert.equal(numero(""), 0);
});

test("el número de ruta se saca de cualquier escritura", () => {
  assert.equal(numeroDeRuta("RUTA 3"), 3);
  assert.equal(numeroDeRuta("Ruta #3"), 3);
  assert.equal(numeroDeRuta("ruta 4 (Caloto - Santander)"), 4);
  // El nombre del lote de inventario trae la ruta dentro.
  assert.equal(numeroDeRuta("CISCA ruta #1 (Padilla - Miranda)"), 1);
  assert.equal(numeroDeRuta("sin ruta"), null);
  assert.equal(numeroDeRuta(""), null);
});

test("las veredas escritas de varias formas caen en la misma clave", () => {
  // Los cuatro pares reales de la hoja del 3-sep. Sin unificarlos el mapa
  // pintaría el mismo sitio dos veces y repartiría entre ellos unos kilos que
  // son de uno solo.
  assert.equal(claveVereda("BARRAGAN"), claveVereda("BARRAGÁN"));
  assert.equal(claveVereda("BOCA DEL PALO"), claveVereda("BOCAS DEL PALO"));
  assert.equal(claveVereda("MINGO"), claveVereda("VEREDA MINGO"));
  assert.equal(
    claveVereda("CAPONERA PUEBLO NUEVO"),
    claveVereda("PUEBLO NUEVO CAPONERA"),
  );
  // A esta se le fue la barra espaciadora, y también tiene que unificarse.
  assert.equal(claveVereda("BARRIO TERRONAL"), claveVereda("BARRIOTERRONAL"));
});

test("veredas distintas NO se unifican", () => {
  // El singular aproximado no puede llegar a fusionar sitios de verdad
  // distintos: eso sería peor que dejarlos separados.
  assert.notEqual(claveVereda("CHALO"), claveVereda("CABITO"));
  assert.notEqual(claveVereda("AGUA AZUL"), claveVereda("PERICO NEGRO"));
  assert.notEqual(claveVereda("CAPONERA"), claveVereda("CAPONERA PUEBLO NUEVO"));
});

test("se leen las entregas y NO se traen los datos bancarios", () => {
  const { entregas, descartadas } = parseHojaRuta([ENC, fila()]);
  assert.equal(descartadas.length, 0);
  assert.equal(entregas.length, 1);

  const e = entregas[0];
  assert.equal(e.productor, "ALBA MARIA CARABALI CASTILLO");
  assert.equal(e.ruta, 3);
  assert.equal(e.kgPrimera, 25.5);
  assert.equal(e.precioKgPrimera, 11_200);
  assert.equal(e.totalVenta, 285_600);

  // Ninguna clave del resultado puede oler a banco: para trazar un grano hasta
  // su finca no hace falta saber a qué cuenta se le pagó.
  const claves = Object.keys(e).join(" ").toLowerCase();
  for (const prohibida of ["banco", "cuenta", "titular", "telefono", "correo"]) {
    assert.ok(!claves.includes(prohibida), `no debería traer ${prohibida}`);
  }
});

test("la cédula se guarda solo con dígitos", () => {
  // En la hoja aparece con puntos a veces y sin ellos otras; si no se limpia,
  // el mismo productor cuenta dos veces.
  const { entregas } = parseHojaRuta([ENC, fila({ "Cédula": "25.375.352" })]);
  assert.equal(entregas[0].cedula, "25375352");
});

test("las filas que no se pueden usar se descartan diciendo por qué", () => {
  const { entregas, descartadas } = parseHojaRuta([
    ENC,
    fila(),
    fila({ Fecha: "EMPRESA" }),
    fila({ Ruta: "" }),
    fila({ "Kg primera": "0", "Kg segunda": "" }),
    fila({ Productor: "" }),
  ]);
  assert.equal(entregas.length, 1);
  assert.equal(descartadas.length, 4);
  assert.match(descartadas[0].motivo, /fecha ilegible/);
  assert.match(descartadas[1].motivo, /ruta ilegible/);
  assert.match(descartadas[2].motivo, /sin kilos/);
  assert.match(descartadas[3].motivo, /sin productor/);
  // El número de fila es el de la hoja, para poder ir a corregirla.
  assert.deepEqual(
    descartadas.map((d) => d.fila),
    [3, 4, 5, 6],
  );
});

test("una columna que falta hace fallar de frente, no en silencio", () => {
  const sinRuta = ENC.filter((c) => c !== "Ruta");
  assert.throws(() => parseHojaRuta([sinRuta, []]), ColumnaFaltante);
});

test("una columna nueva al principio no corrompe nada", () => {
  // Se lee por encabezado, no por posición.
  const conExtra = ["Nota", ...ENC];
  const { entregas } = parseHojaRuta([conExtra, ["x", ...fila()]]);
  assert.equal(entregas[0].productor, "ALBA MARIA CARABALI CASTILLO");
  assert.equal(entregas[0].kgPrimera, 25.5);
});

test("el acopio agrupa por fecha y ruta", () => {
  const { entregas } = parseHojaRuta([
    ENC,
    fila({ "Cédula": "1", "Kg primera": "10" }),
    fila({ "Cédula": "2", "Kg primera": "5", "Kg segunda": "2", Vereda: "CHALO" }),
    // Mismo productor otra vez: cuenta una sola vez.
    fila({ "Cédula": "1", "Kg primera": "3", Vereda: "AGUA AZUL" }),
    // Otra ruta el mismo día: acopio aparte.
    fila({ "Cédula": "9", Ruta: "RUTA 1", "Kg primera": "7" }),
  ]);
  const acopios = agruparAcopios(entregas);
  assert.equal(acopios.length, 2);

  const r3 = acopios.find((a) => a.ruta === 3)!;
  assert.equal(r3.kgPrimera, 18);
  assert.equal(r3.kgSegunda, 2);
  assert.equal(r3.kgTotal, 20);
  assert.equal(r3.productores, 2, "la cédula repetida no cuenta dos veces");
  assert.equal(r3.veredas, 2, "AGUA AZUL y CHALO");

  const r1 = acopios.find((a) => a.ruta === 1)!;
  assert.equal(r1.kgTotal, 7);
});
