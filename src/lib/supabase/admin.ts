import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { env, serverEnv } from "@/lib/env";

/**
 * Service-role client — bypasses RLS. SERVER ONLY.
 * Use sparingly: admin invitations, AI agent writes (after human confirmation),
 * scheduled jobs. Never import from client code; `server-only` enforces this.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
