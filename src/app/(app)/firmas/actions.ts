"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inspeccionarPdf, PdfNoValido, sha256Hex } from "@/lib/firmas/pdf";
import {
  avanzarTurno,
  BUCKET,
  cerrarSiCompleto,
  contextoPeticion,
  descargar,
  notificarFirmante,
  registrarEvento,
} from "@/lib/firmas/servidor";
import { DIAS_VIGENCIA, TIPOS_SOBRE } from "@/lib/firmas/tipos";

/**
 * Acciones del módulo Firmas en el CRM. Las lecturas y escrituras de sobres y
 * firmantes van con la sesión de quien opera (la RLS decide qué puede ver y
 * tocar); el registro de eventos y los archivos, con service_role, porque nadie
 * desde el navegador puede escribir evidencia.
 */

type Enlace = { firmanteId: string; nombre: string; enlace: string; enviado: boolean; error?: string };
type Res<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_BYTES = 15 * 1024 * 1024;

const esquemaSobre = z.object({
  path: z.string().min(1),
  nombreArchivo: z.string().min(1).max(200),
  titulo: z.string().trim().min(3, "El título es muy corto.").max(200),
  tipo: z.enum(TIPOS_SOBRE),
  idioma: z.enum(["es", "en"]),
  mensaje: z.string().trim().max(2000).optional(),
  enOrden: z.boolean(),
  firmantes: z
    .array(
      z.object({
        nombre: z.string().trim().min(3, "Falta el nombre de un firmante.").max(120),
        email: z.string().trim().toLowerCase().email("Hay un correo de firmante que no es válido."),
        documento: z.string().trim().max(40).optional(),
        rol: z.string().trim().max(80).optional(),
      }),
    )
    .min(1, "Agrega al menos un firmante.")
    .max(10, "Máximo 10 firmantes por sobre."),
  enviar: z.boolean(),
});

async function sesion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function crearSobre(
  input: z.input<typeof esquemaSobre>,
): Promise<Res<{ id: string; enlaces: Enlace[] }>> {
  const parsed = esquemaSobre.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos incompletos." };
  const d = parsed.data;
  const { supabase, user } = await sesion();
  if (!user) return { ok: false, error: "Tu sesión venció. Vuelve a entrar." };

  const correos = d.firmantes.map((f) => f.email);
  if (new Set(correos).size !== correos.length) {
    return { ok: false, error: "Hay dos firmantes con el mismo correo." };
  }
  // El original lo subió el navegador a su carpeta; nadie pasa la ruta de otro.
  if (!d.path.startsWith(`originales/${user.id}/`) || !d.path.endsWith(".pdf")) {
    return { ok: false, error: "Ruta de archivo no válida." };
  }

  const admin = createAdminClient();
  let bytes: Uint8Array;
  let paginas: number;
  try {
    bytes = await descargar(admin, d.path);
    if (bytes.length > MAX_BYTES) return { ok: false, error: "El PDF pasa de 15 MB." };
    ({ paginas } = await inspeccionarPdf(bytes));
  } catch (e) {
    return { ok: false, error: e instanceof PdfNoValido ? e.message : "No se pudo leer el PDF subido." };
  }

  const { data: sobre, error } = await supabase
    .from("firmas_sobres")
    .insert({
      titulo: d.titulo,
      tipo: d.tipo,
      idioma: d.idioma,
      mensaje: d.mensaje || null,
      en_orden: d.enOrden,
      original_path: d.path,
      original_nombre: d.nombreArchivo,
      original_sha256: sha256Hex(bytes),
      original_paginas: paginas,
      original_bytes: bytes.length,
    })
    .select("*")
    .single();
  if (error || !sobre) {
    return { ok: false, error: error?.message.includes("row-level") ? "Tu área no puede crear sobres de firma." : `No se pudo crear: ${error?.message}` };
  }

  const { error: eF } = await supabase.from("firmas_firmantes").insert(
    d.firmantes.map((f, i) => ({
      sobre_id: sobre.id,
      orden: d.enOrden ? i + 1 : 1,
      nombre: f.nombre,
      email: f.email,
      documento: f.documento || null,
      rol: f.rol || null,
    })),
  );
  if (eF) {
    await supabase.from("firmas_sobres").update({ estado: "anulado", motivo_anulacion: "Error al crear" }).eq("id", sobre.id);
    return { ok: false, error: `No se pudieron guardar los firmantes: ${eF.message}` };
  }

  const ctx = { ...(await contextoPeticion()), actor: user.id };
  await registrarEvento(admin, {
    sobreId: sobre.id,
    tipo: "creado",
    detalle: {
      sha256: sobre.original_sha256,
      archivo: d.nombreArchivo,
      paginas,
      firmantes: d.firmantes.map((f) => ({ nombre: f.nombre, email: f.email })),
    },
    ctx,
  });

  let enlaces: Enlace[] = [];
  if (d.enviar) {
    const r = await enviarSobre(sobre.id);
    if (!r.ok) return { ok: false, error: `Se creó el borrador, pero no se pudo enviar: ${r.error}` };
    enlaces = r.enlaces;
  }
  revalidatePath("/firmas");
  return { ok: true, id: sobre.id, enlaces };
}

export async function enviarSobre(id: string): Promise<Res<{ enlaces: Enlace[] }>> {
  const { supabase, user } = await sesion();
  if (!user) return { ok: false, error: "Tu sesión venció." };
  const { data: sobre } = await supabase.from("firmas_sobres").select("*").eq("id", id).maybeSingle();
  if (!sobre) return { ok: false, error: "No encontré el sobre." };
  if (sobre.estado !== "borrador") return { ok: false, error: "El sobre ya se envió." };
  const { count } = await supabase
    .from("firmas_firmantes")
    .select("id", { count: "exact", head: true })
    .eq("sobre_id", id);
  if (!count) return { ok: false, error: "El sobre no tiene firmantes." };

  const ahora = new Date();
  const { error } = await supabase
    .from("firmas_sobres")
    .update({
      estado: "enviado",
      enviado_en: ahora.toISOString(),
      vence_en: new Date(ahora.getTime() + DIAS_VIGENCIA * 86_400_000).toISOString(),
    })
    .eq("id", id)
    .eq("estado", "borrador");
  if (error) return { ok: false, error: error.message };

  const admin = createAdminClient();
  const ctx = { ...(await contextoPeticion()), actor: user.id };
  await registrarEvento(admin, { sobreId: id, tipo: "enviado", detalle: { dias_vigencia: DIAS_VIGENCIA }, ctx });
  const enlaces = await avanzarTurno(admin, id, ctx);
  revalidatePath("/firmas");
  revalidatePath(`/firmas/${id}`);
  return { ok: true, enlaces };
}

/** Enlace nuevo para un firmante (el anterior deja de servir) y correo otra vez. */
export async function nuevoEnlace(firmanteId: string): Promise<Res<{ enlace: Enlace }>> {
  const { supabase, user } = await sesion();
  if (!user) return { ok: false, error: "Tu sesión venció." };
  const { data: f } = await supabase.from("firmas_firmantes").select("*").eq("id", firmanteId).maybeSingle();
  if (!f) return { ok: false, error: "No encontré al firmante." };
  const { data: sobre } = await supabase.from("firmas_sobres").select("*").eq("id", f.sobre_id).single();
  if (!sobre || sobre.estado !== "enviado") return { ok: false, error: "El sobre no está en firma." };
  if (f.estado !== "notificado") return { ok: false, error: "A este firmante todavía no le toca o ya terminó." };

  const admin = createAdminClient();
  const enlace = await notificarFirmante(admin, sobre, f, { ...(await contextoPeticion()), actor: user.id }, true);
  revalidatePath(`/firmas/${sobre.id}`);
  return { ok: true, enlace };
}

export async function anularSobre(id: string, motivo: string): Promise<Res> {
  const { supabase, user } = await sesion();
  if (!user) return { ok: false, error: "Tu sesión venció." };
  const texto = motivo.trim();
  if (texto.length < 3) return { ok: false, error: "Escribe el motivo." };
  const { data, error } = await supabase
    .from("firmas_sobres")
    .update({ estado: "anulado", anulado_en: new Date().toISOString(), motivo_anulacion: texto })
    .eq("id", id)
    .in("estado", ["borrador", "enviado"])
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "Este sobre ya no se puede anular." };
  await registrarEvento(createAdminClient(), {
    sobreId: id,
    tipo: "anulado",
    detalle: { motivo: texto },
    ctx: { ...(await contextoPeticion()), actor: user.id },
  });
  revalidatePath("/firmas");
  revalidatePath(`/firmas/${id}`);
  return { ok: true };
}

/** Si el cierre falló cuando firmó el último (ver `cierre_fallido`), se reintenta aquí. */
export async function reintentarCierre(id: string): Promise<Res> {
  const { supabase, user } = await sesion();
  if (!user) return { ok: false, error: "Tu sesión venció." };
  const { data: sobre } = await supabase.from("firmas_sobres").select("id").eq("id", id).maybeSingle();
  if (!sobre) return { ok: false, error: "No encontré el sobre." };
  try {
    const cerrado = await cerrarSiCompleto(createAdminClient(), id, {
      ...(await contextoPeticion()),
      actor: user.id,
    });
    if (!cerrado) return { ok: false, error: "Aún faltan firmas, o ya estaba cerrado." };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath(`/firmas/${id}`);
  return { ok: true };
}

/** URL de descarga de dos minutos, solo si la RLS deja ver el sobre. */
export async function urlArchivo(id: string, cual: "original" | "firmado"): Promise<Res<{ url: string }>> {
  const { supabase } = await sesion();
  const { data: sobre } = await supabase
    .from("firmas_sobres")
    .select("codigo, titulo, original_path, original_nombre, firmado_path")
    .eq("id", id)
    .maybeSingle();
  if (!sobre) return { ok: false, error: "No encontré el sobre." };
  const path = cual === "firmado" ? sobre.firmado_path : sobre.original_path;
  if (!path) return { ok: false, error: "Todavía no hay PDF firmado." };
  const nombre = cual === "firmado" ? `${sobre.codigo} - ${sobre.titulo}.pdf` : sobre.original_nombre;
  const { data, error } = await createAdminClient()
    .storage.from(BUCKET)
    .createSignedUrl(path, 120, { download: nombre });
  if (error || !data) return { ok: false, error: error?.message ?? "No se pudo generar el enlace." };
  return { ok: true, url: data.signedUrl };
}
