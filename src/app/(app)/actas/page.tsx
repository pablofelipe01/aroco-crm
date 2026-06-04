import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ActasClient } from "./actas-client";
import type { Meeting, TeamMember } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type MeetingWithCount = Meeting & { tasks: { count: number }[] };

export default async function ActasPage() {
  const supabase = await createClient();
  await getSessionContext();

  const [{ data: meetings }, { data: team }] = await Promise.all([
    supabase
      .from("meetings")
      .select("*, tasks(count)")
      .order("created_at", { ascending: false }),
    supabase.from("team_members").select("*").eq("active", true).order("name"),
  ]);

  return (
    <ActasClient
      meetings={(meetings ?? []) as unknown as MeetingWithCount[]}
      team={(team ?? []) as TeamMember[]}
    />
  );
}
