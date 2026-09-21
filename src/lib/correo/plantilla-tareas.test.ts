import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparAsignaciones,
  armarCorreoTareas,
  fechaCorta,
  type Asignacion,
} from "./plantilla-tareas";

const HOY = new Date("2026-09-21T15:00:00Z");
const COMITE = { titulo: "Comité Financiero", fecha: "2026-09-14" };

function fila(p: Partial<Asignacion> & { id: string }): Asignacion {
  return {
    miembroId: "luis",
    correo: "luis.barrios@aroco.co",
    nombre: "Luis Ernesto Barrios",
    actaId: "acta-1",
    acta: COMITE,
    asignadoPor: null,
    tarea: { id: `t-${p.id}`, nombre: `Tarea ${p.id}`, descripcion: null, vence: null },
    ...p,
  };
}

test("un correo por persona y por acta", () => {
  const grupos = agruparAsignaciones([
    fila({ id: "1" }),
    fila({ id: "2" }),
    fila({ id: "3", miembroId: "angela", correo: "angela.acosta@aroco.co", nombre: "Ángela" }),
    fila({ id: "4", actaId: null, acta: null }),
  ]);
  assert.equal(grupos.length, 3);
  assert.deepEqual(grupos[0]!.ids, ["1", "2"]);
  assert.deepEqual(grupos[0]!.tareas.map((t) => t.nombre), ["Tarea 1", "Tarea 2"]);
  assert.deepEqual(grupos[2]!.ids, ["4"]);
});

test("si asignaron varias personas, el correo no nombra a ninguna", () => {
  const [g] = agruparAsignaciones([
    fila({ id: "1", actaId: null, acta: null, asignadoPor: "Pablo" }),
    fila({ id: "2", actaId: null, acta: null, asignadoPor: "Nicolás" }),
  ]);
  assert.equal(g!.asignadoPor, null);
  assert.match(armarCorreoTareas(g!, "https://x", HOY).texto, /^Hola, Luis\. Te asignaron estas 2 tareas:/);
});

test("asunto de un acta con varias tareas", () => {
  const [g] = agruparAsignaciones([fila({ id: "1" }), fila({ id: "2" }), fila({ id: "3" })]);
  const c = armarCorreoTareas(g!, "https://aroco-crm.vercel.app", HOY);
  assert.equal(c.asunto, "Te quedaron 3 tareas del acta «Comité Financiero» del 14-sep");
  assert.match(c.texto, /Ver mis tareas: https:\/\/aroco-crm\.vercel\.app\/tareas$/);
});

test("una tarea suelta enlaza directo a ella y nombra a quien la asignó", () => {
  const [g] = agruparAsignaciones([
    fila({ id: "1", actaId: null, acta: null, asignadoPor: "Pablo Felipe" }),
  ]);
  const c = armarCorreoTareas(g!, "https://aroco-crm.vercel.app/", HOY);
  assert.equal(c.asunto, "Te asignaron una tarea: Tarea 1");
  assert.match(c.texto, /Pablo Felipe te asignó esta tarea:/);
  assert.match(c.texto, /Abrir la tarea: https:\/\/aroco-crm\.vercel\.app\/tareas\?tarea=t-1$/);
});

test("el HTML escapa lo que viene de la tarea", () => {
  const [g] = agruparAsignaciones([
    fila({
      id: "1",
      tarea: { id: "t1", nombre: "Revisar <script>alert(1)</script>", descripcion: "A & B", vence: null },
    }),
  ]);
  const { html } = armarCorreoTareas(g!, "https://x", HOY);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("A &amp; B"));
});

test("fechaCorta omite el año actual y lo pone si es otro", () => {
  assert.equal(fechaCorta("2026-09-24", HOY), "24-sep");
  assert.equal(fechaCorta("2027-01-05", HOY), "5-ene-2027");
  assert.equal(fechaCorta(null, HOY), null);
});
