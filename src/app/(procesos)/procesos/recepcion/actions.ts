"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { logAudit } from "@/lib/procesos/audit";
import { notificarDepartamentos } from "@/lib/procesos/notificaciones";
import { FOTO_CATEGORIAS } from "@/lib/procesos/recepcion-opts";
import type { RecepcionEnvio } from "@/lib/procesos/recepcion-opts";
import type { TablesUpdate } from "@/lib/types/database";

export type ActionResult = { ok: boolean; error?: string; id?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

function num(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Abre la recepción de una OC emitida (una por OC). */
export async function crearRecepcion(ordenId: string): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: oc } = await supabase
    .from("ordenes_compra")
    .select("estado, volumen_kg, consecutivo")
    .eq("id", ordenId)
    .maybeSingle();
  if (!oc) return { ok: false, error: "Orden no encontrada." };
  if (oc.estado !== "Emitida")
    return { ok: false, error: "Solo se reciben órdenes emitidas en firme." };

  const { data: existe } = await supabase
    .from("recepciones")
    .select("id")
    .eq("orden_id", ordenId)
    .maybeSingle();
  if (existe) return { ok: true, id: existe.id };

  const { data, error } = await supabase
    .from("recepciones")
    .insert({
      orden_id: ordenId,
      peso_solicitado_kg: oc.volumen_kg,
      created_by: session.userId,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };
  await logAudit("recepcion", data.id, "crear", `Abrió recepción de la OC ${oc.consecutivo ?? ""}`.trim());
  revalidatePath("/procesos/recepcion");
  return { ok: true, id: data.id };
}

type RecepcionInput = {
  tipo_envio?: RecepcionEnvio | "";
  peso_recibido_kg?: number | string | null;
  humedad_pct?: number | string | null;
  fermentacion_pct?: number | string | null;
  impurezas_pct?: number | string | null;
  analisis_sensorial?: string | null;
  remisiones?: string | null;
  observaciones?: string | null;
};

export async function actualizarRecepcion(id: string, input: RecepcionInput): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { data: rec } = await supabase.from("recepciones").select("estado").eq("id", id).maybeSingle();
  if (!rec) return { ok: false, error: "Recepción no encontrada." };
  if (rec.estado !== "En proceso")
    return { ok: false, error: "La recepción ya está cerrada." };

  const row: TablesUpdate<"recepciones"> = {
    tipo_envio: input.tipo_envio ? input.tipo_envio : null,
    peso_recibido_kg: num(input.peso_recibido_kg),
    humedad_pct: num(input.humedad_pct),
    fermentacion_pct: num(input.fermentacion_pct),
    impurezas_pct: num(input.impurezas_pct),
    analisis_sensorial: input.analisis_sensorial?.trim() || null,
    remisiones: input.remisiones?.trim() || null,
    observaciones: input.observaciones?.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("recepciones").update(row).eq("id", id);
  if (error) return { ok: false, error: error.message };
  await logAudit("recepcion", id, "actualizar", "Actualizó datos de recepción");
  revalidatePath(`/procesos/recepcion/${id}`);
  return { ok: true, id };
}

// ── Fotos (bucket 'recepciones') ─────────────────────────────────────────────

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB (fotos)
const MAX_POR_CATEGORIA = 20;
const TIPOS_OK = ["image/png", "image/jpeg", "image/jpg", "application/pdf"];
const CATS = FOTO_CATEGORIAS.map((c) => c.id) as readonly string[];

export async function subirFoto(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const recepcionId = String(formData.get("recepcionId") ?? "");
  const categoria = String(formData.get("categoria") ?? "");
  const file = formData.get("file");

  if (!recepcionId || !CATS.includes(categoria))
    return { ok: false, error: "Petición inválida." };
  if (!(file instanceof File) || file.size === 0)
    return { ok: false, error: "Selecciona un archivo." };
  if (file.size > MAX_BYTES) return { ok: false, error: "El archivo supera 8 MB." };
  if (!TIPOS_OK.includes(file.type))
    return { ok: false, error: "Solo se permiten imágenes o PDF." };

  const supabase = await createClient();
  const { count } = await supabase
    .from("recepcion_fotos")
    .select("id", { count: "exact", head: true })
    .eq("recepcion_id", recepcionId)
    .eq("categoria", categoria);
  if ((count ?? 0) >= MAX_POR_CATEGORIA)
    return { ok: false, error: `Máximo ${MAX_POR_CATEGORIA} archivos por categoría.` };

  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
  const path = `${recepcionId}/${categoria}/${Date.now()}-${safe}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const up = await supabase.storage
    .from("recepciones")
    .upload(path, buffer, { contentType: file.type || "application/octet-stream" });
  if (up.error) return { ok: false, error: up.error.message };

  const { error } = await supabase.from("recepcion_fotos").insert({
    recepcion_id: recepcionId,
    categoria,
    nombre: file.name,
    file_path: path,
    size_bytes: file.size,
    content_type: file.type,
    uploaded_by: session.userId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/procesos/recepcion/${recepcionId}`);
  return { ok: true };
}

export async function eliminarFoto(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { data: foto } = await supabase
    .from("recepcion_fotos")
    .select("recepcion_id, file_path")
    .eq("id", id)
    .maybeSingle();
  if (!foto) return { ok: false, error: "Foto no encontrada." };
  await supabase.storage.from("recepciones").remove([foto.file_path]);
  const { error } = await supabase.from("recepcion_fotos").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/procesos/recepcion/${foto.recepcion_id}`);
  return { ok: true };
}

export async function urlFoto(filePath: string): Promise<string | null> {
  await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.storage.from("recepciones").createSignedUrl(filePath, 120);
  return data?.signedUrl ?? null;
}

/** Cierra el reporte de recepción y avisa que la OC está lista para liquidar. */
export async function cerrarRecepcion(id: string): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: rec } = await supabase
    .from("recepciones")
    .select("estado, tipo_envio, peso_recibido_kg, orden_id, ordenes_compra(consecutivo)")
    .eq("id", id)
    .maybeSingle();
  if (!rec) return { ok: false, error: "Recepción no encontrada." };
  if (rec.estado === "Cerrada") return { ok: false, error: "La recepción ya está cerrada." };
  if (!rec.tipo_envio) return { ok: false, error: "Indica el tipo de envío." };
  if (rec.peso_recibido_kg == null) return { ok: false, error: "Registra el peso recibido." };

  const { count } = await supabase
    .from("recepcion_fotos")
    .select("id", { count: "exact", head: true })
    .eq("recepcion_id", id);
  if ((count ?? 0) === 0)
    return { ok: false, error: "Carga al menos una foto del registro (bultos/camión)." };

  const { error } = await supabase
    .from("recepciones")
    .update({
      estado: "Cerrada",
      recibido_por: session.userId,
      cerrada_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  const consecutivo =
    (rec.ordenes_compra as unknown as { consecutivo?: string } | null)?.consecutivo ?? "";
  await logAudit("recepcion", id, "cerrar", `Cerró el reporte de recepción ${consecutivo}`.trim());
  await notificarDepartamentos(["Comercial", "Administrativo"], {
    tipo: "recepcion_cerrada",
    titulo: `Recepción cerrada — OC ${consecutivo}`.trim(),
    cuerpo: "El cacao fue recibido y evaluado. Lista para liquidación (Fase 4).",
    enlace: `/procesos/recepcion/${id}`,
    entidad: "recepcion",
    entidadId: id,
  });
  revalidatePath(`/procesos/recepcion/${id}`);
  revalidatePath("/procesos/recepcion");
  return { ok: true, id };
}
