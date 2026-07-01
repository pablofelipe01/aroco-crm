/**
 * Environment access with lazy validation.
 *
 * Values are read via getters so a missing variable only throws when the value
 * is actually used (at runtime) — not at import time. This keeps `next build`
 * working before the Supabase keys are provided, while still failing loudly
 * with a helpful message the moment the app tries to talk to Supabase.
 */
function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get NEXT_PUBLIC_SUPABASE_URL() {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get NEXT_PUBLIC_SUPABASE_ANON_KEY() {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
};

/** Whether public Supabase env is present (without throwing). */
export function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Server-only secrets. Never import this from a Client Component. */
export const serverEnv = {
  get SUPABASE_SERVICE_ROLE_KEY() {
    return required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    );
  },
  get ANTHROPIC_API_KEY() {
    return required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY);
  },
  get ANTHROPIC_MODEL() {
    return process.env.ANTHROPIC_MODEL ?? "";
  },
  /** Shared secret protecting the Vercel Cron endpoint(s). */
  get CRON_SECRET() {
    return required("CRON_SECRET", process.env.CRON_SECRET);
  },
  /** Gmail OAuth (lectura del buzón de Renata para el cron de Actas). */
  get GMAIL_CLIENT_ID() {
    return process.env.GMAIL_CLIENT_ID ?? "";
  },
  get GMAIL_CLIENT_SECRET() {
    return process.env.GMAIL_CLIENT_SECRET ?? "";
  },
  get GMAIL_REFRESH_TOKEN() {
    return process.env.GMAIL_REFRESH_TOKEN ?? "";
  },
  /** Búsqueda Gmail para las notas de reunión (auto-enviadas por Renata).
   * Excluye pruebas/ensayos del notetaker. */
  get ACTAS_EMAIL_QUERY() {
    return (
      process.env.ACTAS_EMAIL_QUERY ??
      'subject:"Notas de reunión" -subject:prueba -subject:ensayo -subject:test newer_than:14d'
    );
  },
  /**
   * Published CSV export of the inventory Google Sheet. Defaults to the AROCO
   * sheet's `gid=826514579` tab; override per-environment if it ever moves.
   */
  get INVENTORY_SHEET_CSV_URL() {
    return (
      process.env.INVENTORY_SHEET_CSV_URL ??
      "https://docs.google.com/spreadsheets/d/1ozHRoAKiNNwMHOMCY-lwYaoJYxba71lo6sr1ltsg094/export?format=csv&gid=826514579"
    );
  },
  /** Inventory-by-quality tab (gid=1083634413) of the same sheet. */
  get INVENTORY_QUALITY_SHEET_CSV_URL() {
    return (
      process.env.INVENTORY_QUALITY_SHEET_CSV_URL ??
      "https://docs.google.com/spreadsheets/d/1ozHRoAKiNNwMHOMCY-lwYaoJYxba71lo6sr1ltsg094/export?format=csv&gid=1083634413"
    );
  },
  /**
   * Published CSV export of the daily prices Google Sheet (company × date
   * matrix). Override per-environment if it ever moves.
   */
  get PRICES_SHEET_CSV_URL() {
    return (
      process.env.PRICES_SHEET_CSV_URL ??
      "https://docs.google.com/spreadsheets/d/1aNoSXKt7kgfEFTu3EoSgil5yr4DICpiDjDu6eacjmro/export?format=csv&gid=1305299793"
    );
  },
};
