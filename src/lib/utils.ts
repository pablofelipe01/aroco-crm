import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * El separador de miles depende del idioma que esté viendo la persona.
 *
 * Todas estas funciones reciben el locale como último parámetro y por defecto
 * usan `es-CO`, que es como se comportaban antes: así los cientos de llamadas
 * que ya existen siguen dando exactamente lo mismo, y solo cambia lo que se
 * migre a propósito. Para no ir pasándolo a mano en cada llamada dentro de un
 * componente, está el hook `useFormatos()` de `@/lib/i18n/provider`.
 */
export const LOCALE_POR_DEFECTO = "es-CO";

/** Format a number as COP currency (no decimals). */
export function formatCOP(value: number, locale = LOCALE_POR_DEFECTO): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

/** Format a number as USD currency. */
export function formatUSD(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format a plain number with thousands separators. */
export function formatNumber(
  value: number,
  decimals = 0,
  locale = LOCALE_POR_DEFECTO,
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format kilograms with the kg suffix. */
export function formatKg(value: number, locale = LOCALE_POR_DEFECTO): string {
  return `${formatNumber(value, 0, locale)} kg`;
}

/** Format a percentage from a 0..1 ratio. */
export function formatPct(ratio: number, decimals = 2): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

/** Short, locale-aware date (e.g. 02 jun 2026). */
export function formatDate(
  value: string | Date | null | undefined,
  locale = LOCALE_POR_DEFECTO,
): string {
  if (!value) return "—";
  // Las cadenas "solo fecha" (YYYY-MM-DD) son días de calendario, no instantes:
  // `new Date("2026-07-06")` es medianoche UTC y en un navegador con offset
  // negativo (Colombia, UTC-5) se renderiza como el día anterior. La
  // construimos en hora local para preservar el día tal cual.
  let d: Date;
  let dateOnly = false;
  if (typeof value === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (m) {
      d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      dateOnly = true;
    } else {
      d = new Date(value);
    }
  } else {
    d = value;
  }
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    // Los timestamps se muestran en hora de Colombia; las fechas de calendario
    // ya se construyeron en local, así que no se fuerza zona.
    ...(dateOnly ? {} : { timeZone: "America/Bogota" }),
  }).format(d);
}

/** Initials from a full name, max 2 chars. */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}
