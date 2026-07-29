import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ActasClient } from "./actas-client";
import type { Meeting, TeamMember } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type MeetingWithCount = Meeting & {
  tasks: { count: number }[];
  /** Invitados; quiénes pueden leerla cuando está restringida. */
  meeting_attendees: { name: string | null; email: string | null }[];
};

export default async function ActasPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  // Las actas restringidas que no le corresponden al usuario ni siquiera
  // llegan: las filtra la RLS de `meetings` (0044).
  const [{ data: meetings }, { data: team }] = await Promise.all([
    supabase
      .from("meetings")
      .select("*, tasks(count), meeting_attendees(name,email)")
      .order("created_at", { ascending: false }),
    supabase.from("team_members").select("*").eq("active", true).order("name"),
  ]);

  return (
    <ActasClient
      meetings={(meetings ?? []) as unknown as MeetingWithCount[]}
      team={(team ?? []) as TeamMember[]}
      canRestrict={session?.profile?.role === "admin"}
    />
  );
}
