"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { logAudit } from "@/lib/procesos/audit";
import {
  notificarGerenciaAdministrativa,
  notificarUsuarios,
} from "@/lib/procesos/notificaciones";
import type { TablesInsert, TablesUpdate } from "@/lib/types/database";

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
  const nombre = input.nombre.trim();
  await logAudit("proveedor", data.id, "crear", `Creó el proveedor "${nombre}"`);
  await notificarGerenciaAdministrativa(
    {
      tipo: "proveedor_en_estudio",
      titulo: "Nuevo proveedor en estudio",
      cuerpo: `${nombre} fue registrado y está pendiente de aprobación.`,
      enlace: `/procesos/proveedores/${data.id}`,
      entidad: "proveedor",
      entidadId: data.id,
    },
    session.userId,
  );
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
  await logAudit("proveedor", id, "actualizar", "Actualizó los datos del proveedor");
  revalidatePath(`/procesos/proveedores/${id}`);
  revalidatePath("/procesos/proveedores");
  return { ok: true, id };
}

// ── Documentos soporte (Supabase Storage, bucket 'proveedores') ──────────────

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_POR_CATEGORIA = 10;
const TIPOS_OK = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
const CATEGORIAS_DOC = ["legales", "tecnicos", "contrato"] as const;

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

  await logAudit(
    "documento",
    proveedorId,
    "documento_subir",
    `Subió documento (${categoria}): ${file.name}`,
  );
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

  await logAudit("documento", doc.proveedor_id, "documento_eliminar", "Eliminó un documento soporte");
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

// ── Aprobación / estado (Fase 1) ─────────────────────────────────────────────

const ESTADOS = ["En estudio", "Habilitado", "Deshabilitado", "Rechazado"] as const;
type EstadoProv = (typeof ESTADOS)[number];

/** ¿El usuario puede gestionar el estado del proveedor? (Gerencia Administrativa) */
export async function puedeAprobar(): Promise<boolean> {
  const session = await getSessionContext();
  return (
    session?.profile?.role === "admin" ||
    session?.profile?.department === "Administrativo"
  );
}

/** Cambia el estado del proveedor dejando trazabilidad (fecha, usuario, motivo). */
export async function cambiarEstadoProveedor(
  proveedorId: string,
  nuevoEstado: EstadoProv,
  motivo?: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!(await puedeAprobar()))
    return { ok: false, error: "Solo Gerencia Administrativa puede cambiar el estado." };
  if (!ESTADOS.includes(nuevoEstado)) return { ok: false, error: "Estado inválido." };
  if ((nuevoEstado === "Rechazado" || nuevoEstado === "Deshabilitado") && !motivo?.trim())
    return { ok: false, error: "Indica el motivo." };

  const supabase = await createClient();
  const { data: prov } = await supabase
    .from("proveedores")
    .select("estado, nombre, created_by")
    .eq("id", proveedorId)
    .maybeSingle();
  if (!prov) return { ok: false, error: "Proveedor no encontrado." };
  if (prov.estado === nuevoEstado) return { ok: false, error: "El proveedor ya está en ese estado." };

  const { error: e1 } = await supabase
    .from("proveedores")
    .update({ estado: nuevoEstado, comentarios_estado: motivo?.trim() || null })
    .eq("id", proveedorId);
  if (e1) return { ok: false, error: e1.message };

  await supabase.from("proveedor_estado_log").insert({
    proveedor_id: proveedorId,
    estado_anterior: prov.estado,
    estado_nuevo: nuevoEstado,
    motivo: motivo?.trim() || null,
    usuario_id: session.userId,
    usuario_nombre: session.profile?.full_name ?? null,
  });

  await logAudit(
    "proveedor",
    proveedorId,
    "estado",
    `Cambió el estado: ${prov.estado} → ${nuevoEstado}`,
    motivo?.trim() ? { motivo: motivo.trim() } : undefined,
  );

  // Avisa al creador cuando su proveedor queda resuelto (habilitado o rechazado).
  if (
    (nuevoEstado === "Habilitado" || nuevoEstado === "Rechazado") &&
    prov.created_by &&
    prov.created_by !== session.userId
  ) {
    await notificarUsuarios([prov.created_by], {
      tipo: "proveedor_resuelto",
      titulo:
        nuevoEstado === "Habilitado"
          ? `Proveedor habilitado: ${prov.nombre}`
          : `Proveedor rechazado: ${prov.nombre}`,
      cuerpo:
        nuevoEstado === "Rechazado" && motivo?.trim()
          ? `Motivo: ${motivo.trim()}`
          : undefined,
      enlace: `/procesos/proveedores/${proveedorId}`,
      entidad: "proveedor",
      entidadId: proveedorId,
    });
  }

  revalidatePath(`/procesos/proveedores/${proveedorId}`);
  revalidatePath("/procesos/proveedores");
  return { ok: true };
}

// ── Contrato (uno por proveedor) ─────────────────────────────────────────────

type ContratoInput = Partial<TablesInsert<"contratos">>;

const NUM_CONTRATO = ["humedad_maxima", "granos_enteros_minimo", "fermentacion_minima"];

/** Crea o actualiza el contrato del proveedor (upsert por proveedor_id). */
export async function guardarContrato(
  proveedorId: string,
  input: ContratoInput,
): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const row: Record<string, unknown> = { proveedor_id: proveedorId };
  for (const [k, v] of Object.entries(input)) {
    if (k === "proveedor_id") continue;
    if (NUM_CONTRATO.includes(k)) row[k] = v === "" || v == null ? null : Number(v);
    else row[k] = typeof v === "string" && v.trim() === "" ? null : v;
  }

  const { data: existe } = await supabase
    .from("contratos")
    .select("id")
    .eq("proveedor_id", proveedorId)
    .maybeSingle();

  const { error } = existe
    ? await supabase
        .from("contratos")
        .update(row as unknown as TablesUpdate<"contratos">)
        .eq("id", existe.id)
    : await supabase
        .from("contratos")
        .insert({ ...row, created_by: session.userId } as unknown as TablesInsert<"contratos">);
  if (error) return { ok: false, error: error.message };

  await logAudit(
    "contrato",
    proveedorId,
    existe ? "actualizar" : "crear",
    existe ? "Actualizó el contrato" : "Generó el contrato",
  );
  revalidatePath(`/procesos/proveedores/${proveedorId}`);
  return { ok: true };
}

/** Agrega una observación fechada a las novedades del contrato (proveedor / aroco). */
export async function agregarNovedad(
  contratoId: string,
  origen: "proveedor" | "aroco",
  texto: string,
): Promise<ActionResult> {
  const session = await requireSession();
  if (!texto.trim()) return { ok: false, error: "Escribe la observación." };
  const supabase = await createClient();
  const campo = origen === "proveedor" ? "novedades_proveedor" : "novedades_aroco";

  const { data: c } = await supabase
    .from("contratos")
    .select(`id, proveedor_id, ${campo}`)
    .eq("id", contratoId)
    .maybeSingle();
  if (!c) return { ok: false, error: "Contrato no encontrado." };

  const fecha = new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
  const autor = session.profile?.full_name ?? "Usuario";
  const previo = (c as Record<string, string | null>)[campo] ?? "";
  const linea = `[${fecha} · ${autor}] ${texto.trim()}`;
  const nuevo = previo ? `${linea}\n${previo}` : linea;

  const { error } = await supabase
    .from("contratos")
    .update({ [campo]: nuevo } as unknown as TablesUpdate<"contratos">)
    .eq("id", contratoId);
  if (error) return { ok: false, error: error.message };

  await logAudit("contrato", c.proveedor_id, "novedad", `Agregó una novedad (${origen})`);
  revalidatePath(`/procesos/proveedores/${c.proveedor_id}`);
  return { ok: true };
}
