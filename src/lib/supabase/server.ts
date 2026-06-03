import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database";
import { env } from "@/lib/env";

/**
 * Supabase client for Server Components, Server Actions and Route Handlers.
 * Reads/writes the auth cookies via next/headers. Setting cookies from a
 * Server Component throws (read-only); that's safe to ignore because the
 * middleware refreshes the session on every request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component — ignore; middleware handles it.
          }
        },
      },
    },
  );
}
