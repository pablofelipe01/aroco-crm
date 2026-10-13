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

/**
 * Otra tarea que la IA cree que es el mismo compromiso (migración 0094). Solo
 * una sugerencia: la decide una persona desde la tarea.
 */
export interface TareaParecida {
  /** Id de la sugerencia en `task_parecidas`. */
  id: string;
  motivo: string | null;
  /** Si esta tarea es la repetida: la que se cerraría al decir «es la misma». */
  esLaRepetida: boolean;
  otra: { id: string; name: string; acta: string | null; fecha: string | null };
}

export type TaskWithPerson = Task & {
  /** Responsable principal (derivado del primero de `assignees`). */
  person: TaskAssignee | null;
  /** Todos los responsables. Una tarea puede quedar en manos de varios. */
  assignees: TaskAssignee[];
  /** Sugerencias pendientes de «esta tarea ya existía». */
  parecidas: TareaParecida[];
  /**
   * El acta de donde salió, para entender el contexto. «reservada» cuando la
   * tarea viene de un acta que esta persona no puede ver: desde 0105 tener una
   * tarea no abre el acta, y aquí no se revela ni el título.
   */
  acta: { id: string; titulo: string; fecha: string | null } | "reservada" | null;
};

const SELECT =
  "*, person:team_members!tasks_person_id_fkey(id,name,color,department), task_assignees(team_members(id,name,color,department))";

/** PostgREST devuelve la tabla puente anidada; se aplana a una lista simple. */
type RawTask = Omit<TaskWithPerson, "assignees" | "parecidas" | "acta"> & {
  task_assignees: { team_members: TaskAssignee | null }[] | null;
};

function aplanar(tasks: unknown): TaskWithPerson[] {
  return ((tasks ?? []) as RawTask[]).map(({ task_assignees, ...t }) => ({
    ...t,
    assignees: (task_assignees ?? [])
      .map((a) => a.team_members)
      .filter((m): m is TaskAssignee => m != null),
    parecidas: [],
    acta: null,
  }));
}

/** Cuelga de cada tarea su acta, si la RLS de `meetings` dejó verla. */
function conActa(
  tareas: TaskWithPerson[],
  actas: Map<string, { title: string; meeting_date: string | null }>,
): TaskWithPerson[] {
  return tareas.map((t) => {
    if (!t.meeting_id) return t;
    const a = actas.get(t.meeting_id);
    return {
      ...t,
      acta: a ? { id: t.meeting_id, titulo: a.title, fecha: a.meeting_date } : "reservada",
    };
  });
}

/**
 * Cuelga de cada tarea sus sugerencias pendientes. Solo cuentan los pares con
 * las dos tareas abiertas y a la vista: si una ya se cerró, no queda nada que
 * decidir, y si la RLS esconde una, la sugerencia tampoco llega.
 */
function conParecidas(
  tareas: TaskWithPerson[],
  pares: { id: string; motivo: string | null; task_id: string; parecida_a: string }[],
  actas: Map<string, { title: string; meeting_date: string | null }>,
): TaskWithPerson[] {
  const abiertas = new Map(
    tareas.filter((t) => t.status !== "done").map((t) => [t.id, t]),
  );
  const porTarea = new Map<string, TareaParecida[]>();
  const describir = (t: TaskWithPerson) => {
    const acta = t.meeting_id ? actas.get(t.meeting_id) : undefined;
    return {
      id: t.id,
      name: t.name,
      acta: acta?.title ?? null,
      fecha: acta?.meeting_date ?? t.created_at.slice(0, 10),
    };
  };
  for (const p of pares) {
    const nueva = abiertas.get(p.task_id);
    const vieja = abiertas.get(p.parecida_a);
    if (!nueva || !vieja) continue;
    porTarea.set(nueva.id, [
      ...(porTarea.get(nueva.id) ?? []),
      { id: p.id, motivo: p.motivo, esLaRepetida: true, otra: describir(vieja) },
    ]);
    porTarea.set(vieja.id, [
      ...(porTarea.get(vieja.id) ?? []),
      { id: p.id, motivo: p.motivo, esLaRepetida: false, otra: describir(nueva) },
    ]);
  }
  return tareas.map((t) => ({ ...t, parecidas: porTarea.get(t.id) ?? [] }));
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

  // Una tarea unida a otra (0094) ya no es un compromiso aparte: su historia
  // sigue en la otra. Ni en el tablero ni en el archivo.
  const consultaTablero = supabase
    .from("tasks")
    .select(SELECT)
    .is("unida_a", null)
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
        .is("unida_a", null)
        .gte("completed_at", rango.desde)
        .lt("completed_at", rango.hasta)
        .order("completed_at", { ascending: false })
    : null;

  const [{ data: tasks }, { data: team }, { data: completados }, archivadas, { data: pares }] =
    await Promise.all([
      consultaTablero,
      supabase.from("team_members").select("*").eq("active", true).order("name"),
      // Solo la fecha: alcanza para saber qué meses tienen archivo y cuesta una
      // columna en vez de la tarea entera.
      supabase.from("tasks").select("completed_at").eq("status", "done"),
      consultaArchivo,
      supabase
        .from("task_parecidas")
        .select("id, motivo, task_id, parecida_a")
        .eq("estado", "pendiente"),
    ]);

  const tablero = aplanar(tasks);
  const delArchivo = aplanar(archivadas?.data);
  // De qué acta viene cada tarea: para abrirla desde la tarea y entender el
  // contexto, y en las sugerencias para reconocer la otra sin abrirla. La RLS
  // de `meetings` (0105) solo devuelve las que esta persona puede ver.
  const idsActas = [
    ...new Set(
      [...tablero, ...delArchivo].map((t) => t.meeting_id).filter((id): id is string => !!id),
    ),
  ];
  const { data: actas } = idsActas.length
    ? await supabase.from("meetings").select("id, title, meeting_date").in("id", idsActas)
    : { data: [] };
  const actaDe = new Map((actas ?? []).map((a) => [a.id, a]));

  const members = (team ?? []) as TeamMember[];
  // Miembro del equipo del usuario conectado (para filtrar sus tareas por defecto).
  const currentPersonId =
    members.find((m) => m.profile_id === session?.userId)?.id ?? "";

  return (
    <TareasClient
      initialTasks={conActa(conParecidas(tablero, pares ?? [], actaDe), actaDe)}
      team={members}
      currentPersonId={currentPersonId}
      currentUserId={session?.userId}
      meses={mesesArchivados(
        (completados ?? []).map((c) => c.completed_at),
        hoy,
      )}
      mesArchivo={rango ? (archivo ?? null) : null}
      archivadas={conActa(delArchivo, actaDe)}
    />
  );
}
