/** Tipos de catálogo administrables desde /procesos/admin/catalogos. */
export const CATALOGO_TIPOS = [
  { tipo: "certificacion", label: "Certificaciones", singular: "Certificación" },
  { tipo: "sello", label: "Sellos", singular: "Sello" },
] as const;

export type CatalogoTipo = (typeof CATALOGO_TIPOS)[number]["tipo"];

export const CATALOGO_TIPOS_VALIDOS = CATALOGO_TIPOS.map((c) => c.tipo) as readonly string[];
