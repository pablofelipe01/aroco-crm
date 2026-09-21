import { test } from "node:test";
import assert from "node:assert/strict";
import {
  armarResumenDiario,
  armarResumenSemanal,
  clasificarDiario,
  diaSemana,
  diasEntre,
  hayAlgoQueContar,
  resumirSemana,
  sumarDias,
  type TareaResumen,
} from "./resumenes";

const HOY = "2026-09-21"; // lunes
const AHORA = new Date("2026-09-21T12:00:00Z");

function t(id: string, vence: string | null, asignadaEl = "2026-09-01T12:00:00Z"): TareaResumen {
  return { id, nombre: `Tarea ${id}`, vence, asignadaEl };
}

test("aritmética de fechas sin zona horaria", () => {
  assert.equal(sumarDias("2026-09-28", 7), "2026-10-05");
  assert.equal(sumarDias("2026-03-01", -1), "2026-02-28");
  assert.equal(diasEntre("2026-09-14", "2026-09-21"), 7);
  assert.equal(diaSemana(HOY), 1);
});

test("cada tarea cae en una sola sección, y lo urgente gana", () => {
  const c = clasificarDiario(
    [
      t("vieja", "2026-09-10"),
      t("ayer", "2026-09-20"),
      t("hoy", HOY, "2026-09-21T11:00:00Z"), // nueva, pero vence hoy
      t("jueves", "2026-09-24"),
      t("lejos", "2026-10-15"),
      t("nueva", null, "2026-09-19T15:00:00Z"),
      t("vieja-sin-fecha", null),
    ],
    HOY,
    "2026-09-18T12:00:00Z",
  );
  assert.deepEqual(c.vencidas.map((x) => x.id), ["vieja", "ayer"]);
  assert.deepEqual(c.hoy.map((x) => x.id), ["hoy"]);
  assert.deepEqual(c.semana.map((x) => x.id), ["jueves"]);
  assert.deepEqual(c.nuevas.map((x) => x.id), ["nueva"]);
  assert.equal(c.abiertas, 7);
});

test("sin nada urgente ni nuevo, no hay resumen", () => {
  const c = clasificarDiario([t("lejos", "2026-12-01"), t("sin", null)], HOY, "2026-09-18T12:00:00Z");
  assert.equal(hayAlgoQueContar(c), false);
});

test("asunto y texto del diario", () => {
  const c = clasificarDiario([t("a", "2026-09-16"), t("b", HOY), t("c", HOY)], HOY, "2026-09-18T12:00:00Z");
  const r = armarResumenDiario({ nombre: "Luis Ernesto Barrios", clasificacion: c, hoy: HOY }, "https://x/", AHORA);
  assert.equal(r.asunto, "Tus tareas de hoy: 1 vencida, 2 vencen hoy");
  assert.match(r.texto, /^Hola, Luis\. Tienes 3 tareas abiertas\./);
  assert.match(r.texto, /Tarea a — Venció hace 5 días \(16-sep\)/);
  assert.match(r.texto, /Ver mis tareas: https:\/\/x\/tareas$/);
});

test("el diario corta cada sección en 10 y dice cuántas faltan", () => {
  const muchas = Array.from({ length: 13 }, (_, i) => t(`v${i}`, "2026-09-01"));
  const c = clasificarDiario(muchas, HOY, "2026-09-18T12:00:00Z");
  const r = armarResumenDiario({ nombre: "Ana", clasificacion: c, hoy: HOY }, "https://x", AHORA);
  assert.match(r.texto, /y 3 más/);
  assert.match(r.html, /y 3 más/);
});

test("el semanal ordena por vencidas y deja fuera a quien no tiene nada", () => {
  const filas = resumirSemana(
    [
      { nombre: "Sin nada", abiertas: [], cerradasSemana: [] },
      { nombre: "Al día", abiertas: [t("x", "2026-10-01")], cerradasSemana: ["c1", "c2", "c3", "c4"] },
      { nombre: "Atrasada", abiertas: [t("a", "2026-09-01"), t("b", "2026-09-15"), t("c", null)], cerradasSemana: ["c5"] },
    ],
    HOY,
  );
  assert.deepEqual(filas.map((f) => f.nombre), ["Atrasada", "Al día"]);
  assert.deepEqual(filas[0], {
    nombre: "Atrasada",
    abiertas: 3,
    vencidas: 2,
    sinFecha: 1,
    cerradas: 1,
    atrasadas: [t("a", "2026-09-01"), t("b", "2026-09-15")],
    ids: { abiertas: ["a", "b", "c"], vencidas: ["a", "b"], cerradas: ["c5"] },
  });
});

test("asunto del semanal y escape de nombres", () => {
  const filas = resumirSemana(
    [{ nombre: "Ana <b>", abiertas: [t("a", "2026-09-01")], cerradasSemana: ["c1", "c2"] }],
    HOY,
  );
  const r = armarResumenSemanal({ nombre: "Nicolás Rodríguez", filas, hoy: HOY }, "https://x", AHORA);
  assert.equal(r.asunto, "Tu equipo esta semana: 1 vencida, 2 cerradas");
  assert.ok(r.html.includes("Ana &lt;b&gt;"));
  assert.ok(!r.html.includes("Ana <b>"));
});

test("los totales del área no cuentan dos veces una tarea compartida", () => {
  const compartida = t("x", "2026-09-01");
  const filas = resumirSemana(
    [
      { nombre: "John Muñoz", abiertas: [compartida, t("y", null)], cerradasSemana: ["c1"] },
      { nombre: "John Saenz", abiertas: [compartida], cerradasSemana: ["c1"] },
    ],
    HOY,
  );
  const r = armarResumenSemanal({ nombre: "Nicolás", filas, hoy: HOY }, "https://x", AHORA);
  assert.equal(r.asunto, "Tu equipo esta semana: 1 vencida, 1 cerrada");
  assert.match(r.texto, /Tu equipo tiene 2 tareas abiertas; 1 está vencida/);
  // Dos John: cada bloque lleva el nombre completo.
  assert.match(r.texto, /Lo más atrasado de John Muñoz:/);
  assert.match(r.texto, /Lo más atrasado de John Saenz:/);
  assert.match(r.texto, /- John Saenz: 1 abierta, 1 vencida, 0 sin fecha, 1 cerrada/);
});
