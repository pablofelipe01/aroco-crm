import { test } from "node:test";
import assert from "node:assert/strict";
import {
  costoPorHora,
  horasPorValvula,
  resumenEquipos,
  resumenMensual,
  type CompraVista,
  type UsoVista,
} from "./combustible";

// Cifras de agosto de 2026 en la planilla real: 36 gal comprados, 108 gal
// cargados al motor y 28,7 h de riego. El caso que el tablero debe señalar.
const compras: CompraVista[] = [
  { fecha: "2026-08-26", combustible: "acpm", galones: 36, valor: 406800 },
  { fecha: "2026-08-11", combustible: "gasolina", galones: 3.137, valor: 50000 },
  { fecha: "2026-09-01", combustible: "acpm", galones: 30.991, valor: 350200 },
  // Consignación sin galones: suma plata, no entra al precio promedio.
  { fecha: "2026-09-11", combustible: "acpm", galones: null, valor: 500000 },
];
const usos: UsoVista[] = [
  { fecha: "2026-08-22", equipo: "motor-riego", valvulas: ["8", "14", "15"], horas: 4.67, carga: null },
  { fecha: "2026-08-23", equipo: "motor-riego", valvulas: ["8", "14", "15"], horas: 3, carga: 18 },
  { fecha: "2026-08-23", equipo: "motor-riego", valvulas: ["17"], horas: 4, carga: null },
  { fecha: "2026-08-24", equipo: "motor-riego", valvulas: [], horas: null, carga: 90 },
  { fecha: "2026-08-10", equipo: "guadana", valvulas: ["9"], horas: 8, carga: null },
  { fecha: "2026-09-12", equipo: "motor-riego", valvulas: ["20", "21"], horas: 4, carga: 4 },
];

test("resumenMensual: carga vs. esperado y precio promedio", () => {
  const [ago, sep] = resumenMensual(compras, usos, 0.97);
  assert.equal(ago.mes, "2026-08");
  assert.equal(ago.acpmGal, 36);
  assert.equal(ago.acpmValor, 406800);
  assert.equal(ago.acpmPrecio, 11300);
  assert.equal(ago.gasolinaGal, 3.137);
  assert.equal(ago.horasRiego, 11.67, "la guadaña no es riego");
  assert.equal(ago.cargaMotor, 108);
  assert.ok(Math.abs(ago.esperadoMotor - 11.3199) < 1e-3);
  assert.ok(ago.desvio! > 8, "se cargó nueve veces lo esperado");

  assert.equal(sep.acpmValor, 850200);
  assert.equal(sep.acpmGal, 30.991);
  assert.equal(sep.acpmPrecio, 350200 / 30.991, "la compra sin galones no entra al precio");
  assert.ok(Math.abs(sep.desvio! - (4 - 3.88) / 3.88) < 1e-9);
});

test("resumenMensual: mes sin horas no tiene desvío", () => {
  const [m] = resumenMensual([{ fecha: "2026-01-08", combustible: "acpm", galones: 45, valor: 500000 }], [], 0.97);
  assert.equal(m.desvio, null);
  assert.equal(m.horasRiego, 0);
});

test("horasPorValvula: el grupo riega a la vez, cada válvula lleva las horas completas", () => {
  const m = horasPorValvula(usos);
  assert.equal(m.get("8"), 7.67);
  assert.equal(m.get("14"), 7.67);
  assert.equal(m.get("17"), 4);
  assert.equal(m.get("9"), undefined, "la guadaña no cuenta como riego");
});

test("resumenEquipos y costoPorHora", () => {
  const r = resumenEquipos(
    [
      { codigo: "motor-riego", nombre: "Motor", combustible: "acpm", consumoGalH: 0.97 },
      { codigo: "guadana", nombre: "Guadaña", combustible: "gasolina", consumoGalH: 0.0793 },
      { codigo: "planta", nombre: "Planta", combustible: "gasolina", consumoGalH: null },
    ],
    usos,
  );
  assert.equal(r[0].usos, 4, "el día sin horas no es un uso");
  assert.equal(r[0].horas, 15.67);
  assert.ok(Math.abs(r[1].esperadoGal! - 8 * 0.0793) < 1e-9);
  assert.equal(r[2].esperadoGal, null);
  const meses = resumenMensual(compras, usos, 0.97);
  assert.equal(costoPorHora(meses), (406800 + 850200) / 15.67);
  assert.equal(costoPorHora([]), null);
});
