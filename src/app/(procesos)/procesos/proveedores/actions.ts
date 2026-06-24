"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import type { TablesInsert } from "@/lib/types/database";

export type ActionResult = { ok: boolean; error?: string; id?: string };

type ProveedorInput = Partial<TablesInsert<"proveedores">> & { nombre?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

/** ¿Existe ya un proveedor con ese número de documento? (para evitar duplicados) */
export async function documentoExiste(
  numero: string,
  excludeId?: string,
): Promise<boolean> {
  const doc = numero.trim();
  if (!doc) return false;
  const supabase = await createClient();
  let q = supabase.from("proveedores").select("id").eq("numero_documento", doc);
  if (excludeId) q = q.neq("id", excludeId);
  const { data } = await q.limit(1);
  return (data?.length ?? 0) > 0;
}

function clean(input: ProveedorInput): ProveedorInput {
  // Strings vacíos → null; arrays se dejan tal cual.
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    out[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }
  return out as ProveedorInput;
}

export async function crearProveedor(input: ProveedorInput): Promise<ActionResult> {
  const session = await requireSession();
  if (!input.nombre?.trim()) return { ok: false, error: "El nombre es obligatorio." };
  if (input.numero_documento && (await documentoExiste(input.numero_documento)))
    return { ok: false, error: "Ya existe un proveedor con ese número de documento." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("proveedores")
    .insert({ ...clean(input), nombre: input.nombre.trim(), created_by: session.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  revalidatePath("/procesos/proveedores");
  return { ok: true, id: data.id };
}

export async function actualizarProveedor(
  id: string,
  input: ProveedorInput,
): Promise<ActionResult> {
  await requireSession();
  if (input.numero_documento && (await documentoExiste(input.numero_documento, id)))
    return { ok: false, error: "Otro proveedor ya tiene ese número de documento." };

  const supabase = await createClient();
  const { error } = await supabase.from("proveedores").update(clean(input)).eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/procesos/proveedores/${id}`);
  revalidatePath("/procesos/proveedores");
  return { ok: true, id };
}
