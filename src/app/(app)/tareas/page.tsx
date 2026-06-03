import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { TareasClient } from "./tareas-client";
import type { Task, TeamMember } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type TaskWithPerson = Task & {
  person: Pick<TeamMember, "id" | "name" | "color"> | null;
};

export default async function TareasPage() {
  const supabase = await createClient();
  await getSessionContext();

  const [{ data: tasks }, { data: team }] = await Promise.all([
    supabase
      .from("tasks")
      .select("*, person:team_members!tasks_person_id_fkey(id,name,color)")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("team_members").select("*").eq("active", true).order("name"),
  ]);

  return (
    <TareasClient
      initialTasks={(tasks ?? []) as unknown as TaskWithPerson[]}
      team={(team ?? []) as TeamMember[]}
    />
  );
}
