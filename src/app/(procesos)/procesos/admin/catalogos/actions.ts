"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { CATALOGO_TIPOS_VALIDOS } from "@/lib/procesos/catalogos";
import type { TablesUpdate } from "@/lib/types/database";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireAdmin() {
  const session = await getSessionContext();
  if (!session) return { error: "Sesión expirada." as const };
  if (session.profile?.role !== "admin")
    return { error: "Solo un administrador puede editar los catálogos." as const };
  return { session };
}

export async function crearItemCatalogo(
  tipo: string,
  valor: string,
  descripcion?: string,
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (guard.error) return { ok: false, error: guard.error };
  if (!CATALOGO_TIPOS_VALIDOS.includes(tipo)) return { ok: false, error: "Catálogo inválido." };
  if (!valor.trim()) return { ok: false, error: "Escribe el valor." };

  const supabase = await createClient();
  const { data: max } = await supabase
    .from("catalogos")
    .select("orden")
    .eq("tipo", tipo)
    .order("orden", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await supabase
    .from("catalogos")
    .insert({
      tipo,
      valor: valor.trim(),
      descripcion: descripcion?.trim() || null,
      orden: (max?.orden ?? 0) + 1,
    })
    .select("id")
    .single();
  if (error)
    return {
      ok: false,
      error: error.code === "23505" ? "Ya existe ese valor en el catálogo." : error.message,
    };
  revalidatePath("/procesos/admin/catalogos");
  return { ok: true, id: data.id };
}

export async function actualizarItemCatalogo(
  id: string,
  patch: { valor?: string; descripcion?: string | null; orden?: number; activo?: boolean },
): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (guard.error) return { ok: false, error: guard.error };

  const row: TablesUpdate<"catalogos"> = { updated_at: new Date().toISOString() };
  if (patch.valor !== undefined) {
    if (!patch.valor.trim()) return { ok: false, error: "El valor no puede quedar vacío." };
    row.valor = patch.valor.trim();
  }
  if (patch.descripcion !== undefined) row.descripcion = patch.descripcion?.trim() || null;
  if (patch.orden !== undefined) row.orden = patch.orden;
  if (patch.activo !== undefined) row.activo = patch.activo;

  const supabase = await createClient();
  const { error } = await supabase.from("catalogos").update(row).eq("id", id);
  if (error)
    return {
      ok: false,
      error: error.code === "23505" ? "Ya existe ese valor en el catálogo." : error.message,
    };
  revalidatePath("/procesos/admin/catalogos");
  return { ok: true, id };
}

export async function eliminarItemCatalogo(id: string): Promise<ActionResult> {
  const guard = await requireAdmin();
  if (guard.error) return { ok: false, error: guard.error };
  const supabase = await createClient();
  const { error } = await supabase.from("catalogos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/procesos/admin/catalogos");
  return { ok: true };
}
