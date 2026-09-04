/**
 * Archivo mensual de tareas completadas.
 *
 * La revisión del 1-sep-2026 pidió que lo completado se archive mes a mes y no
 * se borre. El archivo NO es una marca guardada en la tarea: se DEDUCE de
 * `completed_at`. Una tarea está archivada si está completada y se completó en
 * un mes anterior al corriente.
 *
 * Se hace así porque una marca guardada hay que mantenerla —un cron, un
 * proceso de cierre de mes— y esos se caen sin que nadie se entere; el día que
 * fallara, el tablero seguiría mostrando lo de marzo como si fuera de hoy.
 * Una fecha, en cambio, no se puede quedar quieta.
 *
 * Todo se calcula en hora de Bogotá. Una tarea cerrada a las 8 de la noche del
 * 31 de agosto es del archivo de AGOSTO; en UTC ya sería 1 de septiembre y
 * caería en el mes siguiente, que es justo la clase de descuadre que nadie
 * sabría explicar mirando la pantalla.
 */

const ZONA = "America/Bogota";

/** Mes calendario en Bogotá, como «2026-08». */
export function mesEnBogota(valor: string | Date): string {
  const d = typeof valor === "string" ? new Date(valor) : valor;
  if (Number.isNaN(d.getTime())) return "";
  // `en-CA` con año y mes numéricos da «2026-08», que además ordena solo.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
  }).format(d);
}

/** Lo mínimo que hace falta saber de una tarea para archivarla. */
export type Archivable = {
  status: string;
  completed_at: string | null;
};

/**
 * ¿Ya se archivó?
 *
 * Completada este mes NO se archiva: sigue en el tablero, donde la gente
 * espera ver lo que acaba de cerrar.
 */
export function estaArchivada(t: Archivable, hoy: Date = new Date()): boolean {
  if (t.status !== "done" || !t.completed_at) return false;
  return mesEnBogota(t.completed_at) < mesEnBogota(hoy);
}

/**
 * Meses que tienen algo archivado, del más reciente al más viejo.
 *
 * El mes corriente queda fuera aunque tenga tareas completadas: todavía no es
 * archivo.
 */
export function mesesArchivados(
  completados: (string | null)[],
  hoy: Date = new Date(),
): string[] {
  const actual = mesEnBogota(hoy);
  const meses = new Set<string>();
  for (const c of completados) {
    if (!c) continue;
    const m = mesEnBogota(c);
    if (m && m < actual) meses.add(m);
  }
  return [...meses].sort().reverse();
}

/**
 * Límites de un mes «2026-08» como instantes UTC, para consultar la base.
 *
 * `desde` es inclusivo y `hasta` exclusivo — el primer instante del mes
 * siguiente. Con un `hasta` inclusivo habría que elegir entre perder el último
 * segundo del mes o repetirlo en el mes que sigue.
 *
 * El −05:00 es fijo a propósito: Colombia no tiene horario de verano, así que
 * no hay nada que consultar en una tabla de zonas.
 */
export function rangoDelMes(mes: string): { desde: string; hasta: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(mes);
  if (!m) return null;
  const anio = Number(m[1]);
  const numero = Number(m[2]);
  if (numero < 1 || numero > 12) return null;

  const siguiente =
    numero === 12 ? { anio: anio + 1, mes: 1 } : { anio, mes: numero + 1 };
  const dosDigitos = (n: number) => String(n).padStart(2, "0");

  return {
    desde: new Date(`${m[1]}-${m[2]}-01T00:00:00-05:00`).toISOString(),
    hasta: new Date(
      `${siguiente.anio}-${dosDigitos(siguiente.mes)}-01T00:00:00-05:00`,
    ).toISOString(),
  };
}

/** «2026-08» → «agosto de 2026». */
export function etiquetaMes(mes: string, locale = "es-CO"): string {
  const r = rangoDelMes(mes);
  if (!r) return mes;
  return new Intl.DateTimeFormat(locale, {
    timeZone: ZONA,
    month: "long",
    year: "numeric",
  }).format(new Date(r.desde));
}
