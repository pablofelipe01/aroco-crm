import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acciones,
  filaDeUso,
  lunesDe,
  modulosDelEquipo,
  ordenarFilas,
  semanasDelPeriodo,
  semanaVacia,
  usoCrmSchema,
  type PersonaUso,
} from "./uso";

const persona = (over: Partial<PersonaUso> = {}): PersonaUso => ({
  id: "p",
  nombre: "Alvaro Acosta",
  area: "Dirección",
  rol: "admin",
  ultimo_login: null,
  ultimo_uso: null,
  abiertas: 0,
  vencidas: 0,
  sin_fecha: 0,
  cerradas_30d: 0,
  dias_30d: 0,
  tiene_tareas: true,
  semanas: [],
  modulos: [],
  ...over,
});

test("lunesDe lleva cualquier día a su lunes", () => {
  assert.equal(lunesDe("2026-09-29"), "2026-09-28"); // martes
  assert.equal(lunesDe("2026-09-28"), "2026-09-28"); // lunes
  assert.equal(lunesDe("2026-10-04"), "2026-09-28"); // domingo
  assert.equal(lunesDe("2026-01-01"), "2025-12-29"); // cruza el año
});

test("semanasDelPeriodo cuenta los lunes hasta la semana de hoy", () => {
  assert.deepEqual(semanasDelPeriodo("2026-09-14", "2026-09-29"), [
    "2026-09-14",
    "2026-09-21",
    "2026-09-28",
  ]);
});

test("acciones no cuenta dos veces una tarea cerrada", () => {
  const s = { ...semanaVacia("2026-09-28"), movidas: 3, cerradas: 2, notas: 1 };
  assert.equal(acciones(s), 4);
});

test("filaDeUso rellena las semanas sin actividad", () => {
  const lunes = semanasDelPeriodo("2026-09-07", "2026-09-29");
  const fila = filaDeUso(
    persona({
      semanas: [
        { ...semanaVacia("2026-09-14"), minutos: 120 },
        { ...semanaVacia("2026-09-28"), minutos: 90, dias: 2, movidas: 2 },
      ],
    }),
    lunes,
  );
  assert.equal(fila.serie.length, 4);
  assert.equal(fila.serie[0].minutos, 0);
  assert.equal(fila.actual.dias, 2);
  assert.equal(fila.accionesSemana, 2);
  assert.equal(fila.estado, "activo");
});

test("un login esta semana cuenta como activo aunque aún no haya minutos", () => {
  // El tiempo empieza a medirse con 0097: sin esto, todos saldrían inactivos
  // la primera semana aunque hayan entrado.
  const lunes = semanasDelPeriodo("2026-09-21", "2026-09-29");
  const fila = filaDeUso(persona({ ultimo_login: "2026-09-28T16:11:23+00:00" }), lunes);
  assert.equal(fila.estado, "activo");
  assert.deepEqual(fila.ultimo, { cuando: "2026-09-28T16:11:23+00:00", soloLogin: true });
});

test("estado: poco si solo usó la semana pasada, inactivo si nada", () => {
  const lunes = semanasDelPeriodo("2026-09-21", "2026-09-29");
  const poco = filaDeUso(
    persona({ semanas: [{ ...semanaVacia("2026-09-21"), notas: 3 }] }),
    lunes,
  );
  assert.equal(poco.estado, "poco");
  assert.equal(filaDeUso(persona(), lunes).estado, "inactivo");
});

test("ordenarFilas pone primero a los activos y luego por días, no por horas", () => {
  const lunes = semanasDelPeriodo("2026-09-21", "2026-09-29");
  const f = (id: string, dias: number, minutos: number) =>
    filaDeUso(
      persona({
        id,
        nombre: id,
        semanas: dias ? [{ ...semanaVacia("2026-09-28"), dias, minutos }] : [],
      }),
      lunes,
    );
  // «integracion» trabaja por Claude: muchos días, casi sin minutos.
  const orden = ordenarFilas([f("nada", 0, 0), f("horas", 1, 300), f("integracion", 4, 5)]).map(
    (x) => x.persona.id,
  );
  assert.deepEqual(orden, ["integracion", "horas", "nada"]);
});

test("a igual de días desempatan los días de 30 y las tareas cerradas", () => {
  const lunes = semanasDelPeriodo("2026-09-21", "2026-09-29");
  const f = (id: string, dias_30d: number, cerradas_30d: number) =>
    filaDeUso(
      persona({ id, nombre: id, dias_30d, cerradas_30d, semanas: [{ ...semanaVacia("2026-09-28"), dias: 2 }] }),
      lunes,
    );
  const orden = ordenarFilas([f("a", 3, 1), f("b", 3, 9), f("c", 5, 0)]).map((x) => x.persona.id);
  assert.deepEqual(orden, ["c", "b", "a"]);
});

test("usoCrmSchema tolera la respuesta previa a 0102, sin dias_30d", () => {
  const d = usoCrmSchema.parse({
    desde: "2026-09-28",
    hoy: "2026-10-08",
    medicion_desde: null,
    eventos_desde: null,
    personas: [{ ...persona(), dias_30d: undefined }],
  });
  assert.equal(d.personas[0].dias_30d, 0);
});

test("modulosDelEquipo suma por módulo entre personas", () => {
  const r = modulosDelEquipo([
    persona({ modulos: [{ modulo: "tareas", minutos: 30 }, { modulo: "comercial", minutos: 5 }] }),
    persona({ modulos: [{ modulo: "tareas", minutos: 10 }] }),
  ]);
  assert.deepEqual(r, [
    { modulo: "tareas", minutos: 40 },
    { modulo: "comercial", minutos: 5 },
  ]);
});

test("usoCrmSchema acepta lo que devuelve uso_crm() de verdad", () => {
  // Fila literal de la función en la base el 2026-09-29.
  const real = {
    desde: "2026-08-10",
    hoy: "2026-09-29",
    medicion_desde: null,
    eventos_desde: null,
    personas: [
      {
        id: "9d2af860-8cf1-4faa-be35-0fbac8627f95",
        rol: "admin",
        area: "Comercial",
        nombre: "Nicolas Rodriguez",
        modulos: [],
        semanas: [
          { dias: 0, leads: 17, notas: 0, semana: "2026-08-24", creadas: 0, minutos: 0, movidas: 0, cerradas: 0, gestiones: 17 },
        ],
        abiertas: 42,
        vencidas: 0,
        sin_fecha: 0,
        ultimo_uso: null,
        cerradas_30d: 86,
        tiene_tareas: true,
        ultimo_login: "2026-09-28T16:11:23.459043+00:00",
      },
    ],
  };
  const d = usoCrmSchema.parse(real);
  assert.equal(d.personas[0].semanas[0].leads, 17);
  assert.equal(d.personas[0].abiertas, 42);
});
