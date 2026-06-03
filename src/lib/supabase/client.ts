"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database";
import { env } from "@/lib/env";

/** Supabase client for Client Components (browser). Uses the public anon key. */
export function createClient() {
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
