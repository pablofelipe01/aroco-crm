import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind class names, resolving conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number as COP currency (no decimals). */
export function formatCOP(value: number): string {
  return new Intl.NumberFormat("es-CO", {
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
export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("es-CO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/** Format kilograms with the kg suffix. */
export function formatKg(value: number): string {
  return `${formatNumber(value)} kg`;
}

/** Format a percentage from a 0..1 ratio. */
export function formatPct(ratio: number, decimals = 2): string {
  return `${(ratio * 100).toFixed(decimals)}%`;
}

/** Short, locale-aware date (e.g. 02 jun 2026). */
export function formatDate(value: string | Date | null | undefined): string {
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
  return new Intl.DateTimeFormat("es-CO", {
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
