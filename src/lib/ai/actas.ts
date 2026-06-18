import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

const MODEL = serverEnv.ANTHROPIC_MODEL || "claude-opus-4-8";

export interface ExtractedTask {
  name: string;
  assignee: string | null; // name as written in the acta / matched to team
  due_date: string | null; // YYYY-MM-DD or null
  description: string | null;
}

export type ActaContent =
  | { kind: "pdf"; base64: string }
  | { kind: "text"; text: string };

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "extract_tasks",
  description:
    "Devuelve los compromisos/tareas accionables identificados en el acta, con su responsable y fecha límite.",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        description: "Lista de tareas/compromisos accionables del acta.",
        items: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Acción concreta a realizar (imperativo, breve).",
            },
            assignee: {
              type: ["string", "null"],
              description:
                "Nombre del responsable. Debe coincidir EXACTAMENTE con uno de los nombres del equipo cuando sea posible; null si no se identifica.",
            },
            due_date: {
              type: ["string", "null"],
              description: "Fecha límite en formato YYYY-MM-DD si se menciona; null si no.",
            },
            description: {
              type: ["string", "null"],
              description: "Contexto o detalle adicional (opcional).",
            },
          },
          required: ["name", "assignee", "due_date", "description"],
        },
      },
    },
    required: ["tasks"],
  },
};

/**
 * Extract action items from a meeting acta using Claude (reads PDF natively).
 * `teamNames` lets the model assign responsibles to real team members.
 */
export async function extractActaTasks(
  content: ActaContent,
  teamNames: string[],
): Promise<ExtractedTask[]> {
  const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });

  const instruction = `Analiza esta acta de reunión de AROCO (exportadora de cacao) y extrae TODOS los compromisos y tareas accionables (cosas que alguien debe hacer). Pueden ser muchas (20 o más); no omitas ninguna ni las agrupes.

Presta especial atención a secciones como "Próximos pasos", "Compromisos", "Tareas", "Action items" o "Pendientes". Es común que cada tarea venga en el formato:
  [Responsable] Título de la tarea: descripción detallada.
En ese caso, CADA renglón/viñeta es una tarea independiente: el texto entre corchetes es el responsable, el título es la acción, y el resto es la descripción. Extrae absolutamente todas, una por una, en el mismo orden del acta.

Para cada tarea:
- "name": la acción concreta y breve (imperativo).
- "assignee": el responsable. Asígnalo a uno de los nombres del equipo de abajo usando su ortografía EXACTA (incluyendo tildes), aunque en el acta aparezca sin tildes, mal escrito o solo con el nombre de pila. Si el responsable es "El grupo", "El equipo", "Todos" o similar (tarea colectiva sin dueño único), deja assignee en null. Si no hay responsable identificable, también null.
- "due_date": fecha límite en YYYY-MM-DD si se menciona (interpreta relativas como "mañana", "el próximo martes", "en dos semanas"); null si no.
- "description": el detalle/contexto de la tarea.

Equipo (usa estos nombres EXACTOS para assignee):
${teamNames.map((n) => `- ${n}`).join("\n")}

No inventes tareas que no estén en el acta, pero tampoco descartes ninguna que sí esté. Hoy es ${new Date().toISOString().slice(0, 10)}.`;

  const userContent: Anthropic.ContentBlockParam[] =
    content.kind === "pdf"
      ? [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: content.base64 },
          },
          { type: "text", text: instruction },
        ]
      : [{ type: "text", text: `${instruction}\n\n--- ACTA ---\n${content.text}` }];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    tools: [EXTRACT_TOOL],
    tool_choice: { type: "tool", name: "extract_tasks" },
    messages: [{ role: "user", content: userContent }],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return [];
  const tasks = (block.input as { tasks?: unknown[] })?.tasks ?? [];
  return tasks
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      name: String(t.name ?? "").trim(),
      assignee: t.assignee ? String(t.assignee).trim() : null,
      due_date: t.due_date ? String(t.due_date).trim() : null,
      description: t.description ? String(t.description).trim() : null,
    }))
    .filter((t) => t.name.length > 0);
}
