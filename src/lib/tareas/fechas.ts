/**
 * Cuándo arrancó una tarea y cuándo vence, para poder decirlo en el tablero.
 *
 * Desde la migración 0079 toda tarea nueva nace con `start_date`, pero las 539
 * anteriores no lo tienen: no se rellenaron porque ponerles una fecha que
 * nadie decidió habría sido inventar el dato. El problema es que enseñar solo
 * `start_date` dejaría el 94 % del tablero en blanco justo en la columna que
 * se pidió ver.
 *
 * La salida no es rellenar la base, es DECIR LO QUE SE SABE de cada una. Si la
 * tarea trae su fecha de inicio, esa; si no, la de creación, dicha como
 * creación y no como inicio. «Creada el 12 de agosto» es cierto y sitúa la
 * tarea en el tiempo; «inicio 12 de agosto» sería una afirmación que nadie
 * hizo.
 */

const ZONA = "America/Bogota";

/**
 * Día calendario de un instante, en hora de Bogotá, como «2026-09-04».
 *
 * `created_at` es un timestamp con zona: una tarea creada a las siete de la
 * noche en Bogotá es del 4 de septiembre, aunque en UTC ya sea el 5.
 */
export function diaEnBogota(valor: string): string | null {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type Fechada = {
  start_date: string | null;
  created_at: string;
  due_date: string | null;
};

export type FechasTarea = {
  /** Día en que arrancó, o en que se registró si nunca se declaró. */
  inicio: string | null;
  /**
   * De dónde sale ese día. `declarado` es una fecha que alguien puso;
   * `creacion` es cuándo entró al CRM, que es otra cosa y hay que decirlo.
   */
  origen: "declarado" | "creacion";
  vence: string | null;
};

export function fechasDeTarea(t: Fechada): FechasTarea {
  if (t.start_date) {
    return { inicio: t.start_date, origen: "declarado", vence: t.due_date };
  }
  return {
    inicio: diaEnBogota(t.created_at),
    origen: "creacion",
    vence: t.due_date,
  };
}

/**
 * Días que lleva abierta.
 *
 * Es lo que de verdad se quiere saber al mirar una fecha de inicio en un
 * tablero: no «cuándo fue» sino «cuánto lleva». Se cuenta hasta hoy para lo
 * que sigue abierto y hasta el cierre para lo que ya se completó — una tarea
 * terminada no sigue acumulando días.
 */
export function diasAbierta(
  inicio: string | null,
  hasta: string,
): number | null {
  if (!inicio) return null;
  const a = new Date(`${inicio}T00:00:00Z`).getTime();
  const b = new Date(
    hasta.length > 10 ? hasta : `${hasta}T00:00:00Z`,
  ).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const dias = Math.floor((b - a) / 86_400_000);
  // Una fecha de inicio futura no lleva días abierta; devolver un negativo
  // pintaría «lleva −3 días» en pantalla.
  return dias >= 0 ? dias : null;
}
