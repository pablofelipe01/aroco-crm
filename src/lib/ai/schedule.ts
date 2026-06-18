import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";

const MODEL = serverEnv.ANTHROPIC_MODEL || "claude-opus-4-8";

export interface SlotSuggestion {
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string; // HH:MM
  duration_min: number;
  rationale: string;
}

export interface TaskForScheduling {
  name: string;
  description: string | null;
  due_date: string | null;
  person_name: string | null;
}

export interface Workload {
  today: string; // YYYY-MM-DD
  pendingCount: number; // other open tasks for the same person
  upcomingDue: string[]; // nearest due dates of those tasks
}

const SLOT_TOOL: Anthropic.Tool = {
  name: "suggest_slot",
  description: "Sugiere una franja horaria concreta para completar la tarea.",
  input_schema: {
    type: "object",
    properties: {
      date: { type: "string", description: "Fecha sugerida, YYYY-MM-DD." },
      start: { type: "string", description: "Hora de inicio HH:MM (24h)." },
      end: { type: "string", description: "Hora de fin HH:MM (24h)." },
      duration_min: {
        type: "integer",
        description: "Duración estimada en minutos.",
      },
      rationale: {
        type: "string",
        description: "Justificación breve (1-2 frases) de la franja y la duración.",
      },
    },
    required: ["date", "start", "end", "duration_min", "rationale"],
  },
};

/**
 * Suggest a concrete time block to complete a task, considering the assignee's
 * current workload. Returns a slot within working hours (Mon-Fri, 08:00-17:00)
 * on or before the due date.
 */
export async function suggestTaskSlot(
  task: TaskForScheduling,
  workload: Workload,
): Promise<SlotSuggestion> {
  const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });

  const prompt = `Eres un asistente de planificación para el equipo de AROCO (exportadora de cacao). Sugiere UNA franja horaria concreta para completar la siguiente tarea.

Tarea: "${task.name}"
${task.description ? `Detalle: ${task.description}` : ""}
Responsable: ${task.person_name ?? "sin asignar"}
Fecha límite: ${task.due_date ?? "sin fecha"}

Carga de trabajo del responsable: tiene ${workload.pendingCount} tareas pendientes${
    workload.upcomingDue.length
      ? `, con vencimientos próximos en ${workload.upcomingDue.join(", ")}`
      : ""
  }.

Reglas:
- Hoy es ${workload.today}. La franja debe ser hoy o después, y en lo posible antes de la fecha límite (si existe).
- Solo días hábiles (lunes a viernes) y horario laboral (08:00–17:00).
- Estima la duración según el esfuerzo que implica la tarea (de 30 min a varias horas). Para tareas grandes, propón un bloque razonable (no más de 4 horas seguidas).
- Si el responsable tiene mucha carga, evita amontonar y deja algo de margen antes del vencimiento.
- Devuelve fecha, hora inicio, hora fin coherentes con la duración.`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    tools: [SLOT_TOOL],
    tool_choice: { type: "tool", name: "suggest_slot" },
    messages: [{ role: "user", content: prompt }],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("La IA no devolvió una sugerencia.");
  }
  const s = block.input as Partial<SlotSuggestion>;
  return {
    date: String(s.date ?? workload.today),
    start: String(s.start ?? "09:00"),
    end: String(s.end ?? "10:00"),
    duration_min: Number(s.duration_min ?? 60),
    rationale: String(s.rationale ?? ""),
  };
}
