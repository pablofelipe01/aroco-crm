import { test } from "node:test";
import assert from "node:assert/strict";
import type { CatalogoCampo } from "@/lib/finca/captura-equipos";
import {
  filasDe,
  fechaLarga,
  hora,
  normalizarTelefono,
  proponer,
  resumen,
  type Extraccion,
  type LaborExtraida,
} from "./reporte";

const HOY = "2026-11-27";

const cat: CatalogoCampo = {
  yo: null,
  porOtros: false,
  empleados: [
    { id: "e-william", nombre: "William Osorio" },
    { id: "e-heri", nombre: "Heriberto Pinzón" },
    { id: "e-marta", nombre: "Martha Liliana Pérez" },
  ],
  labores: [
    { id: "l-cosecha", nombre: "Cosecha", categoria: "cosecha", unidad: "mazorcas" },
    { id: "l-desgrane", nombre: "Desgrane", categoria: "poscosecha", unidad: "kg" },
    { id: "l-poda", nombre: "Poda", categoria: "cultivo", unidad: "árboles" },
    { id: "l-riego", nombre: "Riego", categoria: "riego", unidad: null },
    { id: "l-vac", nombre: "Vacaciones", categoria: "ausencia", unidad: null },
  ],
  valvulas: ["1", "1 Frutal", "8", "9", "10"],
  hoy: HOY,
  equipos: [
    { id: "q-motor", codigo: "motor-riego", nombre: "Motor de riego", combustible: "acpm" },
    { id: "q-guadana", codigo: "guadana", nombre: "Guadaña", combustible: "gasolina" },
  ],
};

const labor = (x: Partial<LaborExtraida>): LaborExtraida => ({
  trabajadores: [],
  labor: null,
  valvulas: [],
  sitio: null,
  hora_inicio: null,
  hora_fin: null,
  horas: null,
  cantidad: null,
  sanas: null,
  pasador_monilia: null,
  negras: null,
  observaciones: null,
  ...x,
});

const ext = (x: Partial<Extraccion>): Extraccion => ({
  es_reporte: true,
  fecha: null,
  labores: [],
  usos_equipo: [],
  dudas: [],
  respuesta: null,
  ...x,
});

let n = 0;
const id = () => `id-${++n}`;
const trabajador = { yo: "e-william", porOtros: false };
const supervisor = { yo: null, porOtros: true };

test("teléfono: con o sin +57, con espacios", () => {
  assert.equal(normalizarTelefono("+57 317 430 4429"), "573174304429");
  assert.equal(normalizarTelefono("3174304429"), "573174304429");
  assert.equal(normalizarTelefono("573174304429"), "573174304429");
});

test("hora: 7 → 07:00, 15:30 queda", () => {
  assert.equal(hora("7"), "07:00");
  assert.equal(hora("15:30"), "15:30");
  assert.equal(hora(null), "");
});

test("cosecha completa del trabajador: sin preguntas y una fila suya", () => {
  const p = proponer(
    ext({
      labores: [
        labor({
          labor: "cosecha",
          valvulas: ["8", "9"],
          hora_inicio: "7:00",
          hora_fin: "15:00",
          sanas: 800,
          negras: 20,
          trabajadores: ["Heriberto"],
        }),
      ],
    }),
    cat,
    trabajador,
    HOY,
    id,
  );
  assert.deepEqual(p.preguntas, []);
  assert.equal(p.labores[0].labor, "Cosecha");
  // Un trabajador no anota por otros aunque los nombre.
  assert.deepEqual(p.labores[0].borrador.empleados, ["e-william"]);
  const f = filasDe(p, cat, new Date("2026-11-27T21:00:00Z"));
  assert.equal(f.registros.length, 1);
  assert.equal(f.registros[0].horas, 8);
  assert.equal(f.registros[0].cantidad, 820);
  assert.equal(f.registros[0].empleado_id, "e-william");
});

test("sin horas: pregunta por las horas y no deja guardar", () => {
  const p = proponer(ext({ labores: [labor({ labor: "Poda", cantidad: 40 })] }), cat, trabajador, HOY, id);
  assert.equal(p.preguntas.length, 1);
  assert.match(p.preguntas[0], /horas.*Poda/);
  assert.throws(() => filasDe(p, cat, new Date()));
});

test("labor que no existe: pregunta qué labor", () => {
  const p = proponer(ext({ labores: [labor({ labor: "Bailar", horas: 3 })] }), cat, trabajador, HOY, id);
  assert.ok(p.preguntas.some((q) => /Qué labor/.test(q)));
});

test("válvula fuera del catálogo: pregunta, no la guarda", () => {
  const p = proponer(
    ext({ labores: [labor({ labor: "Riego", valvulas: ["8", "99"], horas: 4 })] }),
    cat,
    trabajador,
    HOY,
    id,
  );
  assert.deepEqual(p.labores[0].borrador.valvulas, ["8"]);
  assert.ok(p.preguntas.some((q) => q.includes("«99»")));
});

test("«1 frutal» se reconoce sin importar mayúsculas", () => {
  const p = proponer(
    ext({ labores: [labor({ labor: "Riego", valvulas: ["1 frutal"], horas: 2 })] }),
    cat,
    trabajador,
    HOY,
    id,
  );
  assert.deepEqual(p.labores[0].borrador.valvulas, ["1 Frutal"]);
  assert.deepEqual(p.preguntas, []);
});

test("supervisor: cuadrilla = una fila por persona, con nombres cortos", () => {
  const p = proponer(
    ext({
      fecha: "2026-11-26",
      labores: [labor({ labor: "Cosecha", trabajadores: ["William", "Heriberto Pinzon"], horas: 7.5, sanas: 500 })],
    }),
    cat,
    supervisor,
    HOY,
    id,
  );
  assert.deepEqual(p.preguntas, []);
  const f = filasDe(p, cat, new Date());
  assert.deepEqual(f.registros.map((r) => r.empleado_id).sort(), ["e-heri", "e-william"]);
  assert.ok(f.registros.every((r) => r.fecha === "2026-11-26" && r.sanas === 500));
  // Ids distintos y estables (los de la propuesta).
  assert.notEqual(f.registros[0].id, f.registros[1].id);
  assert.deepEqual(filasDe(p, cat, new Date()).registros.map((r) => r.id), f.registros.map((r) => r.id));
});

test("supervisor sin decir quién: pregunta quién", () => {
  const p = proponer(ext({ labores: [labor({ labor: "Poda", horas: 4 })] }), cat, supervisor, HOY, id);
  assert.ok(p.preguntas.some((q) => /Quién hizo/.test(q)));
  // Con la lista: si no, quien no es trabajador contesta «yo» y da vueltas.
  assert.ok(p.preguntas.some((q) => q.includes("William Osorio, Heriberto Pinzón")));
});

test("supervisor nombra a alguien que no está: pregunta por él", () => {
  const p = proponer(
    ext({ labores: [labor({ labor: "Poda", horas: 4, trabajadores: ["Pedro"] })] }),
    cat,
    supervisor,
    HOY,
    id,
  );
  assert.ok(p.preguntas.some((q) => q.includes("«Pedro»")));
  assert.ok(!p.preguntas.some((q) => /Quién hizo/.test(q)));
});

test("fecha futura: pregunta el día", () => {
  const p = proponer(
    ext({ fecha: "2026-12-01", labores: [labor({ labor: "Poda", horas: 4 })] }),
    cat,
    trabajador,
    HOY,
    id,
  );
  assert.ok(p.preguntas.some((q) => /qué día/.test(q)));
});

test("motor de riego con válvulas y carga", () => {
  const p = proponer(
    ext({
      usos_equipo: [
        {
          equipo: "motor-riego",
          trabajador: null,
          valvulas: ["9", "10"],
          hora_inicio: "6",
          hora_fin: "11",
          horas: null,
          carga_galones: 5,
          observaciones: null,
        },
      ],
    }),
    cat,
    trabajador,
    HOY,
    id,
  );
  assert.deepEqual(p.preguntas, []);
  const f = filasDe(p, cat, new Date());
  assert.equal(f.usos[0].horas, 5);
  assert.equal(f.usos[0].carga_galones, 5);
  assert.equal(f.usos[0].empleado_id, "e-william");
});

test("mensaje vacío: pregunta qué hizo", () => {
  const p = proponer(ext({}), cat, trabajador, HOY, id);
  assert.equal(p.preguntas.length, 1);
});

test("resumen: cosecha muestra mazorcas; desgrane, kilos A y C", () => {
  const p = proponer(
    ext({
      labores: [
        labor({ labor: "Cosecha", horas: 8, sanas: 800, negras: 20 }),
        labor({ labor: "Desgrane", horas: 2, sanas: 150, negras: 10 }),
      ],
    }),
    cat,
    trabajador,
    HOY,
    id,
  );
  const r = resumen(p, HOY, false);
  assert.match(r, /800 sanas/);
  assert.match(r, /150 kg baba A/);
  assert.match(r, /¿Está bien\?/);
});

test("fecha larga: hoy, ayer y otro día", () => {
  assert.equal(fechaLarga(HOY, HOY), "hoy");
  assert.match(fechaLarga("2026-11-26", HOY), /^ayer/);
  assert.equal(fechaLarga("2026-11-23", HOY), "lunes 23 nov");
});

test("ausencia sin horas: cuenta el jornal de 7,5 h", () => {
  const p = proponer(
    ext({ labores: [labor({ labor: "Vacaciones", trabajadores: ["Martha"] })] }),
    cat,
    supervisor,
    HOY,
    id,
  );
  assert.deepEqual(p.preguntas, []);
  assert.equal(filasDe(p, cat, new Date()).registros[0].horas, 7.5);
});
