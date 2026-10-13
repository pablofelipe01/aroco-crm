import { test } from "node:test";
import assert from "node:assert/strict";
import { equilibrio, porNegocio, type LeadPipeline } from "./equilibrio";

const PESO: Record<string, number> = { Nuevo: 0.1, Negociación: 0.5, Cerrado: 1 };
const peso = (s: string) => PESO[s] ?? 0;

const lead = (p: Partial<LeadPipeline>): LeadPipeline => ({
  negocio: "Venta",
  status: "Nuevo",
  potential_value_cop: 0,
  toneladas: 0,
  ...p,
});

test("ventas y compras se suman por separado y sin los descartados", () => {
  const r = porNegocio(
    [
      lead({ potential_value_cop: 1000, toneladas: 10 }),
      lead({ status: "Negociación", potential_value_cop: "2000", toneladas: "5" }),
      lead({ status: "Descartado", potential_value_cop: 9999, toneladas: 99 }),
      lead({ negocio: "Compra", status: "Cerrado", potential_value_cop: 500, toneladas: 12 }),
    ],
    peso,
  );
  assert.deepEqual(r.Venta, { activos: 2, total: 3000, ponderado: 1100, toneladas: 15 });
  assert.deepEqual(r.Compra, { activos: 1, total: 500, ponderado: 500, toneladas: 12 });
});

test("equilibrio: ±20 % alrededor de 1:1", () => {
  assert.deepEqual(equilibrio(100, 100), { estado: "equilibrado", cobertura: 1 });
  assert.equal(equilibrio(80, 100).estado, "equilibrado");
  assert.equal(equilibrio(79, 100).estado, "falta");
  assert.equal(equilibrio(121, 100).estado, "sobra");
});

test("equilibrio sin ventas: sobra si hay compras, sin datos si no hay nada", () => {
  assert.deepEqual(equilibrio(50, 0), { estado: "sobra", cobertura: null });
  assert.deepEqual(equilibrio(0, 0), { estado: "sin_datos", cobertura: null });
});
