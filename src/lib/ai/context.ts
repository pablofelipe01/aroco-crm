import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { SessionContext } from "@/lib/auth";
import { normalizarIdioma, type Idioma } from "@/lib/i18n";
import type { Department } from "@/lib/departments";

type DB = SupabaseClient<Database>;

/**
 * Quién está preguntando.
 *
 * El recorte de lo que puede ver ya NO vive aquí: desde 0048 lo aplica la RLS
 * de `tasks` siguiendo el organigrama (cada jefe ve su rama). Este contexto
 * solo sirve para que el asistente sepa a quién le habla y pueda explicar su
 * alcance; filtrar otra vez en la aplicación duplicaría el criterio y, peor,
 * usaría uno distinto al de la base.
 */
export type AgentContext = {
  userId: string;
  fullName: string;
  /** SuperAdmin: acceso total. */
  isAdmin: boolean;
  /** Ve las tareas de todas las áreas, pero no administra. */
  isAdminView: boolean;
  department: Department | null;
  /** Ficha en `team_members`, la raíz de su rama del organigrama. */
  teamMemberId: string | null;
  /** Cargo según el organigrama, para dar contexto en las respuestas. */
  roleTitle: string | null;
  /**
   * Puede ver Mercado: posiciones del bróker, cobertura y P&L. Gana sobre el
   * rol — un SuperAdmin sin este permiso tampoco lo ve.
   */
  veMercado: boolean;
  /** En qué idioma tiene puesta la interfaz: el asistente responde en ese. */
  idioma: Idioma;
};

/** Resuelve el contexto del asistente para la sesión actual. */
export async function resolveAgentContext(
  db: DB,
  session: SessionContext,
): Promise<AgentContext> {
  const { data: member } = await db
    .from("team_members")
    .select("id, role_title")
    .eq("profile_id", session.userId)
    .maybeSingle();

  const role = session.profile?.role;
  return {
    userId: session.userId,
    fullName: session.profile?.full_name ?? session.email,
    isAdmin: role === "admin",
    isAdminView: role === "admin_view",
    department: (session.profile?.department as Department | null) ?? null,
    teamMemberId: member?.id ?? null,
    roleTitle: member?.role_title ?? null,
    veMercado: session.profile?.ve_mercado === true,
    idioma: normalizarIdioma(session.profile?.idioma),
  };
}

/** Alcance aplicado, para que el modelo pueda explicarlo sin adivinar. */
export function scopeLabel(ctx: AgentContext): string {
  if (ctx.isAdmin) return "acceso total";
  if (ctx.isAdminView) return "ve las tareas de todas las áreas";
  if (!ctx.teamMemberId) {
    return "sin ficha en el equipo — solo ve las tareas sin responsable";
  }
  return "ve lo suyo y lo de las personas a su cargo";
}
