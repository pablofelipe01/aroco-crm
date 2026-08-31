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

const ATTENDEES_TOOL: Anthropic.Tool = {
  name: "extract_attendees",
  description: "Devuelve quiénes asistieron realmente a la reunión.",
  input_schema: {
    type: "object",
    properties: {
      attendees: {
        type: "array",
        items: { type: "string" },
        description:
          "Nombres de quienes ASISTIERON. Usa la ortografía exacta de la lista de personas conocidas cuando haya correspondencia.",
      },
      mentioned_only: {
        type: "array",
        items: { type: "string" },
        description:
          "Nombres que aparecen en el encabezado pero NO asistieron (marcados como 'mencionado', 'referenciado' o similar).",
      },
    },
    required: ["attendees", "mentioned_only"],
  },
};

/**
 * Quiénes asistieron a una reunión, leyendo el encabezado del acta.
 *
 * Se separa de la extracción de tareas porque el formato varía entre actas
 * (unas listan "👥 Participantes" en líneas, otras "Invitado" seguido de
 * correos y nombres) y porque hay que distinguir a quien asistió de quien solo
 * fue nombrado — esa diferencia decide quién puede leer un acta restringida.
 */
export async function extractActaAttendees(
  notes: string,
  knownNames: string[],
): Promise<{ attendees: string[]; mentionedOnly: string[] }> {
  const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });

  const instruction = `Lee el encabezado de esta acta de reunión de AROCO y determina quiénes ASISTIERON.

Reglas:
- Busca secciones como "Participantes", "Asistentes", "Invitado(s)" o "Presentes".
- Incluye en "attendees" solo a quienes estuvieron en la reunión. Alguien anotado como "no pudo conectarse al inicio" sí asistió.
- Pon en "mentioned_only" a quien aparezca marcado como "mencionado", "referenciado" o de quien se hable sin haber estado.
- No incluyas al asistente de IA que transcribe el acta (p. ej. "Renata") como participante humano.
- Cuando un nombre corresponda a alguien de la lista de abajo, devuélvelo con esa ortografía EXACTA (con tildes).

Personas conocidas:
${knownNames.map((n) => `- ${n}`).join("\n")}

--- ACTA ---
${notes.slice(0, 6000)}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 1000,
    tools: [ATTENDEES_TOOL],
    tool_choice: { type: "tool", name: "extract_attendees" },
    messages: [{ role: "user", content: instruction }],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return { attendees: [], mentionedOnly: [] };
  const out = block.input as { attendees?: unknown; mentioned_only?: unknown };
  const clean = (v: unknown) =>
    (Array.isArray(v) ? v : []).map((x) => String(x).trim()).filter((x) => x.length > 0);
  return {
    attendees: clean(out.attendees),
    mentionedOnly: clean(out.mentioned_only),
  };
}

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

// ── Agrupación por tema ─────────────────────────────────────────────────────
//
//  Las actas llegan en el orden en que se habló. Un comité operativo trae 24
//  compromisos seguidos, saltando de precios a bodega y de vuelta a precios,
//  y para saber de qué se estaba hablando en cada punto hay que releer lo
//  anterior. Agruparlas por asunto es lo que pidió Álvaro.
//
//  Se hace en una pasada aparte, y no dentro de `extractActaTasks`, por dos
//  razones: se puede aplicar a las 51 actas que ya existen sin volver a crear
//  sus tareas, y si la agrupación sale mal se rehace sin tocar nada más. El
//  acta original nunca se modifica; los temas son una vista encima.

export interface TemaExtraido {
  titulo: string;
  resumen: string;
  /** Índices (base 0) de las tareas que caen en este tema. */
  tareas: number[];
}

const TEMAS_TOOL: Anthropic.Tool = {
  name: "agrupar_por_tema",
  description:
    "Agrupa el contenido de un acta por asunto tratado, y reparte sus tareas entre esos asuntos.",
  input_schema: {
    type: "object",
    properties: {
      temas: {
        type: "array",
        description:
          "Asuntos tratados en la reunión, en el orden en que conviene leerlos (del más importante al menos).",
        items: {
          type: "object",
          properties: {
            titulo: {
              type: "string",
              description:
                "Nombre corto del asunto, 2 a 6 palabras. Concreto: «Básculas en puntos de compra», no «Operaciones».",
            },
            resumen: {
              type: "string",
              description:
                "Lo que se dijo y se decidió sobre este asunto, en 1 a 4 frases. Toma el contenido del acta; no inventes.",
            },
            tareas: {
              type: "array",
              items: { type: "number" },
              description:
                "Índices de las tareas de la lista numerada que pertenecen a este asunto. Cada tarea va en UN solo tema. Lista vacía si el asunto no generó compromisos.",
            },
          },
          required: ["titulo", "resumen", "tareas"],
        },
      },
    },
    required: ["temas"],
  },
};

/**
 * Agrupa un acta por asunto.
 *
 * Recibe las tareas ya creadas —numeradas— para que el modelo las reparta por
 * índice en vez de reescribir sus nombres: así la agrupación no puede alterar
 * el texto de una tarea que alguien ya tiene asignada.
 */
export async function agruparActaPorTemas(
  notes: string,
  tareas: { nombre: string }[],
): Promise<TemaExtraido[]> {
  const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });

  const listaTareas = tareas.length
    ? tareas.map((t, i) => `${i}. ${t.nombre}`).join("\n")
    : "(esta acta no generó tareas)";

  const instruction = `Esta es un acta de reunión de AROCO (exportadora de cacao). Agrúpala por ASUNTO TRATADO.

Qué se busca: alguien que abra el acta tres semanas después quiere ver de qué se habló, no el orden en que se habló. Una reunión salta de un tema a otro y vuelve al primero; junta todo lo de cada asunto.

Reglas:
- Entre 2 y 8 temas. Si el acta trata una sola cosa, devuelve un solo tema.
- Los títulos van en español, concretos y cortos. «Precios de compra en Tumaco» sirve; «Varios» o «Operaciones» no.
- El resumen de cada tema toma lo que dice el acta: decisiones, cifras y acuerdos. No inventes ni añadas recomendaciones.
- Reparte las tareas por su ÍNDICE. Cada tarea va en exactamente un tema. Si una no encaja en ninguno, crea el tema que le corresponda.
- Ignora el encabezado de participantes y las notas de la transcripción.

Tareas ya registradas de esta acta:
${listaTareas}

--- ACTA ---
${notes.slice(0, 24000)}`;

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4000,
    tools: [TEMAS_TOOL],
    tool_choice: { type: "tool", name: "agrupar_por_tema" },
    messages: [{ role: "user", content: instruction }],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") return [];

  const out = block.input as { temas?: unknown };
  const crudos = Array.isArray(out.temas) ? out.temas : [];

  // Una tarea repartida en dos temas aparecería duplicada en pantalla y haría
  // dudar de si son dos compromisos distintos. Se queda con la primera.
  const usadas = new Set<number>();

  return crudos
    .map((t): TemaExtraido | null => {
      const o = t as { titulo?: unknown; resumen?: unknown; tareas?: unknown };
      const titulo = typeof o.titulo === "string" ? o.titulo.trim() : "";
      if (!titulo) return null;
      const indices = (Array.isArray(o.tareas) ? o.tareas : [])
        .map((n) => Number(n))
        .filter(
          (n) =>
            Number.isInteger(n) && n >= 0 && n < tareas.length && !usadas.has(n),
        );
      indices.forEach((n) => usadas.add(n));
      return {
        titulo,
        resumen: typeof o.resumen === "string" ? o.resumen.trim() : "",
        tareas: indices,
      };
    })
    .filter((t): t is TemaExtraido => t !== null);
}
