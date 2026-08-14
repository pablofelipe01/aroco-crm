"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { solicitudSchema, cotizacionSchema } from "@/lib/schemas/compra";
import type { Database } from "@/lib/types/database";

export type CompraResult = { ok: boolean; error?: string; id?: string };

type Dept = Database["public"]["Enums"]["department"];

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

/** Traduce los errores de la base a algo que el equipo entienda. */
function legible(mensaje: string): string {
  if (/42501|aprueban compras|reabrir/i.test(mensaje)) {
    return "Solo Álvaro, Nicolás o Luis Ernesto pueden decidir sobre una solicitud.";
  }
  if (/no pertenece a esta solicitud/i.test(mensaje)) {
    return "Esa cotización no es de esta solicitud.";
  }
  if (/row-level|policy|permission/i.test(mensaje)) {
    return "No tienes permiso para esta acción.";
  }
  return mensaje;
}

export async function crearSolicitud(input: unknown): Promise<CompraResult> {
  const parsed = solicitudSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  const session = await requireSession();
  const supabase = await createClient();
  const { area, ...resto } = parsed.data;
  const { data, error } = await supabase
    .from("compra_solicitudes")
    .insert({ ...resto, area: (area as Dept | null) ?? null, created_by: session.userId })
    .select("id")
    .single();
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/compras");
  return { ok: true, id: data.id };
}

export async function editarSolicitud(id: string, input: unknown): Promise<CompraResult> {
  const parsed = solicitudSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  await requireSession();
  const supabase = await createClient();
  const { area, ...resto } = parsed.data;
  const { error } = await supabase
    .from("compra_solicitudes")
    .update({ ...resto, area: (area as Dept | null) ?? null })
    .eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/compras");
  return { ok: true, id };
}

/**
 * Sube una cotización con su archivo. Llega como FormData porque el PDF o la
 * foto del proveedor viaja en la misma acción.
 */
export async function subirCotizacion(formData: FormData): Promise<CompraResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const parsed = cotizacionSchema.safeParse({
    solicitud_id: formData.get("solicitud_id"),
    proveedor: formData.get("proveedor"),
    nit: formData.get("nit") ?? "",
    descripcion: formData.get("descripcion") ?? "",
    monto: formData.get("monto") ?? "",
    moneda: formData.get("moneda") ?? "COP",
    incluye_iva: formData.get("incluye_iva") === "on",
    valida_hasta: formData.get("valida_hasta") ?? "",
    tiempo_entrega: formData.get("tiempo_entrega") ?? "",
    notas: formData.get("notas") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }

  // El archivo se sube primero: si falla, no queda una cotización que dice
  // tener soporte y no lo tiene.
  let archivo_path: string | null = null;
  let archivo_nombre: string | null = null;
  const file = formData.get("archivo");
  if (file instanceof File && file.size > 0) {
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${parsed.data.solicitud_id}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage
      .from("compras")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (upErr) return { ok: false, error: `No se pudo subir el archivo: ${upErr.message}` };
    archivo_path = path;
    archivo_nombre = file.name;
  }

  const { error } = await supabase.from("compra_cotizaciones").insert({
    ...parsed.data,
    archivo_path,
    archivo_nombre,
    created_by: session.userId,
  });
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/compras");
  return { ok: true };
}

export async function borrarCotizacion(id: string): Promise<CompraResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("compra_cotizaciones").delete().eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/compras");
  return { ok: true };
}

/** Enlace firmado para abrir el archivo de una cotización. */
export async function urlCotizacion(path: string): Promise<string | null> {
  const session = await getSessionContext();
  if (!session) return null;
  const supabase = await createClient();
  const { data } = await supabase.storage.from("compras").createSignedUrl(path, 120);
  return data?.signedUrl ?? null;
}

/** Manda la solicitud a aprobación. Sin cotizaciones no hay nada que aprobar. */
export async function enviarAAprobacion(id: string): Promise<CompraResult> {
  await requireSession();
  const supabase = await createClient();

  const { count } = await supabase
    .from("compra_cotizaciones")
    .select("id", { count: "exact", head: true })
    .eq("solicitud_id", id);
  if (!count) {
    return { ok: false, error: "Sube al menos una cotización antes de pedir aprobación." };
  }

  const { error } = await supabase
    .from("compra_solicitudes")
    .update({ estado: "Pendiente" })
    .eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/compras");
  return { ok: true };
}

/** Aprueba la solicitud eligiendo una de sus cotizaciones. */
export async function aprobarSolicitud(
  id: string,
  cotizacionId: string,
): Promise<CompraResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("compra_solicitudes")
    .update({
      estado: "Aprobada",
      cotizacion_elegida_id: cotizacionId,
      aprobada_por: session.userId,
      aprobada_en: new Date().toISOString(),
      motivo_rechazo: null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/compras");
  return { ok: true };
}

export async function rechazarSolicitud(
  id: string,
  motivo: string,
): Promise<CompraResult> {
  const session = await requireSession();
  if (!motivo.trim()) {
    // Un rechazo sin motivo obliga a quien pidió a adivinar qué corregir.
    return { ok: false, error: "Escribe por qué se rechaza." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("compra_solicitudes")
    .update({
      estado: "Rechazada",
      motivo_rechazo: motivo.trim(),
      aprobada_por: session.userId,
      aprobada_en: new Date().toISOString(),
      cotizacion_elegida_id: null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/compras");
  return { ok: true };
}

export async function registrarPago(
  id: string,
  medio: string,
  referencia: string,
): Promise<CompraResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("compra_solicitudes")
    .update({
      pagada_en: new Date().toISOString(),
      pago_medio: medio.trim() || null,
      pago_referencia: referencia.trim() || null,
      pagada_por: session.userId,
    })
    .eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/compras");
  return { ok: true };
}

export async function registrarEntrega(
  id: string,
  notas: string,
): Promise<CompraResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase
    .from("compra_solicitudes")
    .update({
      recibida_en: new Date().toISOString(),
      recibida_por: session.userId,
      entrega_notas: notas.trim() || null,
    })
    .eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/compras");
  return { ok: true };
}

export async function borrarSolicitud(id: string): Promise<CompraResult> {
  await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from("compra_solicitudes").delete().eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };
  revalidatePath("/compras");
  return { ok: true };
}
