import type { MeetingWithCount } from "./page";

/**
 * ¿Lleva candado? Desde 0100 toda acta nace restringida a sus invitados, así
 * que «restringida» es lo normal y marcarla en todas no dice nada. El candado
 * queda para la que además deja fuera a alguno de sus invitados.
 */
export function esReservada(
  m: Pick<MeetingWithCount, "restricted" | "meeting_attendees">,
): boolean {
  return m.restricted && m.meeting_attendees.some((a) => !a.can_view);
}
