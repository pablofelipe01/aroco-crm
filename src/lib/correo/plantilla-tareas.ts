/**
 * Correo de «te asignaron tareas».
 *
 * Funciones puras —sin base ni red— para poder probar el agrupado y el texto
 * sin mandar nada. El envío vive en `tareas-asignadas.ts`.
 */

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

function escapar(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «14-sep». El año solo si no es el actual: en un correo de hoy sobra. */
export function fechaCorta(iso: string | null, hoy = new Date()): string | null {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return null;
  const dia = `${Number(m[3])}-${MESES[Number(m[2]) - 1]}`;
  return Number(m[1]) === hoy.getFullYear() ? dia : `${dia}-${m[1]}`;
}

function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
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

  const html = `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px">
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#78716c">AROCO · Tareas</p>
<p style="margin:0 0 16px;font-size:15px">Hola, ${escapar(primerNombre(g.nombre))}. ${escapar(intro)}</p>
<ul style="margin:0 0 20px;padding:0;list-style:none">
${g.tareas
  .map((t) => {
    const vence = fechaCorta(t.vence, hoy);
    const desc = t.descripcion ? t.descripcion.slice(0, 240) : "";
    return `<li style="margin:0 0 10px;padding:10px 12px;border:1px solid #e7e5e4;border-radius:8px">
<p style="margin:0;font-size:14px;font-weight:600">${escapar(t.nombre)}</p>
${desc ? `<p style="margin:4px 0 0;font-size:13px;color:#57534e">${escapar(desc)}</p>` : ""}
${vence ? `<p style="margin:4px 0 0;font-size:12px;color:#78716c">Vence el ${escapar(vence)}</p>` : ""}
</li>`;
  })
  .join("\n")}
</ul>
<a href="${escapar(enlace)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#7c4a2d;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600">${boton}</a>
</td></tr></table>
<p style="max-width:560px;margin:12px auto 0;font-size:11px;color:#a8a29e">Te llega porque eres responsable de estas tareas en el CRM de AROCO.</p>
</body></html>`;

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
