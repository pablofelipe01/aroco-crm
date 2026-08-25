import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { serverEnv } from "@/lib/env";
import { llamarHerramienta, type McpConfig } from "@/lib/mcp/client";

/**
 * Inteligencia de mercado de StoneX: reportes de inventarios certificados,
 * notas de clima y cosecha, movimientos de precio.
 *
 * Los artículos llegan en inglés y con el cuerpo dentro de un PDF de dos
 * páginas. Se guarda el texto original y se genera un resumen corto en español:
 * quien mira la pantalla necesita saber en dos líneas si le concierne, no
 * leerse el reporte completo. El original queda para poder ir a la fuente.
 */

const MODEL = serverEnv.ANTHROPIC_MODEL || "claude-opus-4-8";

export type Articulo = {
  article_id: string;
  title: string;
  abstract: string | null;
  author: string | null;
  market_name: string | null;
  url: string | null;
  texto: string | null;
  published_at: string;
};

/**
 * Texto de un campo, solo si de verdad es texto.
 *
 * Antes usaba `String(v)`, que convierte cualquier cosa: un objeto se volvía
 * «[object Object]» —quince caracteres que pasaban por contenido válido— y el
 * resumen se generaba sobre eso. Convertir a ciegas es cómo un dato ausente se
 * disfraza de dato presente.
 */
const txt = (v: unknown): string | null => {
  if (typeof v === "number") return String(v);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s === "" || s === "null" ? null : s;
};

/**
 * `pdf_text` trae la URL del PDF, su tamaño, el número de páginas y el texto
 * extraído. Llega YA COMO OBJETO, no como JSON serializado —el cliente MCP lo
 * deserializa antes—, y tratarlo como cadena producía «[object Object]»: quince
 * caracteres que pasaban por texto válido y hacían que el resumen se generara
 * sobre nada. Se aceptan las dos formas por si el servidor cambia.
 */
export function extraerTexto(pdfText: unknown, content: unknown): string | null {
  const desdeObjeto = (o: Record<string, unknown>): string | null =>
    txt(o.text) ?? txt(o.pdf_text) ?? txt(o.content);

  if (pdfText && typeof pdfText === "object" && !Array.isArray(pdfText)) {
    const t = desdeObjeto(pdfText as Record<string, unknown>);
    if (t) return t;
  }
  const bruto = typeof pdfText === "string" ? txt(pdfText) : null;
  if (bruto) {
    try {
      const t = desdeObjeto(JSON.parse(bruto) as Record<string, unknown>);
      if (t) return t;
    } catch {
      return bruto;
    }
  }
  // El `content` es HTML con el PDF incrustado: se le quitan las etiquetas por
  // si trae algo legible.
  const html = txt(content);
  if (!html) return null;
  const limpio = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return limpio || null;
}

export function normalizarArticulo(a: Record<string, unknown>): Articulo | null {
  const id = txt(a.id);
  const title = txt(a.title);
  const fecha = txt(a.published_date);
  // Sin id no se puede deduplicar y sin fecha no se puede ordenar: una fila así
  // ensucia la lista sin aportar nada.
  if (!id || !title || !fecha) return null;

  return {
    article_id: id,
    title,
    abstract: txt(a.abstract) ?? txt(a.ai_abstract),
    author: txt(a.author),
    market_name: txt(a.market_name),
    url: txt(a.url),
    texto: extraerTexto(a.pdf_text, a.content),
    published_at: fecha,
  };
}

export async function traerIntel(mcp: McpConfig): Promise<Articulo[]> {
  const r = await llamarHerramienta(mcp, "get_latest_cocoa_intel", {}, 120_000);
  if (typeof r === "string") throw new Error(r);
  const arts = ((r as { articles?: unknown[] })?.articles ?? []) as Record<string, unknown>[];
  return arts.map(normalizarArticulo).filter((a): a is Articulo => a !== null);
}

const INSTRUCCIONES = `Resume este análisis del mercado de cacao para el equipo comercial de una exportadora colombiana.

- En español, 2 o 3 frases, máximo 60 palabras.
- Ve al grano: qué pasó y qué implica para el precio. Sin preámbulos ni "el artículo dice".
- Conserva las cifras concretas (toneladas, porcentajes, niveles de precio) — son lo que hace útil el resumen.
- Si el texto no permite concluir nada, dilo en una frase en vez de rellenar.`;

/** Resumen corto en español. `null` si no hay con qué o si falla. */
export async function resumir(a: Articulo): Promise<string | null> {
  const fuente = a.texto ?? a.abstract;
  if (!fuente || !serverEnv.ANTHROPIC_API_KEY) return null;

  try {
    const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 300,
      system: INSTRUCCIONES,
      messages: [
        {
          role: "user",
          // Se recorta la fuente: estos reportes traen tablas largas que no
          // aportan al resumen y sí al costo.
          content: `Título: ${a.title}\n\n${fuente.slice(0, 12_000)}`,
        },
      ],
    });
    const bloque = res.content.find((c) => c.type === "text");
    return bloque && bloque.type === "text" ? bloque.text.trim() : null;
  } catch {
    // Un resumen que falla no puede impedir que el artículo se guarde: el
    // título, la fecha y el enlace ya sirven.
    return null;
  }
}

export type ResultadoIntel = { nuevos: number; resumidos: number; total: number };

export async function sincronizarIntel(
  db: SupabaseClient<Database>,
  mcp: McpConfig,
): Promise<ResultadoIntel> {
  const articulos = await traerIntel(mcp);
  if (articulos.length === 0) return { nuevos: 0, resumidos: 0, total: 0 };

  const { data: existentes } = await db
    .from("market_intel")
    .select("article_id, resumen")
    .in("article_id", articulos.map((a) => a.article_id));

  const yaResumido = new Set(
    (existentes ?? []).filter((e) => e.resumen).map((e) => e.article_id),
  );

  let resumidos = 0;
  const filas = [];
  for (const a of articulos) {
    // Solo se resume lo que no tiene resumen: volver a pedirlo en cada corrida
    // gastaría por un texto que no cambió.
    const resumen = yaResumido.has(a.article_id) ? undefined : await resumir(a);
    if (resumen) resumidos++;
    filas.push({
      ...a,
      ...(resumen !== undefined ? { resumen } : {}),
      synced_at: new Date().toISOString(),
    });
  }

  const { error } = await db
    .from("market_intel")
    .upsert(filas, { onConflict: "article_id" });
  if (error) throw new Error(`market_intel: ${error.message}`);

  const conocidos = new Set((existentes ?? []).map((e) => e.article_id));
  return {
    nuevos: articulos.filter((a) => !conocidos.has(a.article_id)).length,
    resumidos,
    total: articulos.length,
  };
}
