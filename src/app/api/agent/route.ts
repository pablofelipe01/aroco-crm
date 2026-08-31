import { NextResponse, type NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { serverEnv } from "@/lib/env";
import { AI_TOOLS, executeTool } from "@/lib/ai/tools";
import type { Idioma } from "@/lib/i18n";
import { resolveAgentContext } from "@/lib/ai/context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODEL = serverEnv.ANTHROPIC_MODEL || "claude-opus-4-8";
const MAX_TOOL_ROUNDS = 6;

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .min(1)
    .max(40),
});

function systemPrompt(
  userName: string,
  department: string | null,
  isAdmin: boolean,
  veMercado: boolean,
  idioma: Idioma,
): string {
  return `Eres el asistente de IA de la plataforma interna de AROCO S.A.S, una exportadora y comercializadora de cacao colombiano. Ayudas al equipo comercial, de bodega, de operaciones y financiero a consultar y entender sus datos.

El usuario actual es ${userName}${department ? ` (departamento: ${department})` : ""}. Rol: ${isAdmin ? "Dirección — acceso total a la información del CRM" : "miembro — ve lo propio y lo de su área"}.
Hoy es ${new Date().toISOString().slice(0, 10)}.

Qué puedes consultar:
- Comercial: leads, pipeline, bitácora de actividad, cotizaciones, comisiones y toneladas mensuales.
- Bodega: inventario actual por lote, procedencia, clasificación (premium / corriente / corriente C / orgánico) y cadmio; despachos y trazabilidad de salidas.
- Equipo: directorio y tareas del equipo, con el alcance que permita el rol de quien pregunta.
- Procesos: proveedores y su estado de vinculación, órdenes de compra, recepciones y liquidaciones.
- Precios: histórico nacional por compañía y comparación contra el cacao internacional (ICE NY convertido a COP/kg con la TRM).
${veMercado ? `- Mercado: exposición al precio del cacao, cobertura con opciones y futuros, tablero de opciones y estado de la cuenta en StoneX.
` : ""}
Pautas:
- Responde ${idioma === "en" ? "EN INGLÉS" : "en español"}, de forma concisa y profesional. Esto no es negociable: la persona tiene el CRM en ${idioma === "en" ? "inglés" : "español"} y una respuesta en el otro idioma la obliga a traducir. Si te escribe en el otro idioma, responde igual en ${idioma === "en" ? "inglés" : "español"}${idioma === "en" ? " (los nombres propios, los estados guardados como «Cotización» o «Pendiente» y los nombres de empresa se dejan como están, y se traduce el resto)" : ""}. Usa cifras con separador de miles ${idioma === "en" ? "en formato inglés (1,250,000.50)" : "en formato colombiano (1.250.000,50)"} y unidades (kg, COP, USD, %).
- Usa SIEMPRE las herramientas para obtener datos reales antes de afirmar números. Nunca inventes datos.
- Si necesitas resolver el nombre de una persona antes de buscar sus tareas, usa get_team primero.
- Las herramientas de tareas recortan el resultado según el rol. Si vienen tareas ocultas por permiso, dilo en una frase en vez de callarlo; no intentes rodear el límite.
- Al comparar precios, di explícitamente cuál es la brecha y qué significa para la decisión de vender nacional o exportar.
- Consultas (leer leads, inventario, precios, tareas, despachos, proveedores, actividad) son automáticas.
- Para acciones de ESCRITURA usa las herramientas \`propose_*\` (cambiar estado de un lead, agregar nota a un lead, crear lead, crear cotización borrador, crear tarea, registrar movimiento de inventario). Estas NO ejecutan nada: solo PREPARAN la acción para que el usuario la confirme con un botón en la interfaz. Después de proponerla, dile al usuario que la confirme abajo y NUNCA afirmes que ya se hizo.
- Para redactar correos/WhatsApp de seguimiento: primero consulta la actividad del lead con get_lead_activity y luego escribe el borrador directamente en tu respuesta (es solo texto, el usuario lo copia).
- Las herramientas respetan los permisos del usuario; si una consulta vuelve vacía puede ser por permisos o porque no hay datos.
- Cuando resumas la actividad de un lead, sugiere una próxima acción concreta.
- Da respuestas accionables; evita relleno.
${veMercado ? `
Sobre Mercado:
- «Cubierto» significa protegido de una CAÍDA del precio: puts comprados o futuros vendidos. Un futuro comprado NO cubre inventario, lo duplica.
- Distingue cobertura nominal (contratos × 10 t) de cobertura efectiva (ponderada por delta). Si hay delta cargado, usa la efectiva y explica por qué es menor.
- Si get_riesgo_mercado devuelve algo en \`faltantes\`, dilo: el cálculo está incompleto y las cifras que dependen de eso no son fiables.
- Las primas del tablero están en puntos, la misma unidad que el strike, no en dólares.
- Menciona la fecha de los datos cuando respondas sobre precio o cuenta: el estado del bróker se publica con un día de retraso.
- Los ratios multiplican el precio del futuro: no son precios sueltos. Para dar el valor de un derivado, multiplica el ratio por el contrato correspondiente (LDN o NY) o usa \`precio_usd\` si viene.
- El diferencial de Colombia es una ESTIMACIÓN de AROCO, no una cotización: al darlo, dilo y explica el método. Los de los demás orígenes sí son del reporte de StoneX.
- El precio del cacao trae \`precio_fuente\`: «vivo» es la cotización del momento; «guardado» o «paridad» vienen de antes y hay que advertirlo. Si hay \`variacion_dia_pct\`, menciónala cuando sea relevante.` : ""}`;
}

export async function POST(request: NextRequest) {
  // Auth — the assistant only runs for signed-in users, and tools use the
  // user's own Supabase client so RLS is enforced.
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
      { error: "El asistente no está configurado (falta ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
  const supabase = await createClient();
  // Quién pregunta: las herramientas de tareas recortan por rol y área.
  const agentCtx = await resolveAgentContext(supabase, session);

  const messages: Anthropic.MessageParam[] = parsed.messages.map((m) => ({
    role: m.role,
    content: m.content,
  }));

  // tools → system → messages render order; cache_control on the last system
  // block caches tools + system together.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: systemPrompt(
        agentCtx.fullName,
        agentCtx.department,
        agentCtx.isAdmin,
        agentCtx.veMercado,
        agentCtx.idioma,
      ),
      cache_control: { type: "ephemeral" },
    },
  ];
  const tools = AI_TOOLS.map((t, i) =>
    i === AI_TOOLS.length - 1
      ? { ...t, cache_control: { type: "ephemeral" as const } }
      : t,
  );

  const toolLog: { name: string; input: unknown }[] = [];
  const proposals: unknown[] = [];

  try {
    let rounds = 0;
    while (rounds < MAX_TOOL_ROUNDS) {
      rounds++;
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 1500,
        system,
        tools,
        messages,
      });

      if (response.stop_reason !== "tool_use") {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return NextResponse.json({
          reply: text || "No tengo una respuesta para eso.",
          tools_used: toolLog,
          proposals,
        });
      }

      // Execute every tool_use block, then feed results back.
      messages.push({ role: "assistant", content: response.content });
      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const input = (block.input ?? {}) as Record<string, unknown>;
        toolLog.push({ name: block.name, input });
        // Audit trail of agent reads.
        console.log(
          `[agent] ${session.userId} → ${block.name} ${JSON.stringify(input)}`,
        );
        const result = await executeTool(supabase, block.name, input, agentCtx);
        if (result && typeof result === "object" && "proposal" in result) {
          proposals.push((result as { proposal: unknown }).proposal);
        }
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json({
      reply:
        "La consulta resultó demasiado larga. Intenta una pregunta más específica.",
      tools_used: toolLog,
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.error("[agent] Anthropic error", err.status, err.message);
      return NextResponse.json(
        { error: "El asistente tuvo un problema. Intenta de nuevo." },
        { status: 502 },
      );
    }
    console.error("[agent] error", err);
    return NextResponse.json({ error: "Error inesperado." }, { status: 500 });
  }
}
