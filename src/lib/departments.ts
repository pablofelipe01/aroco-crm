/**
 * Áreas de AROCO (espeja el enum `department` de Postgres).
 *
 * Vive en su propio módulo, sin dependencias, para que el servidor pueda
 * importar la lista sin arrastrar `nav.ts` — que trae los iconos de
 * lucide-react y solo tiene sentido en el árbol de React.
 */
export const DEPARTMENTS = [
  "Dirección",
  "Comercial",
  "Financiero",
  "Administrativo",
  "Bodega Central",
  "Finca",
  "Operaciones",
] as const;

export type Department = (typeof DEPARTMENTS)[number];
