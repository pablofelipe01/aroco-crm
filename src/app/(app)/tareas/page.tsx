import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { TareasClient } from "./tareas-client";
import type { Task, TeamMember } from "@/lib/types/database";

export const dynamic = "force-dynamic";

export type TaskAssignee = Pick<
  TeamMember,
  "id" | "name" | "color" | "department"
>;

export type TaskWithPerson = Task & {
  /** Responsable principal (derivado del primero de `assignees`). */
  person: TaskAssignee | null;
  /** Todos los responsables. Una tarea puede quedar en manos de varios. */
  assignees: TaskAssignee[];
};

export default async function TareasPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  const [{ data: tasks }, { data: team }] = await Promise.all([
    supabase
      .from("tasks")
      .select(
        "*, person:team_members!tasks_person_id_fkey(id,name,color,department), task_assignees(team_members(id,name,color,department))",
      )
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("team_members").select("*").eq("active", true).order("name"),
  ]);

  const members = (team ?? []) as TeamMember[];
  // Miembro del equipo del usuario conectado (para filtrar sus tareas por defecto).
  const currentPersonId =
    members.find((m) => m.profile_id === session?.userId)?.id ?? "";

  // PostgREST devuelve la tabla puente anidada; se aplana a una lista simple.
  type RawTask = Omit<TaskWithPerson, "assignees"> & {
    task_assignees: { team_members: TaskAssignee | null }[] | null;
  };
  const withAssignees: TaskWithPerson[] = (
    (tasks ?? []) as unknown as RawTask[]
  ).map(({ task_assignees, ...t }) => ({
    ...t,
    assignees: (task_assignees ?? [])
      .map((a) => a.team_members)
      .filter((m): m is TaskAssignee => m != null),
  }));

  return (
    <TareasClient
      initialTasks={withAssignees}
      team={members}
      currentPersonId={currentPersonId}
    />
  );
}
