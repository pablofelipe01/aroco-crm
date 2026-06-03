import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types/database";

export interface SessionContext {
  userId: string;
  email: string;
  profile: Profile | null;
}

/**
 * Load the authenticated user and their profile (server-side).
 * Returns null when there is no session.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? "",
    profile: profile ?? null,
  };
}

/** A profile is considered onboarded once it has a department assigned. */
export function isOnboarded(profile: Profile | null): boolean {
  return Boolean(profile && profile.department);
}
