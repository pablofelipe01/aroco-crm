import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getSessionContext } from "@/lib/auth";
import { serverEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = serverEnv.ANTHROPIC_MODEL || "claude-opus-4-8";

export async function POST(request: NextRequest) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ error: "Falta ANTHROPIC_API_KEY." }, { status: 503 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
  const prompt = `Eres analista de precios de AROCO (exportadora de cacao colombiano). Analiza el comparativo de precios de referencia (todos en COP/kg).

Datos (JSON):
${JSON.stringify(body, null, 2)}

Notas:
- "latest" = últimos precios nacionales por compañía (COP/kg).
- "internationalCopKg" = precio internacional del cacao (ICE NY) convertido a COP/kg con la TRM del día.
- "gapPct" = diferencia % del internacional vs el promedio nacional.
- "series" = evolución reciente (cada punto tiene los nacionales y "Internacional (ICE)").

Escribe un análisis breve y accionable en español (máx ~150 palabras): el gap actual nacional vs internacional y qué implica para AROCO (margen de compra/venta), la tendencia reciente, y 1–2 recomendaciones concretas. Usa cifras. No inventes datos que no estén en el JSON; si falta el internacional, dilo.`;

  try {
    const res = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 700,
      messages: [{ role: "user", content: prompt }],
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    return NextResponse.json({ analysis: text || "Sin análisis." });
  } catch (e) {
    if (e instanceof Anthropic.APIError) {
      console.error("[precios/analyze]", e.status, e.message);
      return NextResponse.json({ error: "El análisis falló. Intenta de nuevo." }, { status: 502 });
    }
    return NextResponse.json({ error: "Error inesperado." }, { status: 500 });
  }
}
