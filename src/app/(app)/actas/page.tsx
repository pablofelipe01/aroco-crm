import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ActasClient } from "./actas-client";
import type { Meeting, TeamMember } from "@/lib/types/database";

export const dynamic = "force-dynamic";

/** Cuántas tareas del acta lleva cada persona. */
export type TaskLoad = { name: string; count: number };

export type MeetingWithCount = Meeting & {
  tasks: { count: number }[];
  /** Reparto de las tareas del acta por responsable, de mayor a menor. */
  taskLoad: TaskLoad[];
  /** Invitados; quiénes pueden leerla cuando está restringida. */
  meeting_attendees: { name: string | null; email: string | null }[];
};

/** Etiqueta para las tareas del acta que no quedaron en manos de nadie. */
const SIN_RESPONSABLE = "Sin responsable";

export default async function ActasPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  // Las actas restringidas que no le corresponden al usuario ni siquiera
  // llegan: las filtra la RLS de `meetings` (0044). Las tareas se traen con
  // sus responsables para poder repartir el conteo; también las recorta la RLS
  // de `tasks` (0048), así que cada quien ve el reparto de lo que le compete.
  const [{ data: meetings }, { data: team }] = await Promise.all([
    supabase
      .from("meetings")
      .select(
        "*, tasks(id, person_name, task_assignees(team_members(name))), meeting_attendees(name,email)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("team_members").select("*").eq("active", true).order("name"),
  ]);

  type RawTask = {
    id: string;
    person_name: string | null;
    task_assignees: { team_members: { name: string } | null }[] | null;
  };
  type RawMeeting = Omit<MeetingWithCount, "tasks" | "taskLoad"> & {
    tasks: RawTask[] | null;
  };

  const conReparto: MeetingWithCount[] = ((meetings ?? []) as unknown as RawMeeting[]).map(
    ({ tasks, ...m }) => {
      const conteo = new Map<string, number>();
      for (const t of tasks ?? []) {
        const nombres = (t.task_assignees ?? [])
          .map((a) => a.team_members?.name)
          .filter((n): n is string => !!n);
        // Una tarea compartida suma para cada responsable: la pregunta es
        // cuántas lleva cada quien, no cómo repartir una unidad.
        const destinos = nombres.length > 0 ? nombres : [t.person_name ?? SIN_RESPONSABLE];
        for (const n of destinos) conteo.set(n, (conteo.get(n) ?? 0) + 1);
      }
      return {
        ...m,
        tasks: [{ count: (tasks ?? []).length }],
        taskLoad: [...conteo.entries()]
          .map(([name, count]) => ({ name, count }))
          .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      };
    },
  );

  return (
    <ActasClient
      meetings={conReparto}
      team={(team ?? []) as TeamMember[]}
      canRestrict={session?.profile?.role === "admin"}
    />
  );
}
