/**
 * Región de un lote a partir de su código de procedencia.
 *
 * Los códigos siguen el patrón `CO-MET-…` / `COL-CUN-…`, donde el segundo
 * segmento es el departamento. Algunos son texto libre ("CISCA ruta #3
 * (Guachene - villa rica)"), así que el segmento solo se acepta cuando parece
 * un código de tres letras; si no, cae en "Otro".
 *
 * Vive aparte para que el dashboard y el asistente agrupen igual: si cada uno
 * lo calculara por su cuenta, acabarían mostrando totales distintos.
 */
export function regionFromCode(code: string): string {
  const seg = code.split("-")[1]?.trim() ?? "";
  return /^[A-Za-z]{3}$/.test(seg) ? seg.toUpperCase() : "Otro";
}
