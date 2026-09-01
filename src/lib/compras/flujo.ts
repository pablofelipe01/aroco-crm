/**
 * En qué punto del flujo está una solicitud de compra.
 *
 * El enum `compra_estado` de la base (Borrador · Pendiente · Aprobada ·
 * Rechazada) describe la APROBACIÓN, no el ciclo de vida. El pago y la entrega
 * se guardan aparte —`pagada_en`, `recibida_en`— y a propósito: no siempre
 * ocurren en ese orden, y forzar una secuencia obligaría a mentir en el
 * registro (0051).
 *
 * El efecto es que «Aprobada» tapa tres situaciones muy distintas: aprobada y
 * sin comprar, pagada y esperando que llegue, y recibida y cerrada. Es
 * justo lo que Luis Ernesto echaba en falta: saber qué está abierto, qué está
 * en proceso y qué terminó.
 *
 * La etapa se DERIVA, no se guarda. Guardarla crearía una segunda verdad que
 * puede contradecir a las fechas, y entonces habría que decidir cuál manda.
 */

export const ETAPAS = [
  "Borrador",
  "Esperando aprobación",
  "Por comprar",
  "Por recibir",
  "Recibida",
  "Rechazada",
] as const;

export type Etapa = (typeof ETAPAS)[number];

/** Los tres grupos que pidió Luis Ernesto, encima de las etapas finas. */
export type Grupo = "Abierta" | "En proceso" | "Finalizada";

export const GRUPO_DE: Record<Etapa, Grupo> = {
  Borrador: "Abierta",
  "Esperando aprobación": "Abierta",
  "Por comprar": "En proceso",
  "Por recibir": "En proceso",
  Recibida: "Finalizada",
  Rechazada: "Finalizada",
};

/** Lo mínimo para situar una solicitud; sirve igual para una fila de la base. */
export type SolicitudFlujo = {
  estado: string;
  pagada_en?: string | null;
  recibida_en?: string | null;
};

export function etapaDe(s: SolicitudFlujo): Etapa {
  if (s.estado === "Rechazada") return "Rechazada";
  if (s.estado === "Borrador") return "Borrador";
  if (s.estado === "Pendiente") return "Esperando aprobación";

  // Aprobada. Manda la entrega: lo que cierra una compra es que llegue, no que
  // se pague. Una solicitud pagada y sin recibir sigue pendiente de alguien.
  if (s.recibida_en) return "Recibida";
  if (s.pagada_en) return "Por recibir";
  return "Por comprar";
}

export function grupoDe(s: SolicitudFlujo): Grupo {
  return GRUPO_DE[etapaDe(s)];
}

/**
 * Qué falta para que avance. En una vista de gestión, el estado sin la acción
 * siguiente obliga a abrir cada solicitud para saber a quién le toca mover.
 */
export function siguientePaso(s: SolicitudFlujo, cotizaciones: number): string {
  switch (etapaDe(s)) {
    case "Borrador":
      return cotizaciones === 0
        ? "Súbele cotizaciones y mándala a aprobación"
        : "Mándala a aprobación";
    case "Esperando aprobación":
      return cotizaciones === 0
        ? "Falta cotización para poder comparar"
        : "Esperando visto bueno";
    case "Por comprar":
      return "Aprobada: falta comprar y registrar el pago";
    case "Por recibir":
      return "Pagada: falta registrar que llegó";
    case "Recibida":
      return "Cerrada";
    case "Rechazada":
      return "Rechazada";
  }
}

/**
 * Días parado desde el último movimiento conocido.
 *
 * Una vista de gestión sirve para ver qué lleva semanas quieto, no para contar
 * cuántas hay. Se mide desde el hito más reciente de la propia solicitud, no
 * desde que se creó: una aprobada ayer no lleva un mes parada aunque se pidiera
 * hace un mes.
 */
export function diasQuieta(
  s: SolicitudFlujo & { created_at: string; aprobada_en?: string | null },
  ahora: Date = new Date(),
): number {
  const hitos = [s.created_at, s.aprobada_en, s.pagada_en, s.recibida_en]
    .filter((x): x is string => !!x)
    .map((x) => new Date(x).getTime())
    .filter((n) => Number.isFinite(n));
  if (hitos.length === 0) return 0;
  const ultimo = Math.max(...hitos);
  return Math.max(0, Math.floor((ahora.getTime() - ultimo) / 86_400_000));
}
