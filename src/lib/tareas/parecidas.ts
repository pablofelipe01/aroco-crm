/**
 * Tareas que se repiten entre reuniones.
 *
 * Un compromiso que no se cerró reaparece en el acta siguiente con otras
 * palabras, y el ingest lo vuelve a crear. En la reunión del 15-sep se acordó
 * que Renata las señale sin cerrarlas: el equipo decide. Aquí solo se buscan
 * y se guardan como sugerencia en `task_parecidas`; resolverlas es cosa de
 * `resolver_tarea_parecida()` (migración 0094), que corre con la sesión de
 * quien decide.
 *
 * Lo usan el ingest de actas (tareas recién creadas) y el script de repaso
 * (`scripts/detectar-tareas-parecidas.ts`), que recorre las actas viejas en
 * orden. Necesita un cliente con service_role: las sugerencias no tienen
 * política de insert.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { buscarTareasParecidas, type TareaParaComparar } from "@/lib/ai/actas";

const SELECT =
  "id, name, description, person_name, created_at, meeting:meetings(meeting_date), task_assignees(team_members(name))";

interface Fila {
  id: string;
  name: string;
  description: string | null;
  person_name: string | null;
  created_at: string;
  meeting: { meeting_date: string | null } | null;
  task_assignees: { team_members: { name: string } | null }[] | null;
}

function paraComparar(t: Fila): TareaParaComparar {
  const responsables = (t.task_assignees ?? [])
    .map((a) => a.team_members?.name)
    .filter((n): n is string => !!n);
  return {
    nombre: t.name,
    descripcion: t.description,
    responsables: responsables.length ? responsables : t.person_name ? [t.person_name] : [],
    fecha: t.meeting?.meeting_date ?? t.created_at.slice(0, 10),
  };
}

/** Clave del par sin importar el orden, igual que el índice único de la tabla. */
function clavePar(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Compara `idsNuevas` con las tareas abiertas creadas ANTES que ellas y guarda
 * los pares que la IA considera el mismo compromiso.
 *
 * Solo entran tareas abiertas y sin unir, de los dos lados: una tarea cerrada
 * ya no puede repetirse con nada que valga la pena señalar. Un par que ya se
 * sugirió —se haya resuelto o no— no se vuelve a sugerir.
 */
export async function detectarParecidas(
  db: SupabaseClient<Database>,
  idsNuevas: string[],
): Promise<{ sugeridas: number }> {
  if (idsNuevas.length === 0) return { sugeridas: 0 };

  const { data: nuevasRaw, error: nErr } = await db
    .from("tasks")
    .select(SELECT)
    .in("id", idsNuevas)
    .neq("status", "done")
    .is("unida_a", null);
  if (nErr) throw new Error(nErr.message);
  const nuevas = (nuevasRaw ?? []) as unknown as Fila[];
  if (nuevas.length === 0) return { sugeridas: 0 };

  const desde = nuevas.reduce(
    (min, t) => (t.created_at < min ? t.created_at : min),
    nuevas[0]!.created_at,
  );

  const { data: existRaw, error: eErr } = await db
    .from("tasks")
    .select(SELECT)
    .neq("status", "done")
    .is("unida_a", null)
    .lt("created_at", desde)
    .order("created_at", { ascending: true })
    .limit(800);
  if (eErr) throw new Error(eErr.message);
  const existentes = (existRaw ?? []) as unknown as Fila[];
  if (existentes.length === 0) return { sugeridas: 0 };

  const pares = await buscarTareasParecidas(
    nuevas.map(paraComparar),
    existentes.map(paraComparar),
  );
  if (pares.length === 0) return { sugeridas: 0 };

  // Lo ya sugerido antes no se repite, ni siquiera si se dijo «son distintas»:
  // ese «no» es justo lo que hay que recordar.
  const { data: previas, error: pErr } = await db
    .from("task_parecidas")
    .select("task_id, parecida_a")
    .or(
      `task_id.in.(${nuevas.map((t) => t.id).join(",")}),parecida_a.in.(${nuevas
        .map((t) => t.id)
        .join(",")})`,
    );
  if (pErr) throw new Error(pErr.message);
  const vistas = new Set((previas ?? []).map((p) => clavePar(p.task_id, p.parecida_a)));

  const filas = pares
    .map((p) => ({
      task_id: nuevas[p.nueva]!.id,
      parecida_a: existentes[p.existente]!.id,
      motivo: p.motivo || null,
    }))
    .filter((f) => {
      const k = clavePar(f.task_id, f.parecida_a);
      if (vistas.has(k)) return false;
      vistas.add(k);
      return true;
    });
  if (filas.length === 0) return { sugeridas: 0 };

  const { error: iErr } = await db.from("task_parecidas").insert(filas);
  if (iErr) throw new Error(iErr.message);
  return { sugeridas: filas.length };
}
