import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { executeTool, herramientasAnalista } from "@/lib/ai/tools";
import { resolveAgentContext } from "@/lib/ai/context";
import { promptAnalista } from "@/lib/ai/analista";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Una vuelta puede encadenar varias herramientas y `get_riesgo_mercado` recarga
// la posición entera. Con el tope por defecto la respuesta se cortaría a la
// mitad de una frase.
export const maxDuration = 300;

/**
 * El analista razona sobre cobertura: cuánto protege un put, qué pasa si el
 * precio cae 15 %, si conviene rodar el collar. Eso es pensar, no recitar, así
 * que va con el modelo más capaz y con pensamiento adaptativo — el resto de la
 * plataforma (leer un lead, resumir un acta) no lo necesita y sigue con
 * ANTHROPIC_MODEL.
 */
const MODEL = "claude-opus-5";
const MAX_TOOL_ROUNDS = 6;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .min(1)
    .max(30),
  /**
   * La pantalla que la persona tiene delante, servida por el mismo render que
   * pintó las tarjetas. Viene del cliente a propósito: rearmarla aquí pediría
   * el precio en vivo otra vez y el analista citaría un número distinto al que
   * se ve. Manipularla solo se engaña a sí mismo — no abre ningún dato nuevo,
   * porque todo lo que trae ya estaba en su pantalla y las herramientas
   * vuelven a pasar por RLS.
   */
  foto: z.string().max(24_000).optional(),
});

/** Un evento del canal SSE. El cliente los pinta en orden. */
type Evento =
  | { t: "texto"; delta: string }
  | { t: "herramienta"; nombre: string }
  | { t: "propuesta"; propuesta: unknown }
  | { t: "error"; mensaje: string }
  | { t: "fin" };

export async function POST(request: NextRequest) {
  const session = await getSessionContext();
  if (!session) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  let parsed;
  try {
    parsed = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "El analista no está configurado (falta ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  const supabase = await createClient();
  const agentCtx = await resolveAgentContext(supabase, session);
  // Esconder el panel no es un control de acceso: esta ruta se puede llamar a
  // mano. El candado real está aquí, igual que en la página.
  if (!agentCtx.veMercado) {
    return NextResponse.json(
      { error: "No tienes acceso al módulo Mercado." },
      { status: 403 },
    );
  }

  const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });

  const messages: Anthropic.MessageParam[] = parsed.messages.map((m, i) => ({
    role: m.role,
    // La foto va pegada al PRIMER mensaje, no al system: el prompt y las
    // herramientas quedan idénticos entre turnos y se sirven del caché,
    // mientras que la foto cambia con cada carga de la pantalla.
    content:
      i === 0 && m.role === "user" && parsed.foto
        ? `<pantalla>\n${parsed.foto}\n</pantalla>\n\n${m.content}`
        : m.content,
  }));

  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: promptAnalista(agentCtx),
      cache_control: { type: "ephemeral" },
    },
  ];
  const disponibles = herramientasAnalista(agentCtx);
  const tools = disponibles.map((t, i) =>
    i === disponibles.length - 1
      ? { ...t, cache_control: { type: "ephemeral" as const } }
      : t,
  );

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emitir = (e: Evento) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));

      try {
        for (let ronda = 0; ronda < MAX_TOOL_ROUNDS; ronda++) {
          const turno = anthropic.messages.stream({
            model: MODEL,
            max_tokens: 8000,
            // Razonar sobre cobertura es justamente lo que esto paga.
            thinking: { type: "adaptive" },
            system,
            tools,
            messages,
          });

          for await (const ev of turno) {
            if (
              ev.type === "content_block_delta" &&
              ev.delta.type === "text_delta"
            ) {
              emitir({ t: "texto", delta: ev.delta.text });
            } else if (
              ev.type === "content_block_start" &&
              ev.content_block.type === "tool_use"
            ) {
              // Decir qué está consultando: una consulta a la posición tarda
              // segundos y sin señal la pantalla parece colgada.
              emitir({ t: "herramienta", nombre: ev.content_block.name });
            }
          }

          const respuesta = await turno.finalMessage();
          if (respuesta.stop_reason !== "tool_use") {
            emitir({ t: "fin" });
            return;
          }

          messages.push({ role: "assistant", content: respuesta.content });
          const resultados: Anthropic.ToolResultBlockParam[] = [];
          for (const bloque of respuesta.content) {
            if (bloque.type !== "tool_use") continue;
            const input = (bloque.input ?? {}) as Record<string, unknown>;
            console.log(
              `[analista] ${session.userId} → ${bloque.name} ${JSON.stringify(input)}`,
            );
            const resultado = await executeTool(
              supabase,
              bloque.name,
              input,
              agentCtx,
            );
            if (
              resultado &&
              typeof resultado === "object" &&
              "proposal" in resultado
            ) {
              emitir({
                t: "propuesta",
                propuesta: (resultado as { proposal: unknown }).proposal,
              });
            }
            resultados.push({
              type: "tool_result",
              tool_use_id: bloque.id,
              content: JSON.stringify(resultado),
            });
          }
          messages.push({ role: "user", content: resultados });
        }

        emitir({
          t: "error",
          mensaje:
            "La consulta resultó demasiado larga. Intenta una pregunta más específica.",
        });
      } catch (err) {
        if (err instanceof Anthropic.APIError) {
          console.error("[analista] Anthropic error", err.status, err.message);
        } else {
          console.error("[analista] error", err);
        }
        emitir({
          t: "error",
          mensaje: "El analista tuvo un problema. Intenta de nuevo.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Sin esto el proxy junta los trozos y el streaming deja de serlo.
      "X-Accel-Buffering": "no",
    },
  });
}
