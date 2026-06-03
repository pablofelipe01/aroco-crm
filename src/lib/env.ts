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
};
