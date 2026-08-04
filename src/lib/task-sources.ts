/**
 * De dónde nace una tarea.
 *
 * Era un campo de texto libre y acabó con doce valores distintos para ~200
 * tareas: descripciones enteras metidas ahí, el mismo proyecto escrito de dos
 * formas, y una cola de valores de una sola tarea que hacía inservible el
 * filtro. Con una lista corta el campo vuelve a agrupar.
 *
 * Para añadir o quitar opciones basta con editar esta lista: el formulario y
 * el filtro de tareas la leen de aquí.
 */
export const TASK_SOURCES = [
  "Comité Operativo",
  "Comité Comercial",
  "Comité Financiero",
  "Reunión",
  "Llamada",
  "Correo",
  "WhatsApp",
  "Visita a finca",
  "Certificación Rainforest",
] as const;

/**
 * Orígenes que pone el sistema al ingerir un acta. No se ofrecen en el
 * formulario —nadie los teclea a mano— pero se reconocen para que al editar
 * una tarea creada desde un acta el valor no se pierda ni caiga en "Otro".
 */
export const SYSTEM_TASK_SOURCES = ["Acta", "Acta (email)"] as const;

/** Marca de la opción libre en el desplegable. */
export const OTRO_ORIGEN = "__otro__";

export type TaskSource = (typeof TASK_SOURCES)[number];

/** ¿Es un valor de la lista (propia o del sistema)? */
export function isKnownSource(value: string | null | undefined): boolean {
  if (!value) return false;
  return (
    (TASK_SOURCES as readonly string[]).includes(value) ||
    (SYSTEM_TASK_SOURCES as readonly string[]).includes(value)
  );
}
