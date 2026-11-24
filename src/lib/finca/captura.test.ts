import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarRegistros,
  borradorVacio,
  fechaColombia,
  horasEntre,
  leerNumero,
  medidaDe,
  sinErrores,
  validar,
  type Borrador,
  type CatalogoCaptura,
} from "./captura";

// Nombres y unidades como están en `finca_labores` de producción.
const cat: CatalogoCaptura = {
  yo: "e-jc",
  porOtros: true,
  empleados: [
    { id: "e-jc", nombre: "Juan Carlos García" },
    { id: "e-wo", nombre: "William Osorio" },
    { id: "e-hp", nombre: "Heriberto Pinzón" },
  ],
  labores: [
    { id: "l-cos", nombre: "Cosecha", categoria: "cosecha", unidad: "mazorcas" },
    { id: "l-des", nombre: "Desgrane", categoria: "poscosecha", unidad: "kg" },
    { id: "l-raj", nombre: "Desgrane rajado de fruta", categoria: "poscosecha", unidad: "kg" },
    { id: "l-pod", nombre: "Poda", categoria: "cultivo", unidad: "árboles" },
    { id: "l-rie", nombre: "Riego", categoria: "riego", unidad: null },
  ],
  valvulas: ["1", "1 Frutal", "2", "8", "9", "10"],
  hoy: "2026-11-20",
};
const HOY = "2026-11-24";

const b = (x: Partial<Borrador>): Borrador => ({ ...borradorVacio(HOY, "e-jc"), ...x });

test("medidaDe: cosecha y desgrane tienen sus columnas; lo demás, cantidad u horas", () => {
  assert.equal(medidaDe(cat.labores[0]), "cosecha");
  assert.equal(medidaDe(cat.labores[1]), "desgrane");
  assert.equal(medidaDe(cat.labores[2]), "desgrane");
  assert.equal(medidaDe(cat.labores[3]), "cantidad");
  assert.equal(medidaDe(cat.labores[4]), "horas");
});

test("leerNumero: coma decimal, punto de miles, vacío y basura", () => {
  assert.equal(leerNumero(""), null);
  assert.equal(leerNumero("7,5"), 7.5);
  assert.equal(leerNumero("7.5"), 7.5);
  assert.equal(leerNumero("1.200"), 1200);
  assert.equal(leerNumero("1.200,5"), 1200.5);
  assert.equal(leerNumero(" 300 "), 300);
  assert.ok(Number.isNaN(leerNumero("abc")));
  assert.ok(Number.isNaN(leerNumero("-3")));
});

test("horasEntre: mismo día, fin después del inicio", () => {
  assert.equal(horasEntre("06:00", "13:30"), 7.5);
  assert.equal(horasEntre("6:00", "14:20"), 8.33);
  assert.equal(horasEntre("13:00", "06:00"), null);
  assert.equal(horasEntre("06:00", "06:00"), null);
  assert.equal(horasEntre("25:00", "26:00"), null);
});

test("fechaColombia: a las 9 p. m. del 24 en Bogotá ya es 25 en UTC", () => {
  assert.equal(fechaColombia(new Date("2026-11-25T02:00:00Z")), "2026-11-24");
  assert.equal(fechaColombia(new Date("2026-11-25T05:00:00Z")), "2026-11-25");
});

test("validar: el borrador vacío pide labor y horas", () => {
  const e = validar(b({}), cat, HOY);
  assert.ok(e.laborId);
  assert.ok(e.horas);
  assert.equal(e.empleados, undefined);
});

test("validar: fecha futura y fecha muy vieja, contra el reloj del teléfono", () => {
  // El catálogo dice 20-nov pero el teléfono está en el 24: manda el teléfono.
  assert.equal(validar(b({ laborId: "l-rie", horas: "4", fecha: "2026-11-24" }), cat, HOY).fecha, undefined);
  assert.ok(validar(b({ laborId: "l-rie", horas: "4", fecha: "2026-11-25" }), cat, HOY).fecha);
  assert.ok(validar(b({ laborId: "l-rie", horas: "4", fecha: "2026-10-01" }), cat, HOY).fecha);
  assert.equal(validar(b({ laborId: "l-rie", horas: "4", fecha: "2026-10-10" }), cat, HOY).fecha, undefined);
});

test("validar: sin permiso por otros, solo lo propio", () => {
  const solo = { ...cat, porOtros: false };
  assert.ok(validar(b({ laborId: "l-rie", horas: "4", empleados: ["e-wo"] }), solo, HOY).empleados);
  assert.ok(sinErrores(validar(b({ laborId: "l-rie", horas: "4" }), solo, HOY)));
});

test("validar: horas por inicio y fin, y tope", () => {
  assert.ok(validar(b({ laborId: "l-rie", horaInicio: "14:00", horaFin: "06:00" }), cat, HOY).horaFin);
  assert.ok(validar(b({ laborId: "l-rie", horaInicio: "06:00" }), cat, HOY).horaFin);
  assert.ok(validar(b({ laborId: "l-rie", horas: "80" }), cat, HOY).horas);
  assert.ok(sinErrores(validar(b({ laborId: "l-rie", horaInicio: "06:00", horaFin: "13:30" }), cat, HOY)));
});

test("validar: válvula fuera del catálogo (Vivero es sitio, no válvula)", () => {
  assert.ok(validar(b({ laborId: "l-rie", horas: "2", valvulas: ["Vivero"] }), cat, HOY).valvulas);
});

test("armarRegistros: cuadrilla de cosecha → una fila por persona con la misma cifra", () => {
  let n = 0;
  const filas = armarRegistros(
    b({
      laborId: "l-cos",
      empleados: ["e-jc", "e-wo", "e-wo"],
      valvulas: ["8", "9"],
      horaInicio: "06:00",
      horaFin: "13:30",
      sanas: "280",
      pasador: "",
      negras: "20",
      observaciones: "  lote alto ",
    }),
    cat,
    new Date("2026-11-24T18:00:00Z"),
    () => `id-${++n}`,
  );
  assert.equal(filas.length, 2, "el repetido no duplica");
  assert.deepEqual(
    filas.map((f) => [f.id, f.empleado_id]),
    [
      ["id-1", "e-jc"],
      ["id-2", "e-wo"],
    ],
  );
  const f = filas[0];
  assert.equal(f.horas, 7.5);
  assert.equal(f.sanas, 280);
  assert.equal(f.pasador_monilia, null);
  assert.equal(f.negras, 20);
  assert.equal(f.cantidad, 300, "mazorcas totales = sanas + pasador + negras");
  assert.equal(f.unidad, "mazorcas");
  assert.equal(f.observaciones, "lote alto");
  assert.equal(f.registrado_en, "2026-11-24T18:00:00.000Z");
});

test("armarRegistros: desgrane guarda kg A en sanas y kg C en negras", () => {
  const [f] = armarRegistros(
    b({ laborId: "l-des", horas: "7,5", sanas: "120,5", negras: "15", pasador: "99" }),
    cat,
    new Date(),
    () => "x",
  );
  assert.equal(f.sanas, 120.5);
  assert.equal(f.negras, 15);
  assert.equal(f.pasador_monilia, null, "en desgrane no hay pasador");
  assert.equal(f.cantidad, 135.5);
  assert.equal(f.unidad, "kg");
});

test("armarRegistros: labor por cantidad y labor solo por horas", () => {
  const [poda] = armarRegistros(b({ laborId: "l-pod", horas: "6", cantidad: "1.200", sanas: "5" }), cat, new Date(), () => "a");
  assert.equal(poda.cantidad, 1200);
  assert.equal(poda.sanas, null);
  const [riego] = armarRegistros(b({ laborId: "l-rie", horas: "4", cantidad: "9" }), cat, new Date(), () => "b");
  assert.equal(riego.cantidad, null);
  assert.equal(riego.unidad, null);
  assert.equal(riego.horas, 4);
});
