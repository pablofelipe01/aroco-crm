"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { DEPARTMENTS, type Department } from "@/lib/departments";
import type { UserRole } from "@/lib/types/database";

const ROLES: readonly UserRole[] = ["admin", "admin_view", "member"];

/**
 * La cuenta de prueba se pone el rol y el área que quiera ver (0110).
 *
 * Cambia las columnas reales del perfil y no una simulación en el cliente: el
 * menú, los botones de escritura y la RLS leen de ahí, así que lo que se ve
 * después es exactamente lo que ve esa persona. El guardián de la base
 * (`guard_perfil_propio`) es quien de verdad impide que una cuenta normal lo
 * haga; este chequeo solo da un error legible.
 */
export async function cambiarPerfilPrueba(
  role: string,
  department: string,
): Promise<{ ok: boolean; error?: string }> {
  const session = await getSessionContext();
  if (!session?.profile?.es_prueba) {
    return { ok: false, error: "Solo la cuenta de prueba puede cambiar de perfil." };
  }
  if (!ROLES.includes(role as UserRole)) return { ok: false, error: "Rol no válido." };
  if (!(DEPARTMENTS as readonly string[]).includes(department)) {
    return { ok: false, error: "Área no válida." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role: role as UserRole, department: department as Department })
    .eq("id", session.profile.id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/", "layout");
  return { ok: true };
}
