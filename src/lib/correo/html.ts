/**
 * Piezas comunes de los correos: escape, fechas cortas y el marco.
 *
 * Los colores van en hex porque un cliente de correo no lee las variables
 * CSS del design system; son los mismos tonos del tema claro.
 */

export function escapar(s: string): string {
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

export function primerNombre(nombre: string): string {
  return nombre.trim().split(/\s+/)[0] ?? nombre;
}

/** Tarjeta de una tarea dentro de una lista del correo. */
export function tarjetaTarea(t: { nombre: string; detalle?: string | null; nota?: string | null }): string {
  return `<li style="margin:0 0 10px;padding:10px 12px;border:1px solid #e7e5e4;border-radius:8px">
<p style="margin:0;font-size:14px;font-weight:600">${escapar(t.nombre)}</p>
${t.detalle ? `<p style="margin:4px 0 0;font-size:13px;color:#57534e">${escapar(t.detalle)}</p>` : ""}
${t.nota ? `<p style="margin:4px 0 0;font-size:12px;color:#78716c">${escapar(t.nota)}</p>` : ""}
</li>`;
}

export function botonCorreo(texto: string, enlace: string): string {
  return `<a href="${escapar(enlace)}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#7c4a2d;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600">${escapar(texto)}</a>`;
}

/** Marco del correo. `cuerpo` ya viene escapado. */
export function marcoCorreo(p: { seccion: string; cuerpo: string; pie: string }): string {
  return `<!doctype html>
<html lang="es"><body style="margin:0;padding:24px;background:#f6f5f2;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1917">
<table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:12px">
<tr><td style="padding:24px">
<p style="margin:0 0 4px;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#78716c">AROCO · ${escapar(p.seccion)}</p>
${p.cuerpo}
</td></tr></table>
<p style="max-width:560px;margin:12px auto 0;font-size:11px;color:#a8a29e">${escapar(p.pie)}</p>
</body></html>`;
}
