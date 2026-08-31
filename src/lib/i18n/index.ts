import { es, type Diccionario } from "./es";
import { en } from "./en";

export type { Diccionario };
export type Idioma = "es" | "en";

export const IDIOMAS: Idioma[] = ["es", "en"];
export const IDIOMA_POR_DEFECTO: Idioma = "es";

const DICCIONARIOS: Record<Idioma, Diccionario> = { es, en };

/** Cookie que transporta el idioma a rutas sin perfil (login, portal). */
export const COOKIE_IDIOMA = "aroco_idioma";

export function esIdioma(v: unknown): v is Idioma {
  return v === "es" || v === "en";
}

/** Nunca falla: cualquier cosa que no sea un idioma conocido cae en español. */
export function normalizarIdioma(v: unknown): Idioma {
  return esIdioma(v) ? v : IDIOMA_POR_DEFECTO;
}

export function diccionario(idioma: Idioma): Diccionario {
  return DICCIONARIOS[idioma] ?? es;
}

/**
 * El locale de `Intl` para cada idioma.
 *
 * No es cosmético. En español un millón se escribe «1.250.000» y en inglés
 * «1,250,000»: los mismos caracteres, invertidos. Un lector en inglés que vea
 * «1.250» entiende mil doscientos cincuenta veces menos de lo que hay. Traducir
 * los rótulos y dejar los números en formato colombiano es peor que no traducir
 * nada, porque el error no se ve.
 */
export function localeDe(idioma: Idioma): string {
  return idioma === "en" ? "en-US" : "es-CO";
}
