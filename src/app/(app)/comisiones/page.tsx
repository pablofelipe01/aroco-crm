import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ComisionesClient } from "./comisiones-client";
import type { CommissionRule, TeamMember } from "@/lib/types/database";

export const dynamic = "force-dynamic";

const WRITE_DEPTS = ["Financiero", "Comercial"];

export default async function ComisionesPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const canWrite =
    session?.profile?.role === "admin" ||
    (session?.profile?.department != null &&
      WRITE_DEPTS.includes(session.profile.department));
  const canEditRules =
    session?.profile?.role === "admin" ||
    session?.profile?.department === "Financiero";

  const [{ data: rules }, { data: team }] = await Promise.all([
    supabase.from("commission_rules").select("*").order("market").order("level"),
    supabase.from("team_members").select("*").eq("active", true).order("name"),
  ]);

  return (
    <ComisionesClient
      rules={(rules ?? []) as CommissionRule[]}
      team={(team ?? []) as TeamMember[]}
      canWrite={canWrite}
      canEditRules={canEditRules}
    />
  );
}
