import type { Department } from "@/lib/departments";

/**
 * Color de cada área (reunión del 2026-11-04).
 *
 * Antes cada persona tenía un color suelto en `team_members.color` —casi todos
 * verdes parecidos y la mitad en null—, así que el color no decía nada. Ahora
 * dice de qué área es la persona. Los tonos viven como tokens `--area-*` en
 * globals.css; aquí solo se elige cuál.
 */
const VARIABLE: Record<Department, string> = {
  Dirección: "--area-direccion",
  Comercial: "--area-comercial",
  Financiero: "--area-financiero",
  Administrativo: "--area-administrativo",
  "Bodega Central": "--area-bodega",
  Finca: "--area-finca",
  Operaciones: "--area-operaciones",
};

/** `var(--area-…)` del área, o el acento si no tiene área (o es una que no conocemos). */
export function colorDeArea(area: string | null | undefined): string {
  const v = area ? VARIABLE[area as Department] : undefined;
  return v ? `var(${v})` : "var(--accent)";
}
