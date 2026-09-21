import { test } from "node:test";
import assert from "node:assert/strict";
import { emparejarNombre, type Candidato } from "./nombres";

// Nombres tal como están en `profiles` y `team_members`.
const cuentas: Candidato[] = [
  { profileId: "fernando", nombre: "Fernando Mejía Paz" },
  { profileId: "john", nombre: "John Saenz" },
  { profileId: "angela", nombre: "Angela Acosta" },
  { profileId: "angela", nombre: "Ángela María Acosta" },
  { profileId: "juancarlos", nombre: "Juan Carlos García" },
  { profileId: "nicolas", nombre: "Nicolás Rodríguez" },
  { profileId: "milena", nombre: "Milena Soto" },
];

test("nombre largo del acta contra el corto de la cuenta", () => {
  assert.equal(emparejarNombre("Fernando José Mejía Paz", cuentas), "fernando");
  assert.equal(emparejarNombre("John Edinson Saenz", cuentas), "john");
  assert.equal(emparejarNombre("John Edinson Sáenz", cuentas), "john");
  assert.equal(emparejarNombre("Ángela María Acosta", cuentas), "angela");
  assert.equal(emparejarNombre("angela acosta", cuentas), "angela");
});

test("nombre corto del acta contra el largo de la cuenta", () => {
  assert.equal(emparejarNombre("Fernando Paz", cuentas), "fernando");
});

test("un solo nombre o sin apellido no alcanza", () => {
  assert.equal(emparejarNombre("Nicolás", cuentas), null);
  assert.equal(emparejarNombre("Milena", cuentas), null);
  assert.equal(emparejarNombre("Juan Carlos", cuentas), null);
});

test("lo que va entre paréntesis no cuenta", () => {
  assert.equal(emparejarNombre("Juan Carlos (Finca El Milagro)", cuentas), null);
});

test("sin subcadenas: Ana no es Mariana", () => {
  const c: Candidato[] = [{ profileId: "mariana", nombre: "Mariana Gómez" }];
  assert.equal(emparejarNombre("Ana Gómez", c), null);
});

test("dos cuentas que encajan: ninguna", () => {
  const c: Candidato[] = [
    { profileId: "a", nombre: "John Saenz" },
    { profileId: "b", nombre: "John Edinson Saenz Ruiz Saenz" },
  ];
  assert.equal(emparejarNombre("John Edinson Saenz", c), null);
});

test("el exacto gana aunque haya sueltos", () => {
  const c: Candidato[] = [
    { profileId: "a", nombre: "John Saenz" },
    { profileId: "b", nombre: "John Edinson Saenz" },
  ];
  assert.equal(emparejarNombre("John Saenz", c), "a");
});

test("otros no se ligan a nadie", () => {
  assert.equal(emparejarNombre("David Bermúdez", cuentas), null);
  assert.equal(emparejarNombre("Participantes del CISCA", cuentas), null);
});
