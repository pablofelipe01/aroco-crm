import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { SessionContext } from "@/lib/auth";
import type { Department } from "@/lib/departments";

type DB = SupabaseClient<Database>;

/**
 * Quién está preguntando. Las herramientas del asistente ya corren con el
 * cliente Supabase del usuario (así que RLS aplica), pero la RLS de `tasks`
 * todavía deja que cualquier miembro activo lea todas las tareas — el bug que
 * se reportó en el dashboard. Hasta que la jerarquía definitiva baje a RLS,
 * el alcance se recorta aquí, en la capa de aplicación, igual que lo hace el
 * dashboard.
 */
export type AgentContext = {
  userId: string;
  fullName: string;
  isAdmin: boolean;
  department: Department | null;
  /** Ficha en `team_members`, si la persona tiene una. Las tareas apuntan ahí. */
  teamMemberId: string | null;
};

/** Resuelve el contexto del asistente para la sesión actual. */
export async function resolveAgentContext(
  db: DB,
  session: SessionContext,
): Promise<AgentContext> {
  const { data: member } = await db
    .from("team_members")
    .select("id")
    .eq("profile_id", session.userId)
    .maybeSingle();

  return {
    userId: session.userId,
    fullName: session.profile?.full_name ?? session.email,
    isAdmin: session.profile?.role === "admin",
    department: (session.profile?.department as Department | null) ?? null,
    teamMemberId: member?.id ?? null,
  };
}

/** Forma mínima de un responsable para decidir visibilidad. */
type Assignee = {
  id?: string | null;
  profile_id?: string | null;
  department?: string | null;
} | null;

/**
 * ¿Puede esta persona ver una tarea de este responsable?
 *
 * · admin (Dirección) → todo.
 * · resto → lo propio y lo de su departamento.
 * · sin responsable → visible para todos: una tarea sin dueño no es dato
 *   privado de nadie, y ocultarla dejaría fuera los pendientes generales.
 */
export function canSeeAssignee(ctx: AgentContext, person: Assignee): boolean {
  if (ctx.isAdmin) return true;
  if (!person) return true;
  if (person.profile_id && person.profile_id === ctx.userId) return true;
  if (person.id && person.id === ctx.teamMemberId) return true;
  return Boolean(
    ctx.department && person.department && person.department === ctx.department,
  );
}

/** Etiqueta del alcance aplicado, para que el modelo pueda explicarlo. */
export function scopeLabel(ctx: AgentContext): string {
  return ctx.isAdmin
    ? "acceso total (Dirección)"
    : `solo ${ctx.fullName} y el área ${ctx.department ?? "sin asignar"}`;
}
