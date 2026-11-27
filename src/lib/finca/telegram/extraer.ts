import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import type { CatalogoCampo } from "@/lib/finca/captura-equipos";
import type { Extraccion } from "./reporte";

const MODEL = serverEnv.ANTHROPIC_MODEL || "claude-opus-5";

const numero = { type: ["number", "null"] } as const;
const texto = { type: ["string", "null"] } as const;

function herramienta(cat: CatalogoCampo): Anthropic.Tool {
  const nombres = cat.empleados.map((e) => e.nombre);
  const labores = cat.labores.map((l) => l.nombre);
  const equipos = (cat.equipos ?? []).map((q) => q.codigo);
  return {
    name: "registrar_reporte",
    description: "Devuelve lo que el trabajador reportó, separado por labor y por equipo.",
    input_schema: {
      type: "object",
      properties: {
        es_reporte: {
          type: "boolean",
          description:
            "true si el mensaje cuenta trabajo hecho (o corrige/completa el reporte anterior). false si es un saludo, una pregunta u otra cosa.",
        },
        fecha: {
          type: ["string", "null"],
          description: "Día de las labores, YYYY-MM-DD. null si no dice (= hoy). «ayer» = el día anterior a hoy.",
        },
        labores: {
          type: "array",
          items: {
            type: "object",
            properties: {
              trabajadores: {
                type: "array",
                items: { type: "string" },
                description: `Quién la hizo, con el nombre EXACTO de la lista: ${nombres.join(", ")}. Si nombra a alguien que no está, escríbalo tal cual. Vacío si habla de sí mismo.`,
              },
              labor: {
                type: ["string", "null"],
                description: `Nombre EXACTO del catálogo: ${labores.join(" | ")}. «Recoger mazorca» = Cosecha. «Quebrar/partir mazorca, sacar la baba» = Desgrane. «Guadañar, rozar» = Control mecánico de malezas. «Fumigar maleza» = Control químico de malezas. null si no se sabe.`,
              },
              valvulas: {
                type: "array",
                items: { type: "string" },
                description: `Válvulas (lotes): ${cat.valvulas.join(", ")}. «de la 14 a la 16» = 14, 15, 16. Si dice una que no está, escríbala tal cual.`,
              },
              sitio: { ...texto, description: "Sitio que no es válvula: Quinta, Vivero, Lago, Invernadero, Bodega…" },
              hora_inicio: { ...texto, description: "HH:MM en 24 h. «a las 7» de la mañana = 07:00; «hasta las 3» de la tarde = 15:00." },
              hora_fin: { ...texto, description: "HH:MM en 24 h." },
              horas: { ...numero, description: "Horas trabajadas si las dice en vez de inicio y fin. «Medio día» = 4; «todo el día» = 8 solo si no dice horas." },
              cantidad: { ...numero, description: "Cantidad en la unidad de la labor (árboles podados, nidos, estacas…). No para Cosecha ni Desgrane." },
              sanas: { ...numero, description: "Cosecha: mazorcas sanas. Desgrane: kilos de baba calidad A (sana)." },
              pasador_monilia: { ...numero, description: "Cosecha: mazorcas con pasador o monilia." },
              negras: { ...numero, description: "Cosecha: mazorcas negras. Desgrane: kilos de baba calidad C (negra)." },
              observaciones: { ...texto, description: "Algo que dijo y no cabe en lo anterior (novedades, daños, faltantes). Corto." },
            },
            required: [
              "trabajadores", "labor", "valvulas", "sitio", "hora_inicio", "hora_fin", "horas",
              "cantidad", "sanas", "pasador_monilia", "negras", "observaciones",
            ],
          },
        },
        usos_equipo: {
          type: "array",
          description:
            "Uso de máquinas. El riego con el motor va AQUÍ (equipo motor-riego, con válvulas y horas de motor) Y además como labor «Riego» con las horas de la persona. Guadaña, motosierra y bombas: aquí sus horas, y la labor aparte.",
          items: {
            type: "object",
            properties: {
              equipo: { type: ["string", "null"], enum: [...equipos, null], description: "Código del equipo." },
              trabajador: { ...texto, description: "Quién lo usó, nombre exacto de la lista; null si es quien habla." },
              valvulas: { type: "array", items: { type: "string" } },
              hora_inicio: texto,
              hora_fin: texto,
              horas: numero,
              carga_galones: { ...numero, description: "Galones de combustible que le echó, si lo dice." },
              observaciones: texto,
            },
            required: ["equipo", "trabajador", "valvulas", "hora_inicio", "hora_fin", "horas", "carga_galones", "observaciones"],
          },
        },
        dudas: {
          type: "array",
          items: { type: "string" },
          description:
            "Preguntas MUY cortas y sencillas, de tú a usted, para lo que no se entendió o se contradice (p. ej. «¿Las 800 mazorcas eran todas sanas?»). NO pregunte por horas, labor o trabajador faltantes: eso lo pregunta el sistema. Vacío si todo está claro.",
        },
        respuesta: {
          type: ["string", "null"],
          description: "Solo si es_reporte = false: respuesta corta y amable, recordando cómo mandar el reporte.",
        },
      },
      required: ["es_reporte", "fecha", "labores", "usos_equipo", "dudas", "respuesta"],
    },
  };
}

export async function extraer(opts: {
  texto: string;
  cat: CatalogoCampo;
  quien: string;
  porOtros: boolean;
  hoy: string;
  /** El reporte que estaba esperando confirmación o respuestas. */
  anterior?: { extraccion: Extraccion; preguntas: string[] } | null;
}): Promise<Extraccion> {
  const anthropic = new Anthropic({ apiKey: serverEnv.ANTHROPIC_API_KEY });
  const d = new Date(`${opts.hoy}T12:00:00Z`);
  const dia = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"][d.getUTCDay()];

  const sistema = [
    "Usted lee los reportes diarios que los trabajadores de una finca de cacao en Colombia mandan por audio (ya pasado a texto, puede traer errores de transcripción) y los pasa a datos.",
    `Hoy es ${dia} ${opts.hoy}. Quien habla: ${opts.quien}.`,
    opts.porOtros
      ? "Esta persona es supervisora: suele reportar por OTROS trabajadores; ponga en cada labor a quién corresponde."
      : "Esta persona es trabajador y reporta lo suyo.",
    "Una cuadrilla («con William cosechamos 800») = una labor con todos los nombres; la cifra es de cada uno.",
    "No invente datos: lo que no dijo queda en null. Corrija errores obvios de transcripción con el catálogo (nombres, labores, válvulas).",
    "Si un número es ambiguo (¿horas o válvula?), use el contexto; si sigue la duda, póngala en «dudas».",
  ].join("\n");

  const contenido = opts.anterior
    ? [
        "Ya había un reporte en curso. Esto es lo que se había entendido:",
        JSON.stringify(opts.anterior.extraccion),
        opts.anterior.preguntas.length
          ? `Se le preguntó: ${opts.anterior.preguntas.join(" / ")}`
          : "Se le pidió confirmar.",
        "",
        `Ahora dice: «${opts.texto}»`,
        "",
        "Devuelva el reporte COMPLETO actualizado: si responde una pregunta, complete; si corrige algo, cámbielo; si cuenta otra labor, agréguela. Si empieza un reporte de otra fecha que nada tiene que ver, devuelva solo lo nuevo.",
      ].join("\n")
    : `Mensaje: «${opts.texto}»`;

  const r = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 3000,
    // Opus 5 razona por defecto y eso gasta max_tokens; con tool_choice forzado no hace falta.
    thinking: { type: "disabled" },
    system: sistema,
    tools: [herramienta(opts.cat)],
    tool_choice: { type: "tool", name: "registrar_reporte" },
    messages: [{ role: "user", content: contenido }],
  });
  const uso = r.content.find((b) => b.type === "tool_use");
  if (!uso || uso.type !== "tool_use") throw new Error("Claude no devolvió el reporte");
  const x = uso.input as Partial<Extraccion>;
  return {
    es_reporte: Boolean(x.es_reporte),
    fecha: x.fecha ?? null,
    labores: Array.isArray(x.labores) ? x.labores : [],
    usos_equipo: Array.isArray(x.usos_equipo) ? x.usos_equipo : [],
    dudas: Array.isArray(x.dudas) ? x.dudas : [],
    respuesta: x.respuesta ?? null,
  };
}

