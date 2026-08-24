import { test } from "node:test";
import assert from "node:assert/strict";
import { construirPosicion, idLote, type LoteRow } from "./posicion";

const lote = (o: Partial<LoteRow>): LoteRow => ({
  code: "LOTE-1",
  remision: null,
  recepcion: null,
  odc: null,
  entry_date: "2026-08-21",
  origin: "META",
  qty_in_kg: 0,
  qty_out_kg: 0,
  purchase_price_cop_kg: null,
  quality: null,
  ...o,
});

const HOY = new Date(Date.UTC(2026, 7, 24));

test("el id del lote no depende de la posición en la hoja", () => {
  // CacaoQ deduplica por número de fila: insertar una fila en el medio le corre
  // la identidad a todas las de abajo. El id va atado a la identidad real.
  const a = idLote({ code: "COL-MET-GRA-210826", remision: "24", recepcion: "2414" });
  const b = idLote({ code: "COL-MET-GRA-210826", remision: "24", recepcion: "2415" });
  assert.notEqual(a, b, "dos recepciones del mismo lote son lotes distintos");
  assert.equal(a, idLote({ code: "COL-MET-GRA-210826", remision: "24", recepcion: "2414" }));
});

test("las unidades salen nombradas y convertidas", () => {
  const { lotes } = construirPosicion([lote({ qty_in_kg: 4499.8 })], HOY);
  assert.equal(lotes[0].kg_disponible, 4499.8);
  // Que la conversión venga hecha es una conversión menos donde equivocarse:
  // el campo `tonnes` de CacaoQ recibía kilos y daba un error de 1000×.
  assert.equal(lotes[0].toneladas, 4.4998);
});

test("un lote sin saldo se reporta como entregado", () => {
  const { lotes } = construirPosicion(
    [lote({ qty_in_kg: 1000, qty_out_kg: 1000 }), lote({ qty_in_kg: 1000, qty_out_kg: 400 })],
    HOY,
  );
  assert.equal(lotes[0].estado, "entregado");
  assert.equal(lotes[1].estado, "bodega");
  assert.equal(lotes[1].kg_disponible, 600);
});

test("el costo promedio pondera por kilos, no por lotes", () => {
  const { totales } = construirPosicion(
    [
      lote({ qty_in_kg: 900, purchase_price_cop_kg: 10_000 }),
      lote({ qty_in_kg: 100, purchase_price_cop_kg: 20_000 }),
    ],
    HOY,
  );
  // Promedio simple daría 15.000; ponderado son 11.000.
  assert.equal(totales.costo_promedio_cop_kg, 11_000);
  assert.equal(totales.valor_inventario_cop, 900 * 10_000 + 100 * 20_000);
});

test("los kilos sin precio se declaran en vez de valer cero", () => {
  const { totales } = construirPosicion(
    [
      lote({ qty_in_kg: 1000, purchase_price_cop_kg: 13_000 }),
      lote({ qty_in_kg: 500, purchase_price_cop_kg: null }),
    ],
    HOY,
  );
  assert.equal(totales.kg_disponible, 1500);
  assert.equal(totales.kg_sin_precio, 500);
  // El promedio sale de los 1.000 kg que sí tienen precio: incluir los otros
  // como cero lo hundiría a 8.667 e inventaría una baja de costo.
  assert.equal(totales.costo_promedio_cop_kg, 13_000);
});

test("los totales solo cuentan lo que queda en bodega", () => {
  const { totales } = construirPosicion(
    [lote({ qty_in_kg: 5000, qty_out_kg: 5000 }), lote({ qty_in_kg: 1000, qty_out_kg: 0 })],
    HOY,
  );
  assert.equal(totales.lotes, 2);
  assert.equal(totales.lotes_con_saldo, 1);
  assert.equal(totales.kg_ingresado, 6000, "lo ingresado es histórico");
  assert.equal(totales.kg_disponible, 1000, "lo disponible es lo que queda");
});
