/**
 * Correo de «te asignaron tareas».
 *
 * Funciones puras —sin base ni red— para poder probar el agrupado y el texto
 * sin mandar nada. El envío vive en `tareas-asignadas.ts`.
 */
import { botonCorreo, escapar, fechaCorta, marcoCorreo, primerNombre, tarjetaTarea } from "./html";

export { fechaCorta };

export interface TareaCorreo {
  id: string;
  nombre: string;
  descripcion: string | null;
  /** YYYY-MM-DD o null. */
  vence: string | null;
}

export interface ActaCorreo {
  titulo: string;
  /** YYYY-MM-DD o null. */
  fecha: string | null;
}

export interface Asignacion {
  /** Id de la fila en `correos_tareas`. */
  id: string;
  miembroId: string;
  correo: string;
  nombre: string;
  actaId: string | null;
  acta: ActaCorreo | null;
  asignadoPor: string | null;
  tarea: TareaCorreo;
}

export interface GrupoCorreo {
  ids: string[];
  correo: string;
  nombre: string;
  acta: ActaCorreo | null;
  asignadoPor: string | null;
  tareas: TareaCorreo[];
}

/**
 * Un correo por persona y por acta. Las tareas sueltas (sin acta) de una
 * persona van juntas en otro. El orden de las tareas es el de entrada, que en
 * un acta es el orden en que se habló.
 */
export function agruparAsignaciones(filas: Asignacion[]): GrupoCorreo[] {
  const grupos = new Map<string, GrupoCorreo>();
  for (const f of filas) {
    const clave = `${f.miembroId}|${f.actaId ?? ""}`;
    const g = grupos.get(clave);
    if (g) {
      g.ids.push(f.id);
      g.tareas.push(f.tarea);
      // Si asignaron varias personas, no se nombra a ninguna: sería injusto
      // atribuirle todo el correo a la primera.
      if (g.asignadoPor !== f.asignadoPor) g.asignadoPor = null;
    } else {
      grupos.set(clave, {
        ids: [f.id],
        correo: f.correo,
        nombre: f.nombre,
        acta: f.acta,
        asignadoPor: f.asignadoPor,
        tareas: [f.tarea],
      });
    }
  }
  return [...grupos.values()];
}

export function armarCorreoTareas(
  g: GrupoCorreo,
  baseUrl: string,
  hoy = new Date(),
): { asunto: string; html: string; texto: string } {
  const n = g.tareas.length;
  const unaSola = n === 1 ? g.tareas[0]! : null;
  const acta = g.acta
    ? `«${g.acta.titulo}»${g.acta.fecha ? ` del ${fechaCorta(g.acta.fecha, hoy)}` : ""}`
    : null;

  const asunto = acta
    ? n === 1
      ? `Te quedó una tarea del acta ${acta}`
      : `Te quedaron ${n} tareas del acta ${acta}`
    : n === 1
      ? `Te asignaron una tarea: ${unaSola!.nombre}`
      : `Te asignaron ${n} tareas`;

  const intro = acta
    ? `De la reunión ${acta} ${n === 1 ? "te quedó esta tarea" : `te quedaron estas ${n} tareas`}:`
    : `${g.asignadoPor ? `${g.asignadoPor} te asignó` : "Te asignaron"} ${
        n === 1 ? "esta tarea" : `estas ${n} tareas`
      }:`;

  const base = baseUrl.replace(/\/+$/, "");
  const enlace = unaSola ? `${base}/tareas?tarea=${unaSola.id}` : `${base}/tareas`;
  const boton = unaSola ? "Abrir la tarea" : "Ver mis tareas";

  const html = marcoCorreo({
    seccion: "Tareas",
    cuerpo: `<p style="margin:0 0 16px;font-size:15px">Hola, ${escapar(primerNombre(g.nombre))}. ${escapar(intro)}</p>
<ul style="margin:0 0 20px;padding:0;list-style:none">
${g.tareas
  .map((t) => {
    const vence = fechaCorta(t.vence, hoy);
    return tarjetaTarea({
      nombre: t.nombre,
      detalle: t.descripcion ? t.descripcion.slice(0, 240) : null,
      nota: vence ? `Vence el ${vence}` : null,
    });
  })
  .join("\n")}
</ul>
${botonCorreo(boton, enlace)}`,
    pie: "Te llega porque eres responsable de estas tareas en el CRM de AROCO.",
  });

  const texto = [
    `Hola, ${primerNombre(g.nombre)}. ${intro}`,
    "",
    ...g.tareas.map((t) => {
      const vence = fechaCorta(t.vence, hoy);
      return `- ${t.nombre}${vence ? ` (vence el ${vence})` : ""}`;
    }),
    "",
    `${boton}: ${enlace}`,
  ].join("\n");

  return { asunto, html, texto };
}
