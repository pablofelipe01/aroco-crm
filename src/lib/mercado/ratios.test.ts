import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parsearRatios,
  numero,
  referenciaEuropa,
  brechaVsEuropa,
} from "./ratios";

/** Trozo real del reporte del 27-ago-2026. */
const REAL: string[][] = [
  ["Cocoa Product Ratios"],
  ["Augu st 27th, 2026"],
  ["Ratio", "PRICE"],
  ["Liquor", "Incoterms", "Futures", "20-Aug", "27-Aug", "Change", "GBP", "EUR", "USD"],
  ["Europe Liquid Liquor", "ex fctry", "LDN", "1.41", "1.41", "-", "£ 6,324", "€ 7,377", "$ 8,595"],
  ["Africa Boxed Liquor", "ExW", "NY", "1.52", "1.52", "-", "£ 6,817", "€ 7,953", "$ 9,266"],
  ["Butter", "Incoterms", "Futures"],
  ["Europe Liquid", "ex fctry", "LDN", "1.75", "1.74", "(0.01)", "£ 7,804", "€ 9,104", "$ 10,607"],
  ["Powder"],
  ["Europe Powder", "ex fctry", "LDN", "1.19", "1.30", "0.12", "£ 5,015", "€ 5,850", "$ 6,816"],
  ["Ivory Coast Cake", "FOB", "LDN", "0.99", "0.96", "(0.03)", "£ 4,286", "€ 5,000", "$ 5,826"],
  ["Combined"],
  ["Europe", "ExW", "LDN", "2.94", "3.04", "0.11"],
  ["Ivory Coast", "FOB", "LDN", "2.55", "2.52", "(0.03)"],
  ["FUTURES", "EXCHANGE RATES"],
  ["20-Aug", "27-Aug", "Change", "20-Aug", "27-Aug", "Change"],
  ["NY-DEC", "$6,064", "$6,173", "$109", "EURUSD", "$ 1.1671", "$ 1.1651", "-0.0020"],
  ["LDN-DEC", "£4,336", "£4,485", "£149", "GBPUSD", "$ 1.3625", "$ 1.3592", "-0.0033"],
  ["ARBITRAGE", "-$156", "-$77", "$79", "EURGBP", "£ 0.8566", "£ 0.8572", "0.0006"],
  ["Source: CRA, Reuters"],
];

const { ratios, futuros, ignoradas } = parsearRatios(REAL);

test("los paréntesis son negativos y las comas son miles", () => {
  assert.equal(numero("(0.01)"), -0.01);
  assert.equal(numero("£ 6,324"), 6324);
  assert.equal(numero("-$156"), -156);
  assert.equal(numero("-"), null, "un guion es «sin cambio», no cero");
});

test("la categoría viene de la sección, no de cada fila", () => {
  assert.deepEqual(
    [...new Set(ratios.map((r) => r.categoria))],
    ["Liquor", "Butter", "Powder", "Combined"],
  );
  // La primera categoría sale del encabezado de columnas, que la lleva pegada.
  assert.equal(ratios.find((r) => r.producto === "Europe Liquid Liquor")?.categoria, "Liquor");
});

test("se toma el ratio VIGENTE, no el de la semana pasada", () => {
  // Europe Powder: 1,19 la semana pasada, 1,30 esta. Tomar el primero mostraría
  // un dato viejo con toda la apariencia de estar al día.
  const p = ratios.find((r) => r.producto === "Europe Powder")!;
  assert.equal(p.ratio, 1.3);
  assert.equal(p.ratioAnterior, 1.19);
});

test("los precios se guardan por moneda", () => {
  const b = ratios.find((r) => r.producto === "Europe Liquid" && r.categoria === "Butter")!;
  assert.equal(b.precioUsd, 10607);
  assert.equal(b.precioGbp, 7804);
  assert.equal(b.precioEur, 9104);
  assert.equal(b.mercado, "LDN");
  assert.equal(b.incoterm, "ex fctry");
});

test("«Combined» no trae precios y se lee igual", () => {
  // Suponer nueve columnas siempre dejaría estas filas fuera o mal leídas.
  const c = ratios.filter((r) => r.categoria === "Combined");
  assert.equal(c.length, 2);
  assert.equal(c[0].ratio, 3.04);
  assert.equal(c[0].precioUsd, null);
});

test("el bloque de futuros sale aparte, con su arbitraje", () => {
  assert.deepEqual(
    futuros.map((f) => [f.contrato, f.valor, f.moneda]),
    [
      ["NY-DEC", 6173, "USD"],
      ["LDN-DEC", 4485, "GBP"],
      // El arbitraje negativo es el diferencial Nueva York contra Londres.
      ["ARBITRAGE", -77, "USD"],
    ],
  );
  assert.equal(futuros[0].valorAnterior, 6064);
});

test("el pie y los encabezados no entran como producto", () => {
  assert.ok(!ratios.some((r) => /Source|Cocoa Product|FUTURES/i.test(r.producto)));
  assert.ok(ignoradas.length > 0, "lo descartado se reporta, no se calla");
});

test("la referencia europea de polvo es la de Londres, no la de Nueva York", () => {
  // El reporte del 27-ago trae dos filas que empiezan por «Europe» en Powder:
  // «Europe Powder» (LDN) y «European High» (NY). Son plazas distintas.
  const polvo = [
    { producto: "Asia Natural Powder", mercado: "LDN" },
    { producto: "European High", mercado: "NY" },
    { producto: "Europe Powder", mercado: "LDN" },
  ];
  assert.equal(referenciaEuropa(polvo)?.producto, "Europe Powder");
});

test("sin fila europea no se elige una cualquiera", () => {
  const sinEuropa = [
    { producto: "Asia Natural", mercado: "LDN" },
    { producto: "Ghana Boxed", mercado: "LDN" },
  ];
  assert.equal(referenciaEuropa(sinEuropa), null);
});

test("la brecha contra Europa sale en puntos y en por ciento", () => {
  // Manteca Costa de Marfil 1,56 contra la europea 1,74: 0,18 puntos abajo,
  // que es un 10,3 % menos.
  const b = brechaVsEuropa(1.56, 1.74);
  assert.ok(b);
  assert.equal(b.puntos, -0.18);
  assert.equal(b.porcentaje, -10.3);

  // La propia referencia queda en cero, no en null: cero es un dato.
  assert.deepEqual(brechaVsEuropa(1.74, 1.74), { puntos: 0, porcentaje: 0 });
});

test("sin referencia no se calcula una brecha inventada", () => {
  assert.equal(brechaVsEuropa(1.56, null), null);
  // Un cero en el denominador daría infinito y se pintaría como si fuera dato.
  assert.equal(brechaVsEuropa(1.56, 0), null);
});
