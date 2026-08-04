import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { ActasClient } from "./actas-client";
import type { Meeting, TeamMember, Profile } from "@/lib/types/database";

/** Lo mínimo del perfil para repartir accesos. */
export type ProfileLite = Pick<Profile, "id" | "full_name" | "email" | "role">;

export const dynamic = "force-dynamic";

/** Cuántas tareas del acta lleva cada persona. */
export type TaskLoad = { name: string; count: number };

export type MeetingAttendee = {
  id: string;
  profile_id: string | null;
  name: string | null;
  email: string | null;
  /** Permiso de lectura cuando el acta está restringida. */
  can_view: boolean;
  /** Permiso para repartir el acceso. Solo surte efecto en SuperAdmins. */
  can_manage: boolean;
  /** Hecho: estuvo en la reunión. No cambia al quitarle el acceso. */
  attended: boolean;
};

export type MeetingWithCount = Meeting & {
  tasks: { count: number }[];
  /** Reparto de las tareas del acta por responsable, de mayor a menor. */
  taskLoad: TaskLoad[];
  /** Invitados y quién de ellos puede verla si está restringida. */
  meeting_attendees: MeetingAttendee[];
  /** ¿El usuario actual puede abrir/cerrar esta acta y repartir su acceso? */
  canManage: boolean;
};

/** Etiqueta para las tareas del acta que no quedaron en manos de nadie. */
const SIN_RESPONSABLE = "Sin responsable";

export default async function ActasPage() {
  const supabase = await createClient();
  const session = await getSessionContext();

  // Las actas restringidas que no le corresponden al usuario ni siquiera
  // llegan: las filtra la RLS de `meetings` (0044/0049). Las tareas se traen
  // con sus responsables para repartir el conteo; también las recorta la RLS
  // de `tasks` (0048), así que cada quien ve el reparto de lo que le compete.
  const [{ data: meetings }, { data: team }, { data: profiles }] = await Promise.all([
    supabase
      .from("meetings")
      .select(
        "*, tasks(id, person_name, task_assignees(team_members(name))), meeting_attendees(id, profile_id, name, email, can_view, can_manage, attended)",
      )
      .order("created_at", { ascending: false }),
    supabase.from("team_members").select("*").eq("active", true).order("name"),
    supabase.from("profiles").select("id, full_name, email, role").eq("active", true).order("full_name"),
  ]);

  // Quién administra cada acta: un SuperAdmin que asistió, o el Gerente
  // General (la raíz del organigrama). Se resuelve aquí para poder mostrar u
  // ocultar los controles; la base lo vuelve a comprobar al escribir.
  const esAdmin = session?.profile?.role === "admin";
  let esRaiz = false;
  if (esAdmin && session) {
    const { data: ficha } = await supabase
      .from("team_members")
      .select("manager_id")
      .eq("profile_id", session.userId)
      .maybeSingle();
    esRaiz = ficha != null && ficha.manager_id == null;
  }

  type RawTask = {
    id: string;
    person_name: string | null;
    task_assignees: { team_members: { name: string } | null }[] | null;
  };
  type RawMeeting = Omit<MeetingWithCount, "tasks" | "taskLoad" | "canManage"> & {
    tasks: RawTask[] | null;
  };

  const preparadas: MeetingWithCount[] = (
    (meetings ?? []) as unknown as RawMeeting[]
  ).map(({ tasks, ...m }) => {
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

    // Administra quien asistió o quien recibió el rol por delegación (0050).
    const enLaLista =
      session != null &&
      m.meeting_attendees.some(
        (a) =>
          (a.attended || a.can_manage) &&
          (a.profile_id === session.userId ||
            (a.email && a.email.toLowerCase() === session.email.toLowerCase())),
      );

    return {
      ...m,
      tasks: [{ count: (tasks ?? []).length }],
      taskLoad: [...conteo.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
      canManage: esAdmin && (esRaiz || enLaLista),
    };
  });

  return (
    <ActasClient
      meetings={preparadas}
      team={(team ?? []) as TeamMember[]}
      profiles={(profiles ?? []) as ProfileLite[]}
    />
  );
}
