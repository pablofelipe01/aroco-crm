/**
 * Empareja el nombre que escribe el notetaker con una cuenta del CRM.
 *
 * El acta trae el nombre completo («Fernando José Mejía Paz») y la cuenta suele
 * tener el corto («Fernando Mejía Paz»), o al revés. Se acepta:
 *
 *  1. el mismo nombre, sin tildes ni mayúsculas; o
 *  2. el mismo primer nombre y el mismo último apellido, con todas las palabras
 *     del nombre corto presentes en el largo.
 *
 * La regla 2 exige al menos dos palabras en cada lado —«Nicolás» o «Juan
 * Carlos» solos no dicen quién es— y un único candidato: si dos cuentas
 * encajan, no se elige ninguna. Lo que va entre paréntesis se descarta
 * («Juan Carlos (Finca El Milagro)» es un finquero, no un Juan Carlos del
 * equipo).
 */

export type Candidato = { profileId: string; nombre: string };

export const normNombre = (s: string) =>
  s
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const palabras = (s: string) => normNombre(s).split(" ").filter(Boolean);

function encajaSuelto(a: string[], b: string[]): boolean {
  if (a.length < 2 || b.length < 2) return false;
  if (a[0] !== b[0] || a[a.length - 1] !== b[b.length - 1]) return false;
  const [corto, largo] = a.length <= b.length ? [a, b] : [b, a];
  return corto.every((w) => largo.includes(w));
}

/** El profileId de la única cuenta que corresponde a `nombre`, o null. */
export function emparejarNombre(nombre: string, candidatos: Candidato[]): string | null {
  const objetivo = palabras(nombre);
  if (objetivo.length === 0) return null;
  const clave = objetivo.join(" ");

  const unico = (ids: string[]) => {
    const distintos = [...new Set(ids)];
    return distintos.length === 1 ? distintos[0] : null;
  };

  const exactos = candidatos.filter((c) => palabras(c.nombre).join(" ") === clave);
  if (exactos.length > 0) return unico(exactos.map((c) => c.profileId));

  return unico(
    candidatos.filter((c) => encajaSuelto(objetivo, palabras(c.nombre))).map((c) => c.profileId),
  );
}
