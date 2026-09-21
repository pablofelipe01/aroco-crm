/**
 * Resúmenes de tareas por correo, como Asana: uno diario para cada persona y
 * uno semanal para cada jefe de área (acordado en la reunión del 15-sep).
 *
 * Funciones puras —sin base ni red—: clasifican y arman el texto. Las fechas
 * son días de calendario en hora de Bogotá, como «2026-09-21»; el que llama
 * decide qué día es hoy. El envío vive en `enviar-resumenes.ts`.
 */
import { botonCorreo, escapar, fechaCorta, marcoCorreo, primerNombre, tarjetaTarea } from "./html";

export interface TareaResumen {
  id: string;
  nombre: string;
  /** YYYY-MM-DD o null. */
  vence: string | null;
  /** Cuándo se le asignó a esta persona (ISO). */
  asignadaEl: string;
}

/** Suma días a una fecha YYYY-MM-DD sin pasar por la zona horaria. */
export function sumarDias(iso: string, dias: number): string {
  const [a, m, d] = iso.split("-").map(Number);
  const f = new Date(Date.UTC(a!, m! - 1, d! + dias));
  return f.toISOString().slice(0, 10);
}

/** Días entre dos fechas YYYY-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  const [a1, m1, d1] = a.split("-").map(Number);
  const [a2, m2, d2] = b.split("-").map(Number);
  return Math.round((Date.UTC(a2!, m2! - 1, d2!) - Date.UTC(a1!, m1! - 1, d1!)) / 86_400_000);
}

/** Día de la semana de una fecha YYYY-MM-DD: 0 domingo … 6 sábado. */
export function diaSemana(iso: string): number {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a!, m! - 1, d!)).getUTCDay();
}

export interface ClasificacionDiaria {
  vencidas: TareaResumen[];
  hoy: TareaResumen[];
  semana: TareaResumen[];
  nuevas: TareaResumen[];
  abiertas: number;
}

/**
 * Reparte las tareas abiertas de una persona. Cada tarea aparece una sola
 * vez: una tarea nueva que ya vence hoy va en «hoy», que es lo urgente.
 *
 * `desdeNuevas` es el instante desde el que una asignación cuenta como nueva:
 * el lunes viene desde el viernes, porque el fin de semana no hay resumen.
 */
export function clasificarDiario(
  tareas: TareaResumen[],
  hoy: string,
  desdeNuevas: string,
): ClasificacionDiaria {
  const enSemana = sumarDias(hoy, 7);
  const r: ClasificacionDiaria = { vencidas: [], hoy: [], semana: [], nuevas: [], abiertas: tareas.length };
  for (const t of tareas) {
    if (t.vence && t.vence < hoy) r.vencidas.push(t);
    else if (t.vence === hoy) r.hoy.push(t);
    else if (t.vence && t.vence <= enSemana) r.semana.push(t);
    else if (t.asignadaEl >= desdeNuevas) r.nuevas.push(t);
  }
  const porFecha = (a: TareaResumen, b: TareaResumen) => (a.vence ?? "").localeCompare(b.vence ?? "");
  r.vencidas.sort(porFecha);
  r.semana.sort(porFecha);
  return r;
}

export function hayAlgoQueContar(c: ClasificacionDiaria): boolean {
  return c.vencidas.length + c.hoy.length + c.semana.length + c.nuevas.length > 0;
}

/** Hasta cuántas tareas se listan por sección antes de decir «y N más». */
const TOPE = 10;

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

interface Seccion {
  titulo: string;
  tareas: TareaResumen[];
  nota: (t: TareaResumen) => string | null;
}

function seccionesDiarias(c: ClasificacionDiaria, hoy: string, ahora: Date): Seccion[] {
  const todas: Seccion[] = [
    {
      titulo: "Vencidas",
      tareas: c.vencidas,
      nota: (t) => {
        const d = diasEntre(t.vence!, hoy);
        return `Venció hace ${plural(d, "día", "días")} (${fechaCorta(t.vence, ahora)})`;
      },
    },
    { titulo: "Vencen hoy", tareas: c.hoy, nota: () => null },
    {
      titulo: "Esta semana",
      tareas: c.semana,
      nota: (t) => `Vence el ${fechaCorta(t.vence, ahora)}`,
    },
    {
      titulo: "Nuevas",
      tareas: c.nuevas,
      nota: (t) => (t.vence ? `Vence el ${fechaCorta(t.vence, ahora)}` : "Sin fecha de vencimiento"),
    },
  ];
  return todas.filter((s) => s.tareas.length > 0);
}

export function armarResumenDiario(
  p: { nombre: string; clasificacion: ClasificacionDiaria; hoy: string },
  baseUrl: string,
  ahora = new Date(),
): { asunto: string; html: string; texto: string } {
  const c = p.clasificacion;
  const partes = [
    c.vencidas.length ? plural(c.vencidas.length, "vencida", "vencidas") : null,
    c.hoy.length ? `${c.hoy.length} ${c.hoy.length === 1 ? "vence" : "vencen"} hoy` : null,
    c.semana.length ? `${c.semana.length} esta semana` : null,
    c.nuevas.length ? plural(c.nuevas.length, "nueva", "nuevas") : null,
  ].filter(Boolean);
  const asunto = `Tus tareas de hoy: ${partes.join(", ")}`;
  const intro = `Tienes ${plural(c.abiertas, "tarea abierta", "tareas abiertas")}. Esto es lo que pide atención:`;
  const enlace = `${baseUrl.replace(/\/+$/, "")}/tareas`;
  const secciones = seccionesDiarias(c, p.hoy, ahora);

  const html = marcoCorreo({
    seccion: "Resumen del día",
    cuerpo: `<p style="margin:0 0 16px;font-size:15px">Hola, ${escapar(primerNombre(p.nombre))}. ${escapar(intro)}</p>
${secciones
  .map(
    (s) => `<p style="margin:16px 0 8px;font-size:13px;font-weight:700;color:#44403c">${escapar(s.titulo)} (${s.tareas.length})</p>
<ul style="margin:0;padding:0;list-style:none">
${s.tareas.slice(0, TOPE).map((t) => tarjetaTarea({ nombre: t.nombre, nota: s.nota(t) })).join("\n")}
</ul>${s.tareas.length > TOPE ? `<p style="margin:0 0 8px;font-size:12px;color:#78716c">y ${s.tareas.length - TOPE} más</p>` : ""}`,
  )
  .join("\n")}
<p style="margin:20px 0 0">${botonCorreo("Ver mis tareas", enlace)}</p>`,
    pie: "Resumen diario de tus tareas en el CRM de AROCO. Solo llega los días en que hay algo que contar.",
  });

  const texto = [
    `Hola, ${primerNombre(p.nombre)}. ${intro}`,
    ...secciones.flatMap((s) => [
      "",
      `${s.titulo} (${s.tareas.length})`,
      ...s.tareas.slice(0, TOPE).map((t) => {
        const nota = s.nota(t);
        return `- ${t.nombre}${nota ? ` — ${nota}` : ""}`;
      }),
      ...(s.tareas.length > TOPE ? [`  y ${s.tareas.length - TOPE} más`] : []),
    ]),
    "",
    `Ver mis tareas: ${enlace}`,
  ].join("\n");

  return { asunto, html, texto };
}

// ── Semanal por jefe ────────────────────────────────────────────────────────

export interface PersonaSemana {
  nombre: string;
  abiertas: TareaResumen[];
  /** Ids de las tareas que cerró en los últimos 7 días. */
  cerradasSemana: string[];
}

export interface FilaSemana {
  nombre: string;
  abiertas: number;
  vencidas: number;
  sinFecha: number;
  cerradas: number;
  /** Las más atrasadas, para saber de qué se habla. */
  atrasadas: TareaResumen[];
  /** Ids, para que los totales no cuenten dos veces una tarea compartida. */
  ids: { abiertas: string[]; vencidas: string[]; cerradas: string[] };
}

export function resumirSemana(personas: PersonaSemana[], hoy: string): FilaSemana[] {
  return personas
    .map((p) => {
      const vencidas = p.abiertas
        .filter((t) => t.vence && t.vence < hoy)
        .sort((a, b) => a.vence!.localeCompare(b.vence!));
      return {
        nombre: p.nombre,
        abiertas: p.abiertas.length,
        vencidas: vencidas.length,
        sinFecha: p.abiertas.filter((t) => !t.vence).length,
        cerradas: p.cerradasSemana.length,
        atrasadas: vencidas.slice(0, 3),
        ids: {
          abiertas: p.abiertas.map((t) => t.id),
          vencidas: vencidas.map((t) => t.id),
          cerradas: p.cerradasSemana,
        },
      };
    })
    // Quien no tiene nada abierto ni cerró nada no aporta a la lectura.
    .filter((f) => f.abiertas > 0 || f.cerradas > 0)
    .sort((a, b) => b.vencidas - a.vencidas || b.abiertas - a.abiertas || a.nombre.localeCompare(b.nombre));
}

export function armarResumenSemanal(
  p: { nombre: string; filas: FilaSemana[]; hoy: string },
  baseUrl: string,
  ahora = new Date(),
): { asunto: string; html: string; texto: string } {
  // Tareas distintas: una tarea de dos personas del área es UNA tarea del área.
  const total = (k: "abiertas" | "vencidas" | "cerradas") =>
    new Set(p.filas.flatMap((f) => f.ids[k])).size;
  const vencidas = total("vencidas");
  const cerradas = total("cerradas");
  const abiertas = total("abiertas");
  const asunto = `Tu equipo esta semana: ${plural(vencidas, "vencida", "vencidas")}, ${plural(cerradas, "cerrada", "cerradas")}`;
  const intro = `Tu equipo tiene ${plural(abiertas, "tarea abierta", "tareas abiertas")}; ${plural(vencidas, "está vencida", "están vencidas")} y en los últimos 7 días ${cerradas === 1 ? "se cerró 1" : `se cerraron ${cerradas}`}.`;
  const enlace = `${baseUrl.replace(/\/+$/, "")}/tareas`;
  const celda = "padding:6px 8px;border-bottom:1px solid #e7e5e4;font-size:13px";
  const num = `${celda};text-align:right;font-variant-numeric:tabular-nums`;

  const html = marcoCorreo({
    seccion: "Resumen semanal",
    cuerpo: `<p style="margin:0 0 16px;font-size:15px">Hola, ${escapar(primerNombre(p.nombre))}. ${escapar(intro)}</p>
<table role="presentation" width="100%" style="border-collapse:collapse;margin:0 0 16px">
<tr style="color:#78716c;font-size:12px"><th align="left" style="${celda}">Persona</th><th align="right" style="${num}">Abiertas</th><th align="right" style="${num}">Vencidas</th><th align="right" style="${num}">Sin fecha</th><th align="right" style="${num}">Cerradas</th></tr>
${p.filas
  .map(
    (f) => `<tr><td style="${celda}">${escapar(f.nombre)}</td><td style="${num}">${f.abiertas}</td><td style="${num}${f.vencidas ? ";color:#b45309;font-weight:700" : ""}">${f.vencidas}</td><td style="${num}">${f.sinFecha}</td><td style="${num}">${f.cerradas}</td></tr>`,
  )
  .join("\n")}
</table>
${p.filas
  .filter((f) => f.atrasadas.length > 0)
  .map(
    // Nombre completo: en el equipo hay dos John y dos Juan.
    (f) => `<p style="margin:16px 0 8px;font-size:13px;font-weight:700;color:#44403c">Lo más atrasado de ${escapar(f.nombre)}</p>
<ul style="margin:0;padding:0;list-style:none">
${f.atrasadas
  .map((t) =>
    tarjetaTarea({
      nombre: t.nombre,
      nota: `Venció hace ${plural(diasEntre(t.vence!, p.hoy), "día", "días")} (${fechaCorta(t.vence, ahora)})`,
    }),
  )
  .join("\n")}
</ul>`,
  )
  .join("\n")}
<p style="margin:20px 0 0">${botonCorreo("Ver las tareas del equipo", enlace)}</p>`,
    pie: "Resumen semanal de las tareas de tu área en el CRM de AROCO. Llega los lunes.",
  });

  const texto = [
    `Hola, ${primerNombre(p.nombre)}. ${intro}`,
    "",
    ...p.filas.map(
      (f) =>
        `- ${f.nombre}: ${plural(f.abiertas, "abierta", "abiertas")}, ${plural(f.vencidas, "vencida", "vencidas")}, ${f.sinFecha} sin fecha, ${plural(f.cerradas, "cerrada", "cerradas")}`,
    ),
    ...p.filas
      .filter((f) => f.atrasadas.length > 0)
      .flatMap((f) => [
        "",
        `Lo más atrasado de ${f.nombre}:`,
        ...f.atrasadas.map((t) => `- ${t.nombre} (venció el ${fechaCorta(t.vence, ahora)})`),
      ]),
    "",
    `Ver las tareas del equipo: ${enlace}`,
  ].join("\n");

  return { asunto, html, texto };
}
