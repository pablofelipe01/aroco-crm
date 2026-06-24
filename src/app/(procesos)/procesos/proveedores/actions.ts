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

// ── Documentos soporte (Supabase Storage, bucket 'proveedores') ──────────────

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_POR_CATEGORIA = 10;
const TIPOS_OK = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
export const CATEGORIAS_DOC = ["legales", "tecnicos", "contrato"] as const;

/** Sube un documento soporte de un proveedor (FormData: proveedorId, categoria, file). */
export async function subirDocumento(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const proveedorId = String(formData.get("proveedorId") ?? "");
  const categoria = String(formData.get("categoria") ?? "");
  const file = formData.get("file");

  if (!proveedorId || !CATEGORIAS_DOC.includes(categoria as (typeof CATEGORIAS_DOC)[number]))
    return { ok: false, error: "Petición inválida." };
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Selecciona un archivo." };
  if (file.size > MAX_BYTES) return { ok: false, error: "El archivo supera 5 MB." };
  if (!TIPOS_OK.includes(file.type))
    return { ok: false, error: "Solo se permiten PDF o imágenes." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("proveedor_documentos")
    .select("id", { count: "exact", head: true })
    .eq("proveedor_id", proveedorId)
    .eq("categoria", categoria);
  if ((count ?? 0) >= MAX_POR_CATEGORIA)
    return { ok: false, error: `Máximo ${MAX_POR_CATEGORIA} archivos por categoría.` };

  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${proveedorId}/${categoria}/${Date.now()}-${safe}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const up = await supabase.storage
    .from("proveedores")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  if (up.error) return { ok: false, error: up.error.message };

  const { error } = await supabase.from("proveedor_documentos").insert({
    proveedor_id: proveedorId,
    categoria,
    nombre: file.name,
    file_path: path,
    size_bytes: file.size,
    content_type: file.type,
    uploaded_by: session.userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/procesos/proveedores/${proveedorId}`);
  return { ok: true };
}

export async function eliminarDocumento(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { data: doc } = await supabase
    .from("proveedor_documentos")
    .select("proveedor_id, file_path")
    .eq("id", id)
    .maybeSingle();
  if (!doc) return { ok: false, error: "Documento no encontrado." };

  await supabase.storage.from("proveedores").remove([doc.file_path]);
  const { error } = await supabase.from("proveedor_documentos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/procesos/proveedores/${doc.proveedor_id}`);
  return { ok: true };
}

/** URL firmada (2 min) para descargar/ver un documento. */
export async function urlDocumento(filePath: string): Promise<string | null> {
  await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("proveedores").createSignedUrl(filePath, 120);
  return data?.signedUrl ?? null;
}
