import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

/**
 * Lee un tablero de opciones desde una captura de pantalla.
 *
 * Barchart entrega strikes y primas pero no las griegas. Delta y volatilidad
 * implícita solo están en el tablero del bróker, que no tiene API: es una
 * pantalla. Por eso se lee con visión.
 *
 * Sin delta no se puede decir cuánto protege realmente una cobertura —un put
 * muy fuera de dinero cubre en el papel y casi nada en la práctica— así que
 * esta es la pieza que faltaba para que el escenario incluya la cobertura y no
 * solo la pata física.
 *
 * La imagen NO se guarda. Lo que importa es el tablero extraído, y almacenar
 * capturas de la cuenta del bróker es guardar información sensible sin
 * necesidad.
 */

const MODEL = serverEnv.ANTHROPIC_MODEL || "claude-opus-4-8";

export type StrikeTablero = {
  strike: number;
  call_premium: number | null;
  call_delta: number | null;
  put_premium: number | null;
  put_delta: number | null;
};

export type TableroImagen = {
  contract_month: string;
  underlying_price: number | null;
  dte: number | null;
  expiration: string | null;
  volatility_calls: number | null;
  volatility_puts: number | null;
  interest_rate: number | null;
  strikes: StrikeTablero[];
};

export class TableroIlegible extends Error {}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const ESQUEMA = {
  name: "tablero_opciones",
  description: "Datos de un tablero de opciones de cacao (ICE).",
  input_schema: {
    type: "object" as const,
    properties: {
      contract_month: { type: "string", description: "Mes del contrato, p. ej. DEC26" },
      underlying_price: { type: ["number", "null"], description: "UndPr, precio del subyacente" },
      dte: { type: ["number", "null"], description: "Días al vencimiento" },
      expiration: { type: ["string", "null"], description: "Fecha de vencimiento en ISO (YYYY-MM-DD)" },
      volatility_calls: { type: ["number", "null"] },
      volatility_puts: { type: ["number", "null"] },
      interest_rate: { type: ["number", "null"] },
      strikes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            strike: { type: "number" },
            call_premium: { type: ["number", "null"] },
            call_delta: { type: ["number", "null"] },
            put_premium: { type: ["number", "null"] },
            put_delta: { type: ["number", "null"], description: "Negativo, como lo muestra el tablero" },
          },
          required: ["strike"],
        },
      },
    },
    required: ["contract_month", "strikes"],
  },
};

const INSTRUCCIONES = `Lee este tablero de opciones de cacao (ICE) y devuelve sus datos con la herramienta.

Reglas:
- Extrae TODOS los strikes visibles, sin resumir ni saltarte filas.
- call_premium y put_premium son la columna de precio de cada lado; call_delta y put_delta, la de delta.
- Los deltas de puts son negativos: si el tablero los muestra sin signo, ponlos negativos.
- UndPr = underlying_price · DTE = días al vencimiento · VOL = volatilidad · IR = tasa de interés.
- Si un valor no se ve o está cortado, ponlo en null. NO lo estimes ni lo interpoles:
  un número inventado en un tablero de riesgo es peor que un hueco.`;

/**
 * @param imagen bytes de la captura
 * @param mime `image/png`, `image/jpeg`, `image/webp` o `image/gif`
 */
export async function leerTableroDeImagen(
  imagen: Buffer,
  mime: string,
): Promise<TableroImagen> {
  if (!serverEnv.ANTHROPIC_API_KEY) {
    throw new TableroIlegible("Falta ANTHROPIC_API_KEY.");
  }
  const permitidos = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  if (!permitidos.includes(mime)) {
    throw new TableroIlegible(`Formato no soportado: ${mime}. Usa PNG, JPEG, WEBP o GIF.`);
  }

  const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });

  // Se fuerza la herramienta en vez de pedir JSON en texto: así el modelo no
  // puede responder con explicaciones alrededor y no hay que recortar ```json.
  const res = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    tools: [ESQUEMA],
    tool_choice: { type: "tool", name: ESQUEMA.name },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: { type: "base64", media_type: mime as "image/png", data: imagen.toString("base64") },
          },
          { type: "text", text: INSTRUCCIONES },
        ],
      },
    ],
  });

  const uso = res.content.find((c) => c.type === "tool_use");
  if (!uso || uso.type !== "tool_use") {
    throw new TableroIlegible("No se pudo leer el tablero de la imagen.");
  }

  return normalizarTablero(uso.input);
}

/** Valida y limpia lo que devolvió el modelo. Exportado para poder probarlo. */
export function normalizarTablero(bruto: unknown): TableroImagen {
  const t = (bruto ?? {}) as Record<string, unknown>;
  const mes = String(t.contract_month ?? "").trim().toUpperCase();
  if (!mes) throw new TableroIlegible("El tablero no dice a qué mes de contrato corresponde.");

  const filas = Array.isArray(t.strikes) ? t.strikes : [];
  const strikes: StrikeTablero[] = [];

  for (const f of filas as Record<string, unknown>[]) {
    const strike = num(f.strike);
    if (strike === null || strike <= 0) continue;

    const putDelta = num(f.put_delta);
    strikes.push({
      strike,
      call_premium: num(f.call_premium),
      call_delta: num(f.call_delta),
      put_premium: num(f.put_premium),
      // El tablero a veces muestra los deltas de put sin signo. Se fuerza el
      // negativo: un delta de put positivo diría que el put sube cuando sube el
      // subyacente, que es al revés, y con eso la cobertura se calcularía al
      // revés también.
      put_delta: putDelta === null ? null : -Math.abs(putDelta),
    });
  }

  if (strikes.length === 0) {
    throw new TableroIlegible("No se reconoció ningún strike en la imagen.");
  }

  strikes.sort((a, b) => a.strike - b.strike);

  return {
    contract_month: mes,
    underlying_price: num(t.underlying_price),
    dte: num(t.dte),
    expiration: typeof t.expiration === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t.expiration)
      ? t.expiration
      : null,
    volatility_calls: num(t.volatility_calls),
    volatility_puts: num(t.volatility_puts),
    interest_rate: num(t.interest_rate),
    strikes,
  };
}

/**
 * Cobertura efectiva de una posición, ponderada por delta.
 *
 * Diez contratos de puts no cubren diez lotes de diez toneladas si esos puts
 * están muy fuera de dinero: un put con delta −0,15 se mueve quince centavos
 * por cada peso que cae el subyacente. Contar contratos sin mirar el delta
 * sobreestima la protección, y es justo el error que lleva a creerse cubierto.
 */
export function toneladasPorDelta(
  posiciones: { option_type: string | null; long_qty: number; short_qty: number; strike: number | null }[],
  deltaPorStrike: Map<number, { call: number | null; put: number | null }>,
  toneladasPorContrato = 10,
): { conDelta: number; sinDelta: number } {
  let conDelta = 0;
  let sinDelta = 0;

  for (const p of posiciones) {
    if (p.option_type !== "PUT" || p.long_qty <= 0) continue;
    const d = p.strike === null ? undefined : deltaPorStrike.get(p.strike);
    const delta = d?.put ?? null;
    const toneladas = p.long_qty * toneladasPorContrato;
    // Sin delta conocido no se asume 1: se cuenta aparte y la pantalla lo dice.
    if (delta === null) {
      sinDelta += toneladas;
      continue;
    }
    // El tablero escribe el delta a veces en decimal (-0,15) y a veces en
    // porcentaje (-15). Se compara sobre el ABSOLUTO: mirar el signo hacía que
    // un -15 nunca pasara el umbral y se usara tal cual, multiplicando la
    // cobertura por cien.
    const magnitud = Math.abs(delta);
    conDelta += toneladas * (magnitud > 1 ? magnitud / 100 : magnitud);
  }

  return { conDelta: Math.round(conDelta * 100) / 100, sinDelta };
}
