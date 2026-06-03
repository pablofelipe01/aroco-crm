import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ComercialClient } from "./comercial-client";
import type { Lead, TeamMember } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type LeadWithOwner = Lead & {
  owner: Pick<TeamMember, "id" | "name" | "color"> | null;
};

const WRITE_DEPTS = ["Comercial", "Administrativo"];

export default async function ComercialPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));

  const [{ data: leads }, { data: team }] = await Promise.all([
    supabase
      .from("leads")
      .select(
        "*, owner:team_members!leads_commercial_owner_fkey(id,name,color)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("team_members")
      .select("*")
      .eq("active", true)
      .order("name"),
  ]);

  return (
    <ComercialClient
      initialLeads={(leads ?? []) as unknown as LeadWithOwner[]}
      team={(team ?? []) as TeamMember[]}
      canWrite={canWrite}
      currentUserName={session?.profile?.full_name ?? ""}
    />
  );
}
