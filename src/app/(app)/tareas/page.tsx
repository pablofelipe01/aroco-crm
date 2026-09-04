import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { TareasClient } from "./tareas-client";
import { mesesArchivados, rangoDelMes } from "@/lib/tareas/archivo";
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

const SELECT =
  "*, person:team_members!tasks_person_id_fkey(id,name,color,department), task_assignees(team_members(id,name,color,department))";

/** PostgREST devuelve la tabla puente anidada; se aplana a una lista simple. */
type RawTask = Omit<TaskWithPerson, "assignees"> & {
  task_assignees: { team_members: TaskAssignee | null }[] | null;
};

function aplanar(tasks: unknown): TaskWithPerson[] {
  return ((tasks ?? []) as RawTask[]).map(({ task_assignees, ...t }) => ({
    ...t,
    assignees: (task_assignees ?? [])
      .map((a) => a.team_members)
      .filter((m): m is TaskAssignee => m != null),
  }));
}

export default async function TareasPage({
  searchParams,
}: {
  searchParams: Promise<{ archivo?: string }>;
}) {
  const supabase = await createClient();
  const session = await getSessionContext();
  const { archivo } = await searchParams;

  const hoy = new Date();
  const rango = archivo ? rangoDelMes(archivo) : null;

  /**
   * El tablero trae lo VIVO: lo que no está completado, más lo completado este
   * mes. Lo de meses anteriores no se descarga siquiera — con los años serían
   * miles de tarjetas viajando hasta el navegador para no mostrarse nunca.
   */
  const inicioMes = rangoDelMes(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Bogota",
      year: "numeric",
      month: "2-digit",
    }).format(hoy),
  );

  const consultaTablero = supabase
    .from("tasks")
    .select(SELECT)
    .or(
      // Una tarea completada sin `completed_at` no debería existir (lo pone un
      // trigger), pero si aparece se queda a la vista en vez de desaparecer.
      `status.neq.done,completed_at.is.null${
        inicioMes ? `,completed_at.gte.${inicioMes.desde}` : ""
      }`,
    )
    .order("due_date", { ascending: true, nullsFirst: false });

  const consultaArchivo = rango
    ? supabase
        .from("tasks")
        .select(SELECT)
        .eq("status", "done")
        .gte("completed_at", rango.desde)
        .lt("completed_at", rango.hasta)
        .order("completed_at", { ascending: false })
    : null;

  const [{ data: tasks }, { data: team }, { data: completados }, archivadas] =
    await Promise.all([
      consultaTablero,
      supabase.from("team_members").select("*").eq("active", true).order("name"),
      // Solo la fecha: alcanza para saber qué meses tienen archivo y cuesta una
      // columna en vez de la tarea entera.
      supabase.from("tasks").select("completed_at").eq("status", "done"),
      consultaArchivo,
    ]);

  const members = (team ?? []) as TeamMember[];
  // Miembro del equipo del usuario conectado (para filtrar sus tareas por defecto).
  const currentPersonId =
    members.find((m) => m.profile_id === session?.userId)?.id ?? "";

  return (
    <TareasClient
      initialTasks={aplanar(tasks)}
      team={members}
      currentPersonId={currentPersonId}
      currentUserId={session?.userId}
      meses={mesesArchivados(
        (completados ?? []).map((c) => c.completed_at),
        hoy,
      )}
      mesArchivo={rango ? (archivo ?? null) : null}
      archivadas={aplanar(archivadas?.data)}
    />
  );
}
