import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarCompra,
  armarUso,
  compraABorrador,
  compraVacia,
  completarCompra,
  usoABorrador,
  usoVacio,
  validarCompra,
  validarUso,
  type CatalogoCampo,
} from "./captura-equipos";

const HOY = "2026-11-24";
const cat: CatalogoCampo = {
  yo: null,
  porOtros: true,
  empleados: [
    { id: "e-jc", nombre: "Juan Carlos García" },
    { id: "e-wo", nombre: "William Osorio" },
  ],
  labores: [],
  valvulas: ["1", "1 Frutal", "2", "3", "8", "9", "10", "14", "15"],
  hoy: HOY,
  equipos: [
    { id: "q-motor", codigo: "motor-riego", nombre: "Motor de riego", combustible: "acpm" },
    { id: "q-guad", codigo: "guadana", nombre: "Guadaña", combustible: "gasolina" },
  ],
};

test("usoVacio: arranca en el motor de riego; sin equipos en el catálogo, vacío", () => {
  assert.equal(usoVacio(HOY, cat).equipoId, "q-motor");
  assert.equal(usoVacio(HOY, { ...cat, equipos: undefined }).equipoId, "");
  // Un trabajador enlazado que no anota por otros queda puesto.
  assert.equal(usoVacio(HOY, { ...cat, porOtros: false, yo: "e-wo" }).empleadoId, "e-wo");
});

test("validarUso: horas, o carga, o las dos", () => {
  const b = { ...usoVacio(HOY, cat), valvulas: ["9", "10"] };
  assert.ok(validarUso(b, cat, HOY).horas, "sin horas ni carga");
  assert.deepEqual(validarUso({ ...b, horaInicio: "06:00", horaFin: "09:00" }, cat, HOY), {});
  assert.deepEqual(validarUso({ ...b, carga: "12" }, cat, HOY), {}, "tanquear sin regar se anota");
  assert.ok(validarUso({ ...b, horaInicio: "09:00", horaFin: "06:00" }, cat, HOY).horaFin);
  assert.ok(validarUso({ ...b, horas: "20" }, cat, HOY).horas);
  assert.ok(validarUso({ ...b, carga: "500" }, cat, HOY).carga);
});

test("validarUso: catálogo viejo sin equipos, válvula inventada y trabajador ajeno", () => {
  const b = { ...usoVacio(HOY, cat), horas: "3" };
  assert.ok(validarUso(b, { ...cat, equipos: undefined }, HOY).equipoId);
  assert.ok(validarUso({ ...b, valvulas: ["Vivero"] }, cat, HOY).valvulas);
  const solo = { ...cat, porOtros: false, yo: "e-wo" };
  assert.ok(validarUso({ ...b, empleadoId: "e-jc" }, solo, HOY).empleadoId);
  assert.ok(validarUso({ ...b, empleadoId: "" }, solo, HOY).empleadoId);
  assert.deepEqual(validarUso({ ...b, empleadoId: "e-wo" }, solo, HOY), {});
});

test("armarUso y vuelta al borrador", () => {
  const u = armarUso(
    { ...usoVacio(HOY, cat), valvulas: ["9", "10"], horaInicio: "06:00", horaFin: "09:30", carga: "12,5", observaciones: " ok " },
    new Date("2026-11-24T13:00:00Z"),
    "u1",
  );
  assert.equal(u.horas, 3.5);
  assert.equal(u.carga_galones, 12.5);
  assert.equal(u.equipo_id, "q-motor");
  assert.equal(u.empleado_id, null);
  assert.equal(u.observaciones, "ok");
  const b = usoABorrador(u);
  assert.equal(b.carga, "12,5");
  assert.equal(b.horas, "");
  assert.equal(b.horaFin, "09:30");
  // Solo carga: sin horas.
  const t = armarUso({ ...usoVacio(HOY, cat), carga: "5" }, new Date(), "u2");
  assert.equal(t.horas, null);
  assert.equal(t.carga_galones, 5);
});

test("validarCompra: valor o galones; números colombianos", () => {
  const b = compraVacia(HOY);
  assert.ok(validarCompra(b, HOY).valor);
  assert.deepEqual(validarCompra({ ...b, valor: "406.800" }, HOY), {});
  assert.ok(validarCompra({ ...b, galones: "abc" }, HOY).galones);
  assert.ok(validarCompra({ ...b, valor: "1000", fecha: "2026-11-25" }, HOY).fecha);
});

test("completarCompra: el que falte sale de los otros dos", () => {
  assert.deepEqual(completarCompra(36, 11300, null), { galones: 36, precio: 11300, valor: 406800 });
  assert.deepEqual(completarCompra(null, 11300, 406800), { galones: 36, precio: 11300, valor: 406800 });
  assert.deepEqual(completarCompra(36, null, 406800), { galones: 36, precio: 11300, valor: 406800 });
  // Consignación sin galones ni precio: se deja como viene.
  assert.deepEqual(completarCompra(null, null, 500000), { galones: null, precio: null, valor: 500000 });
});

test("armarCompra y vuelta al borrador", () => {
  const c = armarCompra(
    { ...compraVacia(HOY), galones: "36", precio: "11.300", recibo: " 56840 " },
    new Date("2026-11-24T13:00:00Z"),
    "c1",
  );
  assert.equal(c.valor, 406800);
  assert.equal(c.precio_galon, 11300);
  assert.equal(c.recibo, "56840");
  assert.equal(c.combustible, "acpm");
  assert.equal(c.destino, "Sistema de riego");
  const b = compraABorrador(c);
  assert.equal(b.valor, "406800");
  assert.equal(b.galones, "36");
});
