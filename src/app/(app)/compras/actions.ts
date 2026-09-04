"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import {
  solicitudSchema,
  cotizacionSchema,
  cotizacionEditSchema,
} from "@/lib/schemas/compra";
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

/**
 * Una solicitud ya decidida no se edita: lo aprobado tiene que seguir diciendo
 * lo que se aprobó. El candado va aquí y no solo en los botones, porque la
 * interfaz se puede saltar.
 */
async function editable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  solicitudId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("compra_solicitudes")
    .select("estado")
    .eq("id", solicitudId)
    .maybeSingle();
  if (!data) return "No se encontró la solicitud.";
  if (data.estado === "Aprobada" || data.estado === "Rechazada") {
    return `Esta solicitud ya está ${data.estado.toLowerCase()} y no se puede modificar.`;
  }
  return null;
}

/**
 * Crea la solicitud con sus cotizaciones en un solo paso, desde el formulario
 * de alta. Antes había que crearla primero y volver a entrar al detalle a
 * cargarlas una por una, y una solicitud sin cotizaciones no se puede mandar a
 * aprobación: el flujo obligaba a dos viajes para algo que se sabe de una vez.
 *
 * Llega como FormData porque los PDF de los proveedores viajan con ella.
 */
export async function crearSolicitudConCotizaciones(
  formData: FormData,
): Promise<CompraResult & { avisos?: string[] }> {
  const parsed = solicitudSchema.safeParse({
    titulo: formData.get("titulo"),
    descripcion: formData.get("descripcion") ?? "",
    categoria: formData.get("categoria"),
    area: formData.get("area") ?? "",
    justificacion: formData.get("justificacion") ?? "",
  });
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

  // Las cotizaciones van después y por separado. Si alguna falla, la solicitud
  // NO se deshace: ya está en Borrador y se puede completar desde el detalle,
  // y botar lo que la persona acabó de escribir sería peor que decirle cuál
  // no entró.
  const avisos: string[] = [];
  const cuantas = Number(formData.get("cot_count") ?? 0);

  for (let i = 0; i < cuantas; i++) {
    const proveedor = String(formData.get(`cot_${i}_proveedor`) ?? "").trim();
    const monto = String(formData.get(`cot_${i}_monto`) ?? "").trim();
    // Una fila en blanco no es un error: es una que se agregó y no se llenó.
    if (!proveedor && !monto) continue;

    const cot = cotizacionSchema.safeParse({
      solicitud_id: data.id,
      proveedor_id: formData.get(`cot_${i}_proveedor_id`) ?? "",
      proveedor,
      nit: "",
      descripcion: formData.get(`cot_${i}_descripcion`) ?? "",
      monto,
      moneda: formData.get(`cot_${i}_moneda`) ?? "COP",
      incluye_iva: formData.get(`cot_${i}_incluye_iva`) === "on",
      valida_hasta: formData.get(`cot_${i}_valida_hasta`) ?? "",
      tiempo_entrega: formData.get(`cot_${i}_tiempo_entrega`) ?? "",
      notas: "",
    });
    if (!cot.success) {
      avisos.push(
        `Cotización ${i + 1}${proveedor ? ` (${proveedor})` : ""}: ${
          cot.error.issues[0]?.message ?? "datos inválidos"
        }`,
      );
      continue;
    }

    let archivo_path: string | null = null;
    let archivo_nombre: string | null = null;
    const file = formData.get(`cot_${i}_archivo`);
    if (file instanceof File && file.size > 0) {
      const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
      const path = `${data.id}/${Date.now()}-${i}-${safe}`;
      const { error: upErr } = await supabase.storage
        .from("compras")
        .upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (upErr) {
        // Se guarda la cotización igual, sin soporte, y se avisa: perder el
        // monto por un archivo que no subió sería peor.
        avisos.push(`No se pudo subir el archivo de ${cot.data.proveedor}: ${upErr.message}`);
      } else {
        archivo_path = path;
        archivo_nombre = file.name;
      }
    }

    const { error: cotErr } = await supabase.from("compra_cotizaciones").insert({
      ...cot.data,
      archivo_path,
      archivo_nombre,
      created_by: session.userId,
    });
    if (cotErr) avisos.push(`Cotización de ${cot.data.proveedor}: ${legible(cotErr.message)}`);
  }

  revalidatePath("/compras");
  return { ok: true, id: data.id, avisos: avisos.length ? avisos : undefined };
}

export async function editarSolicitud(id: string, input: unknown): Promise<CompraResult> {
  const parsed = solicitudSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  }
  await requireSession();
  const supabase = await createClient();
  const cerrada = await editable(supabase, id);
  if (cerrada) return { ok: false, error: cerrada };

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
    proveedor_id: formData.get("proveedor_id") ?? "",
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

/**
 * Corrige una cotización ya cargada. El archivo es opcional: si viene uno
 * nuevo reemplaza al anterior, y `quitar_archivo` lo deja sin soporte.
 */
export async function editarCotizacion(formData: FormData): Promise<CompraResult> {
  await requireSession();
  const supabase = await createClient();

  const parsed = cotizacionEditSchema.safeParse({
    id: formData.get("id"),
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
  const { id, ...campos } = parsed.data;

  const { data: actual } = await supabase
    .from("compra_cotizaciones")
    .select("solicitud_id, archivo_path")
    .eq("id", id)
    .maybeSingle();
  if (!actual) return { ok: false, error: "No se encontró la cotización." };

  const cerrada = await editable(supabase, actual.solicitud_id);
  if (cerrada) return { ok: false, error: cerrada };

  // El archivo se resuelve antes del update por la misma razón que al crear:
  // que no quede una cotización afirmando tener un soporte que no subió.
  let archivo: { archivo_path: string | null; archivo_nombre: string | null } | null = null;
  const file = formData.get("archivo");
  if (file instanceof File && file.size > 0) {
    const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-80);
    const path = `${actual.solicitud_id}/${Date.now()}-${safe}`;
    const { error: upErr } = await supabase.storage
      .from("compras")
      .upload(path, file, { contentType: file.type || "application/octet-stream" });
    if (upErr) return { ok: false, error: `No se pudo subir el archivo: ${upErr.message}` };
    archivo = { archivo_path: path, archivo_nombre: file.name };
  } else if (formData.get("quitar_archivo") === "on") {
    archivo = { archivo_path: null, archivo_nombre: null };
  }

  const { error } = await supabase
    .from("compra_cotizaciones")
    .update({ ...campos, ...(archivo ?? {}) })
    .eq("id", id);
  if (error) return { ok: false, error: legible(error.message) };

  // El anterior se borra solo después de que el update pasó: si se borrara
  // antes y el update fallara, la cotización quedaría apuntando a un archivo
  // que ya no existe.
  if (archivo && actual.archivo_path && actual.archivo_path !== archivo.archivo_path) {
    await supabase.storage.from("compras").remove([actual.archivo_path]);
  }

  revalidatePath("/compras");
  return { ok: true, id };
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

/**
 * Borra varias solicitudes de una pasada.
 *
 * Pedido en la revisión del 1-sep-2026: hasta ahora limpiar el módulo era
 * entrar solicitud por solicitud. Qué se puede borrar sigue decidiéndolo la
 * RLS —lo propio y en borrador, o cualquier cosa si es admin—, así que un
 * borrado masivo no puede llevarse por delante lo que ya se decidió: eso es
 * historial.
 *
 * Se informa CUÁNTAS se borraron y no solo «ok». Si la selección incluía
 * solicitudes ajenas, la base las deja quietas sin dar error, y decir «listo»
 * cuando se borraron tres de siete sería mentir por omisión.
 */
export async function borrarSolicitudes(
  ids: string[],
): Promise<CompraResult & { borradas?: number }> {
  await requireSession();
  if (ids.length === 0) return { ok: false, error: "No seleccionaste ninguna solicitud." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compra_solicitudes")
    .delete()
    .in("id", ids)
    .select("id");
  if (error) return { ok: false, error: legible(error.message) };

  revalidatePath("/compras");
  return { ok: true, borradas: data?.length ?? 0 };
}

/**
 * Borra varias cotizaciones de una solicitud.
 *
 * El candado de «solicitud ya decidida» se comprueba igual que en el borrado
 * de una sola: lo aprobado tiene que seguir mostrando contra qué alternativas
 * se aprobó.
 */
export async function borrarCotizaciones(
  solicitudId: string,
  ids: string[],
): Promise<CompraResult & { borradas?: number }> {
  await requireSession();
  if (ids.length === 0) return { ok: false, error: "No seleccionaste ninguna cotización." };

  const supabase = await createClient();
  const bloqueo = await editable(supabase, solicitudId);
  if (bloqueo) return { ok: false, error: bloqueo };

  const { data, error } = await supabase
    .from("compra_cotizaciones")
    .delete()
    .in("id", ids)
    // Acotado a la solicitud abierta: sin esto, una lista de ids manipulada
    // podría borrar cotizaciones de otra solicitud cualquiera.
    .eq("solicitud_id", solicitudId)
    .select("id");
  if (error) return { ok: false, error: legible(error.message) };

  revalidatePath("/compras");
  return { ok: true, borradas: data?.length ?? 0 };
}

export type SeguimientoAprobador = {
  profile_id: string;
  nombre: string;
  avisado_en: string | null;
  leido: boolean;
  decidio: boolean;
};

/**
 * Quién tiene que aprobar esta solicitud, desde cuándo lo sabe y quién decidió.
 *
 * Va por RPC porque el rastro vive en `notifications`, cuya RLS solo deja ver
 * lo dirigido a uno mismo. La función es SECURITY DEFINER y devuelve nombres y
 * fechas, nada más (ver migración 0080).
 */
export async function seguimientoAprobacion(
  solicitudId: string,
): Promise<{ ok: boolean; error?: string; aprobadores: SeguimientoAprobador[] }> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("compra_seguimiento_aprobacion", {
    p_solicitud: solicitudId,
  });
  if (error) return { ok: false, error: legible(error.message), aprobadores: [] };
  return { ok: true, aprobadores: (data ?? []) as SeguimientoAprobador[] };
}
