import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizarBalance, normalizarPnl, normalizarPosicion, diasHabiles } from "./stonex";

test("el balance sale del consolidado, no del primero que aparezca", () => {
  // Forma real del estado del 21-ago-2026: tres bloques, uno por tipo de cuenta.
  const b = normalizarBalance({
    USD_SEGREGATED_U1: { beginning_balance: 100, ending_balance: 100, total_equity: 100 },
    CONV_SEG_TOTAL: { beginning_balance: 200, ending_balance: 200, total_equity: 200 },
    TOTAL_CONVERTED: { beginning_balance: 509.2, ending_balance: 509.2, total_equity: 509.2 },
  });
  // Tomar el primero daría 100 — una cifra parcial presentada como el total.
  assert.equal(b.total_equity, 509.2);
});

test("un balance ausente da nulos, no ceros", () => {
  const b = normalizarBalance(undefined);
  // Cero afirma que la cuenta está en cero; null dice que no se sabe.
  assert.equal(b.total_equity, null);
  assert.equal(b.initial_margin, null);
});

test("el P&L se lee de summary.realized_profit_loss por moneda", () => {
  const p = normalizarPnl({ realized_profit_loss: { USD: { mtd: 0, ytd: -27290 } } });
  assert.deepEqual(p, { mtd: 0, ytd: -27290, moneda: "USD" });
});

test("sin P&L en el estado, cero explícito", () => {
  assert.deepEqual(normalizarPnl({}), { mtd: 0, ytd: 0, moneda: "USD" });
});

test("una posición acepta snake_case y camelCase", () => {
  const a = normalizarPosicion({ long_qty: 3, option_type: "CALL", contract_month: "DEC26", strike: 9000, market_value: -1500 }, "2026-09-11");
  assert.equal(a.long_qty, 3);
  assert.equal(a.option_type, "CALL");
  assert.equal(a.dr_cr, "DR", "valor de mercado negativo es débito");

  const b = normalizarPosicion({ longQty: "2", optionType: "PUT", marketValue: "1,200" }, "2026-09-11");
  assert.equal(b.long_qty, 2);
  assert.equal(b.market_value, 1200, "los miles con coma se limpian");
  assert.equal(b.dr_cr, "CR");
});

test("una posición en el vocabulario del MCP se traduce, no se pierde", () => {
  // Es el fallo que dejó invisibles las posiciones de Álvaro durante meses:
  // el MCP manda `qty`/`direction`/`contract` y el CRM leía `long_qty`/
  // `contract_month`, así que todo entraba en cero.
  const p = normalizarPosicion(
    {
      trade_date: "9/11/6", card: "4420", qty: 1, direction: "long",
      contract: "DEC 26 ICE COCOA", open_price: 60.3, close_price: 59.61,
      ote_amount: 690, ote_sign: "loss",
    },
    "2026-09-11",
  );
  assert.equal(p.long_qty, 1);
  assert.equal(p.contract_month, "DEC26");
  assert.equal(p.trade_date, "2026-09-11", "y no 2006");
  assert.equal(p.settle_price, 5961, "la escala se comprueba contra el flotante");
  assert.equal(p.market_value, -690);
});

test("los días hábiles saltan fines de semana", () => {
  // 2026-08-24 es lunes: hacia atrás van viernes, jueves, miércoles.
  assert.deepEqual(diasHabiles(new Date(Date.UTC(2026, 7, 24)), 4), [
    "2026-08-24", "2026-08-21", "2026-08-20", "2026-08-19",
  ]);
});
