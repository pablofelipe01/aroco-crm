import { test } from "node:test";
import assert from "node:assert/strict";
import { conNota, miembrosPresentes, reasignarAusentes, type Miembro } from "./ausentes";

// Recorte del organigrama real (team_members.manager_id).
const equipo: Miembro[] = [
  { id: "alvaro", name: "Álvaro Acosta", profile_id: "p-alvaro", manager_id: null },
  { id: "luis", name: "Luis Ernesto Barrios", profile_id: "p-luis", manager_id: "alvaro" },
  { id: "milena", name: "Milena Soto", profile_id: "p-milena", manager_id: "luis" },
  { id: "df", name: "D. F. Fernández", profile_id: null, manager_id: "luis" },
  { id: "heiner", name: "Heiner Sierra", profile_id: null, manager_id: "df" },
  { id: "nicolas", name: "Nicolás Rodríguez", profile_id: "p-nicolas", manager_id: "alvaro" },
  { id: "david", name: "David Bermúdez", profile_id: "p-david", manager_id: "nicolas" },
  { id: "john", name: "John Muñoz", profile_id: "p-john", manager_id: "nicolas" },
];

test("asistentes por cuenta y por nombre", () => {
  const p = miembrosPresentes(
    [
      { name: "Nicolás Rodríguez", profile_id: "p-nicolas" },
      { name: "Heiner Sierra Bedoya", profile_id: null },
      { name: "Andrea Rodríguez", profile_id: null },
      { name: "Milena", profile_id: null },
    ],
    equipo,
  );
  assert.deepEqual([...p].sort(), ["heiner", "nicolas"]);
});

test("el presente conserva su tarea", () => {
  const r = reasignarAusentes(["david"], new Set(["david", "nicolas"]), equipo);
  assert.deepEqual(r, { assignees: ["david"], remitidas: [] });
});

test("la tarea del ausente pasa a su jefe presente", () => {
  const r = reasignarAusentes(["john"], new Set(["nicolas", "david"]), equipo);
  assert.deepEqual(r.assignees, ["nicolas"]);
  assert.deepEqual(r.remitidas, [{ ausente: "John Muñoz", jefe: "Nicolás Rodríguez" }]);
});

test("si el jefe directo tampoco estuvo, sube al primero que sí", () => {
  // Comité Comercial: Milena y Luis no estaban; Álvaro sí.
  const r = reasignarAusentes(["milena"], new Set(["alvaro", "nicolas"]), equipo);
  assert.deepEqual(r.assignees, ["alvaro"]);
});

test("si nadie de la rama estuvo, queda con el jefe directo", () => {
  const r = reasignarAusentes(["milena"], new Set(["nicolas"]), equipo);
  assert.deepEqual(r.assignees, ["luis"]);
});

test("la raíz del organigrama conserva su tarea aunque no esté", () => {
  const r = reasignarAusentes(["alvaro"], new Set(["nicolas"]), equipo);
  assert.deepEqual(r, { assignees: ["alvaro"], remitidas: [] });
});

test("sin asistentes conocidos no se toca nada", () => {
  const r = reasignarAusentes(["john", "milena"], new Set(), equipo);
  assert.deepEqual(r, { assignees: ["john", "milena"], remitidas: [] });
});

test("el jefe no queda repetido si ya era responsable", () => {
  const r = reasignarAusentes(["nicolas", "john", "david"], new Set(["nicolas"]), equipo);
  assert.deepEqual(r.assignees, ["nicolas"]);
  assert.equal(r.remitidas.length, 2);
});

test("la nota nombra a los ausentes", () => {
  const r = reasignarAusentes(["john", "david"], new Set(["nicolas"]), equipo);
  assert.equal(
    conNota("Enviar la oferta.", r.remitidas),
    "Para John Muñoz y David Bermúdez, que no estuvieron en la reunión: mencionársela.\n\nEnviar la oferta.",
  );
  assert.equal(conNota(null, []), null);
});
