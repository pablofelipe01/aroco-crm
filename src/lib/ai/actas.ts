import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

const MODEL = serverEnv.ANTHROPIC_MODEL || "claude-opus-4-8";

export interface ExtractedTask {
  name: string;
  /**
   * Responsables tal como aparecen en el acta. Un mismo compromiso suele
   * quedar en manos de varias personas ("Pablo y Renata revisan…"), así que se
   * extraen todos y el ingest los reparte.
   */
  assignees: string[];
  due_date: string | null; // YYYY-MM-DD or null
  description: string | null;
}

export interface ExtractedActa {
  tasks: ExtractedTask[];
  /**
   * Invitados a la reunión, como correo cuando el acta lo trae. Alimentan la
   * lista de quién puede leer un acta restringida.
   */
  attendees: string[];
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
      attendees: {
        type: "array",
        items: { type: "string" },
        description:
          "Personas que asistieron o fueron invitadas a la reunión, tal como aparecen en el encabezado del acta ('Invitados', 'Asistentes', 'Participantes'). Devuelve el correo cuando aparezca; si no, el nombre. Lista vacía si el acta no los indica.",
      },
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
            assignees: {
              type: "array",
              items: { type: "string" },
              description:
                "Responsables de la tarea. Incluye a TODAS las personas mencionadas como encargadas: si el acta dice 'Pablo y Renata revisan el informe' o '[El grupo]', devuelve a todas. Cada nombre debe coincidir EXACTAMENTE con uno de los nombres del equipo cuando sea posible. Lista vacía si no se identifica a nadie.",
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
          required: ["name", "assignees", "due_date", "description"],
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
): Promise<ExtractedActa> {
  const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });

  const instruction = `Analiza esta acta de reunión de AROCO (exportadora de cacao) y extrae TODOS los compromisos y tareas accionables (cosas que alguien debe hacer). Pueden ser muchas (20 o más); no omitas ninguna ni las agrupes.

Presta especial atención a secciones como "Próximos pasos", "Compromisos", "Tareas", "Action items" o "Pendientes". Es común que cada tarea venga en el formato:
  [Responsable] Título de la tarea: descripción detallada.
En ese caso, CADA renglón/viñeta es una tarea independiente: el texto entre corchetes es el responsable, el título es la acción, y el resto es la descripción. Extrae absolutamente todas, una por una, en el mismo orden del acta.

Además, devuelve en "attendees" a los invitados/asistentes que aparezcan en el encabezado del acta (líneas como "Invitado", "Invitados", "Asistentes" o "Participantes"). Prefiere el correo electrónico cuando esté; si no, el nombre.

Para cada tarea:
- "name": la acción concreta y breve (imperativo).
- "assignees": los responsables, como lista. Asigna cada uno a un nombre del equipo de abajo usando su ortografía EXACTA (incluyendo tildes), aunque en el acta aparezca sin tildes, mal escrito o solo con el nombre de pila. Si la tarea menciona a varias personas ("Pablo y Renata revisan el informe", "[Pablo Acebedo] [Renata]"), inclúyelas a TODAS. Si el responsable es "El grupo", "El equipo", "Todos" o similar, devuelve la lista vacía: es un compromiso colectivo sin dueño. Si no hay responsable identificable, lista vacía también.
- "due_date": fecha límite en YYYY-MM-DD si se menciona (interpreta relativas como "mañana", "el próximo martes", "en dos semanas"); null si no.
- "description": el detalle/contexto de la tarea.

Equipo (usa estos nombres EXACTOS en assignees):
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
  if (!block || block.type !== "tool_use") return { tasks: [], attendees: [] };
  const out = block.input as { tasks?: unknown[]; attendees?: unknown };

  const attendees = (Array.isArray(out.attendees) ? out.attendees : [])
    .map((a) => String(a).trim())
    .filter((a) => a.length > 0);

  const tasks = (out.tasks ?? [])
    .filter((t): t is Record<string, unknown> => !!t && typeof t === "object")
    .map((t) => ({
      name: String(t.name ?? "").trim(),
      // Se tolera que el modelo devuelva un string suelto en vez de la lista.
      assignees: (Array.isArray(t.assignees)
        ? t.assignees
        : t.assignees
          ? [t.assignees]
          : []
      )
        .map((a) => String(a).trim())
        .filter((a) => a.length > 0),
      due_date: t.due_date ? String(t.due_date).trim() : null,
      description: t.description ? String(t.description).trim() : null,
    }))
    .filter((t) => t.name.length > 0);

  return { tasks, attendees };
}
