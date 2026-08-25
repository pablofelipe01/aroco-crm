import { test } from "node:test";
import assert from "node:assert/strict";
import { extraerTexto, normalizarArticulo } from "./intel";

test("el texto sale del JSON que StoneX mete en pdf_text", () => {
  const t = extraerTexto(
    JSON.stringify({ pdf_url: "https://x/y.pdf", pdf_size_bytes: 532583, page_count: 2, text: "Certified stocks fell 3%." }),
    null,
  );
  assert.equal(t, "Certified stocks fell 3%.");
});

test("si pdf_text no es JSON se conserva en crudo en vez de perderlo", () => {
  assert.equal(extraerTexto("texto plano del reporte", null), "texto plano del reporte");
});

test("sin PDF se cae al content, sin etiquetas HTML", () => {
  const t = extraerTexto(null, '<div style="x"><p>Cocoa storm gathers</p></div>');
  assert.equal(t, "Cocoa storm gathers");
});

test("un artículo sin id o sin fecha se descarta", () => {
  // Sin id no se puede deduplicar; sin fecha no se puede ordenar.
  assert.equal(normalizarArticulo({ title: "X", published_date: "2026-08-11T12:06:00Z" }), null);
  assert.equal(normalizarArticulo({ id: "a", title: "X" }), null);
});

test("se normaliza un artículo real de StoneX", () => {
  const a = normalizarArticulo({
    id: "bfd606c3-328b-4f38-ba77-c4aeaaa656a2",
    title: "Certified Stocks Weekly Report",
    abstract: "ICE-US certified warehouse stocks…",
    ai_abstract: null,
    published_date: "2026-08-11T12:06:00+00:00",
    author: "Softs Cocoa Team - Miami",
    market_name: "Cocoa",
    url: "https://intel.stonex.com/article?articleId=bfd606c3",
    pdf_text: JSON.stringify({ text: "Stocks at 1.9M bags." }),
  })!;
  assert.equal(a.article_id, "bfd606c3-328b-4f38-ba77-c4aeaaa656a2");
  assert.equal(a.texto, "Stocks at 1.9M bags.");
  assert.equal(a.market_name, "Cocoa");
});

test("el ai_abstract nulo de StoneX no queda como la cadena «null»", () => {
  const a = normalizarArticulo({
    id: "x", title: "T", published_date: "2026-08-11T12:06:00Z", abstract: "null",
  })!;
  assert.equal(a.abstract, null);
});

test("pdf_text llega como objeto, no como JSON serializado", () => {
  // Tratarlo como cadena daba "[object Object]": quince caracteres que pasaban
  // por texto válido y hacían que el resumen se generara sobre nada.
  const t = extraerTexto(
    { pdf_url: "https://x/y.pdf", pdf_size_bytes: 529880, page_count: 2, truncated: false, text: "Cocoa Certified Stocks – ICE US" },
    null,
  );
  assert.equal(t, "Cocoa Certified Stocks – ICE US");
});

test("nunca sale «[object Object]» como texto del artículo", () => {
  for (const entrada of [{ text: { paginas: [] } }, { otra: "cosa" }, {}]) {
    const t = extraerTexto(entrada, null);
    assert.ok(t === null || !t.includes("[object Object]"), `salió: ${t}`);
  }
});
