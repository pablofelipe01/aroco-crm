import "server-only";
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";
import { enviarCorreo } from "@/lib/correo/resend";
import { botonCorreo, escapar, marcoCorreo } from "@/lib/correo/html";
import type { FirmaFirmante, FirmaSobre, Json } from "@/lib/types/database";
import { fechaColombia, sellarPdf, sha256Hex, type FirmanteSellado } from "./pdf";
import { textosFirma } from "./textos";
import { MINUTOS_CODIGO, MINUTOS_VERIFICACION, turnoActual, type IdiomaFirma, type TipoSobre } from "./tipos";

/**
 * Lo que la firma hace del lado del servidor, con service_role.
 *
 * Quien firma no tiene cuenta: todo lo suyo pasa por aquí después de comprobar
 * su enlace. Cada paso deja su evento en `firmas_eventos` ANTES de darse por
 * hecho; si el evento no se puede escribir, el paso falla. Una firma sin su
 * evidencia no sirve.
 */

export const BUCKET = "firmas";
type Admin = ReturnType<typeof createAdminClient>;

// ── Enlaces y códigos ───────────────────────────────────────────────────────

export function generarToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function secreto(): string {
  return process.env.FIRMAS_SECRETO || serverEnv.SUPABASE_SERVICE_ROLE_KEY;
}

export function generarCodigo(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** HMAC atado al firmante: el mismo código de otro firmante no cuadra. */
export function hashCodigo(firmanteId: string, codigo: string): string {
  return createHmac("sha256", secreto()).update(`${firmanteId}:${codigo}`).digest("hex");
}

export function codigoCoincide(hash: string | null, firmanteId: string, codigo: string): boolean {
  if (!hash) return false;
  const a = Buffer.from(hash, "hex");
  const b = Buffer.from(hashCodigo(firmanteId, codigo), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Base pública de la firma. `NEXT_PUBLIC_FIRMA_URL` es el subdominio
 * (https://firma.aroco.co); sin él, el mismo dominio del CRM.
 */
export function urlBaseFirma(): string {
  return (process.env.NEXT_PUBLIC_FIRMA_URL || process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/+$/, "");
}
export const urlFirma = (token: string) => `${urlBaseFirma()}/firmar/${token}`;
export const urlVerificar = () => `${urlBaseFirma()}/verificar`;
/** Lo que se imprime en el PDF: sin «https://», para que se pueda dictar. */
export const urlVerificarCorta = () => urlVerificar().replace(/^https?:\/\//, "") || "firma.aroco.co/verificar";

export interface Contexto {
  ip: string | null;
  userAgent: string | null;
  actor?: string | null;
}

/** IP y navegador de quien hace la petición (Vercel pone la IP real primero). */
export async function contextoPeticion(): Promise<Contexto> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent")?.slice(0, 400) ?? null };
}

// ── Registro ────────────────────────────────────────────────────────────────

export async function registrarEvento(
  admin: Admin,
  ev: {
    sobreId: string;
    firmanteId?: string | null;
    tipo: string;
    detalle?: Record<string, Json | undefined>;
    ctx?: Contexto;
  },
): Promise<void> {
  const { error } = await admin.from("firmas_eventos").insert({
    sobre_id: ev.sobreId,
    firmante_id: ev.firmanteId ?? null,
    tipo: ev.tipo,
    detalle: (ev.detalle ?? {}) as Json,
    ip: ev.ctx?.ip ?? null,
    user_agent: ev.ctx?.userAgent ?? null,
    actor: ev.ctx?.actor ?? null,
  });
  if (error) throw new Error(`No se pudo registrar el evento «${ev.tipo}»: ${error.message}`);
}

export async function descargar(admin: Admin, path: string): Promise<Uint8Array> {
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`No se pudo leer ${path}: ${error?.message ?? "sin datos"}`);
  return new Uint8Array(await data.arrayBuffer());
}

// ── Correos ─────────────────────────────────────────────────────────────────

function parrafo(s: string, chico = false) {
  return `<p style="margin:${chico ? "12px 0 0;font-size:12px;color:#78716c" : "12px 0 0;font-size:14px;line-height:1.5"}">${escapar(s)}</p>`;
}

async function correoInvitacion(
  sobre: FirmaSobre,
  f: Pick<FirmaFirmante, "nombre" | "email">,
  enlace: string,
) {
  const t = textosFirma(sobre.idioma);
  const vence = sobre.vence_en ? fechaColombia(sobre.vence_en).slice(0, 10) : null;
  const cuerpo = [
    `<p style="margin:8px 0 0;font-size:18px;font-weight:700">${escapar(sobre.titulo)}</p>`,
    parrafo(t.correoCuerpo(f.nombre, sobre.titulo)),
    sobre.mensaje ? `<blockquote style="margin:12px 0 0;padding:8px 12px;border-left:3px solid #d6d3d1;color:#44403c;font-size:14px">${escapar(sobre.mensaje)}</blockquote>` : "",
    `<p style="margin:20px 0 0">${botonCorreo(t.correoBoton, enlace)}</p>`,
    vence ? parrafo(t.correoVence(vence), true) : "",
  ].join("\n");
  return enviarCorreo({
    para: f.email,
    asunto: t.asuntoFirma(sobre.titulo),
    html: marcoCorreo({ seccion: t.marca, cuerpo, pie: t.pie }),
    texto: `${t.correoCuerpo(f.nombre, sobre.titulo)}\n\n${sobre.mensaje ? sobre.mensaje + "\n\n" : ""}${enlace}\n\n${vence ? t.correoVence(vence) : ""}`,
  });
}

export async function correoCodigo(idioma: IdiomaFirma | string, email: string, codigo: string) {
  const t = textosFirma(idioma);
  const cuerpo = [
    `<p style="margin:16px 0 0;font-family:ui-monospace,Menlo,monospace;font-size:32px;font-weight:700;letter-spacing:.2em">${codigo}</p>`,
    parrafo(t.correoCodigo(codigo, MINUTOS_CODIGO)),
  ].join("\n");
  return enviarCorreo({
    para: email,
    asunto: t.asuntoCodigo,
    html: marcoCorreo({ seccion: t.marca, cuerpo, pie: t.pie }),
    texto: t.correoCodigo(codigo, MINUTOS_CODIGO),
  });
}

// ── Turnos ──────────────────────────────────────────────────────────────────

/**
 * Le da a un firmante un enlace nuevo (el anterior deja de servir) y se lo
 * manda por correo. Devuelve el enlace en claro para mostrarlo una vez en el
 * CRM: si el correo no llega, se puede mandar por WhatsApp a mano.
 */
export async function notificarFirmante(
  admin: Admin,
  sobre: FirmaSobre,
  f: FirmaFirmante,
  ctx: Contexto,
  regenerado = false,
): Promise<{ firmanteId: string; nombre: string; enlace: string; enviado: boolean; error?: string }> {
  const token = generarToken();
  const enlace = urlFirma(token);
  const { error } = await admin
    .from("firmas_firmantes")
    .update({
      token_hash: hashToken(token),
      estado: f.estado === "pendiente" ? "notificado" : f.estado,
      notificado_en: new Date().toISOString(),
      // Un enlace nuevo arranca la verificación de cero.
      codigo_hash: null,
      codigo_vence: null,
      codigo_intentos: 0,
      ...(f.estado === "firmado" || f.estado === "rechazado" ? {} : { verificado_en: null }),
    })
    .eq("id", f.id);
  if (error) throw new Error(`No se pudo generar el enlace de ${f.nombre}: ${error.message}`);

  const r = await correoInvitacion(sobre, f, enlace);
  await registrarEvento(admin, {
    sobreId: sobre.id,
    firmanteId: f.id,
    tipo: r.ok ? (regenerado ? "enlace_regenerado" : "notificado") : "notificacion_fallida",
    detalle: { canal: "email", email: f.email, ...(r.ok ? { id_correo: r.id } : { error: r.error }) },
    ctx,
  });
  return { firmanteId: f.id, nombre: f.nombre, enlace, enviado: r.ok, error: r.ok ? undefined : r.error };
}

/** Notifica a quienes les toca y aún no tienen enlace. */
export async function avanzarTurno(admin: Admin, sobreId: string, ctx: Contexto) {
  const { data: sobre } = await admin.from("firmas_sobres").select("*").eq("id", sobreId).single();
  if (!sobre || sobre.estado !== "enviado") return [];
  const { data: firmantes } = await admin
    .from("firmas_firmantes")
    .select("*")
    .eq("sobre_id", sobreId)
    .order("orden")
    .order("created_at");
  const turno = turnoActual(firmantes ?? [], sobre.en_orden).filter((f) => f.estado === "pendiente");
  const enlaces = [];
  for (const f of turno) enlaces.push(await notificarFirmante(admin, sobre, f, ctx));
  return enlaces;
}

// ── Cierre ──────────────────────────────────────────────────────────────────

/**
 * Si todos firmaron: arma el PDF firmado, lo guarda, cierra el sobre y se lo
 * manda a todos. Si dos firmas llegan a la vez, solo una sube el PDF (la
 * subida no sobrescribe) y la otra sale sin hacer nada.
 */
export async function cerrarSiCompleto(admin: Admin, sobreId: string, ctx: Contexto): Promise<boolean> {
  const { data: sobre } = await admin.from("firmas_sobres").select("*").eq("id", sobreId).single();
  if (!sobre || sobre.estado !== "enviado") return false;
  const { data: firmantes } = await admin
    .from("firmas_firmantes")
    .select("*")
    .eq("sobre_id", sobreId)
    .order("orden")
    .order("created_at");
  if (!firmantes?.length || firmantes.some((f) => f.estado !== "firmado")) return false;

  const original = await descargar(admin, sobre.original_path);
  if (sha256Hex(original) !== sobre.original_sha256) {
    throw new Error(`El original de ${sobre.codigo} no coincide con su huella: no se sella.`);
  }

  const [{ data: creador }, { data: eventos }, { data: cadenaOk }] = await Promise.all([
    admin.from("profiles").select("full_name").eq("id", sobre.created_by).single(),
    admin.from("firmas_eventos").select("*").eq("sobre_id", sobreId).order("id"),
    admin.rpc("firmas_cadena_integra", { p_sobre: sobreId }),
  ]);
  if (!cadenaOk) throw new Error(`La cadena de eventos de ${sobre.codigo} no cuadra: no se sella.`);
  const nombres = new Map(firmantes.map((f) => [f.id, f.nombre_firmado ?? f.nombre]));

  const sellados: FirmanteSellado[] = [];
  for (const f of firmantes) {
    sellados.push({
      nombre: f.nombre,
      nombreFirmado: f.nombre_firmado ?? f.nombre,
      documentoFirmado: f.documento_firmado,
      email: f.email,
      rol: f.rol,
      verificadoEn: f.verificado_en!,
      verificadoCanal: f.verificado_canal ?? "email",
      firmadoEn: f.firmado_en!,
      ip: f.firmado_ip,
      userAgent: f.firmado_user_agent,
      firma:
        f.firma_modo === "dibujada" && f.firma_path
          ? { modo: "dibujada", png: await descargar(admin, f.firma_path) }
          : { modo: "escrita" },
    });
  }

  const completadoEn = new Date().toISOString();
  const ev = eventos ?? [];
  const firmado = await sellarPdf({
    original,
    idioma: sobre.idioma === "en" ? "en" : "es",
    sobre: {
      codigo: sobre.codigo,
      titulo: sobre.titulo,
      tipo: sobre.tipo as TipoSobre,
      originalNombre: sobre.original_nombre,
      originalSha256: sobre.original_sha256,
      paginas: sobre.original_paginas,
      creadoPor: creador?.full_name ?? "AROCO S.A.S",
      enviadoEn: sobre.enviado_en ?? sobre.created_at,
      completadoEn,
    },
    firmantes: sellados,
    eventos: ev.map((e) => ({
      ocurridoEn: e.ocurrido_en,
      tipo: e.tipo,
      firmante: e.firmante_id ? (nombres.get(e.firmante_id) ?? null) : null,
      ip: e.ip,
    })),
    hashCadena: ev.at(-1)?.hash ?? "",
    urlVerificar: urlVerificarCorta(),
  });
  const huella = sha256Hex(firmado);
  const path = `sobres/${sobreId}/firmado.pdf`;

  const { error: eSubida } = await admin.storage
    .from(BUCKET)
    .upload(path, firmado, { contentType: "application/pdf", upsert: false });
  if (eSubida) {
    if (/exists|duplicate/i.test(eSubida.message)) return false; // otra firma ya lo cerró
    throw new Error(`No se pudo guardar el PDF firmado: ${eSubida.message}`);
  }

  const { error: eCierre } = await admin
    .from("firmas_sobres")
    .update({ estado: "completado", completado_en: completadoEn, firmado_path: path, firmado_sha256: huella })
    .eq("id", sobreId)
    .eq("estado", "enviado");
  if (eCierre) throw new Error(`No se pudo cerrar ${sobre.codigo}: ${eCierre.message}`);
  await registrarEvento(admin, {
    sobreId,
    tipo: "completado",
    detalle: { sha256_firmado: huella, bytes: firmado.length },
    ctx,
  });

  // Copia para todos. Un correo que falle no deshace el cierre: el PDF queda
  // en el CRM y en el enlace de cada firmante.
  const t = textosFirma(sobre.idioma);
  const destinatarios = new Set(firmantes.map((f) => f.email.toLowerCase()));
  const { data: correoCreador } = await admin.from("profiles").select("email").eq("id", sobre.created_by).single();
  if (correoCreador?.email) destinatarios.add(correoCreador.email.toLowerCase());
  const base64 = Buffer.from(firmado).toString("base64");
  const nombreArchivo = `${sobre.codigo} - ${sobre.titulo}`.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 120) + ".pdf";
  for (const para of destinatarios) {
    const r = await enviarCorreo({
      para,
      asunto: t.asuntoCompleto(sobre.titulo),
      html: marcoCorreo({
        seccion: t.marca,
        cuerpo: [
          `<p style="margin:8px 0 0;font-size:18px;font-weight:700">${escapar(sobre.titulo)}</p>`,
          parrafo(t.correoCompleto(sobre.titulo)),
          parrafo(`${t.correoVerificar} ${urlVerificar()}`, true),
          parrafo(`SHA-256: ${huella}`, true),
        ].join("\n"),
        pie: t.pie,
      }),
      texto: `${t.correoCompleto(sobre.titulo)}\n\n${t.correoVerificar} ${urlVerificar()}\nSHA-256: ${huella}`,
      adjuntos: [{ nombre: nombreArchivo, base64 }],
    });
    await registrarEvento(admin, {
      sobreId,
      tipo: r.ok ? "copia_enviada" : "copia_fallida",
      detalle: { email: para, ...(r.ok ? {} : { error: r.error }) },
      ctx,
    });
  }
  return true;
}

// ── Del lado de quien firma ─────────────────────────────────────────────────

export type AccesoFirma =
  | { estado: "invalido" }
  | {
      estado: "activo" | "anulado" | "vencido" | "firmado" | "rechazado" | "completo";
      sobre: FirmaSobre;
      firmante: FirmaFirmante;
    };

/** El firmante y su sobre a partir del enlace, y en qué punto está. */
export async function accesoPorToken(admin: Admin, token: string): Promise<AccesoFirma> {
  if (!/^[A-Za-z0-9_-]{40,60}$/.test(token)) return { estado: "invalido" };
  const { data: firmante } = await admin
    .from("firmas_firmantes")
    .select("*")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!firmante) return { estado: "invalido" };
  const { data: sobre } = await admin.from("firmas_sobres").select("*").eq("id", firmante.sobre_id).single();
  if (!sobre || sobre.estado === "borrador") return { estado: "invalido" };

  const base = { sobre, firmante };
  if (sobre.estado === "completado") return { estado: "completo", ...base };
  if (firmante.estado === "rechazado") return { estado: "rechazado", ...base };
  if (sobre.estado === "anulado") return { estado: "anulado", ...base };
  if (firmante.estado === "firmado") return { estado: "firmado", ...base };
  if (sobre.vence_en && new Date(sobre.vence_en) < new Date()) return { estado: "vencido", ...base };
  if (firmante.estado !== "notificado") return { estado: "invalido" };
  return { estado: "activo", ...base };
}

/** ¿Hay un evento de este tipo del firmante en los últimos `minutos`? (sin límite si se omite) */
export async function huboEvento(
  admin: Admin,
  firmanteId: string,
  tipo: string,
  minutos?: number,
): Promise<number> {
  let q = admin
    .from("firmas_eventos")
    .select("id", { count: "exact", head: true })
    .eq("firmante_id", firmanteId)
    .eq("tipo", tipo);
  if (minutos) q = q.gte("ocurrido_en", new Date(Date.now() - minutos * 60_000).toISOString());
  const { count } = await q;
  return count ?? 0;
}

/** ¿Sigue vigente la verificación de identidad? ¿Hay un código vivo? */
export function vigencias(f: Pick<FirmaFirmante, "verificado_en" | "codigo_vence">, ahora = Date.now()) {
  return {
    verificado:
      !!f.verificado_en && ahora - new Date(f.verificado_en).getTime() < MINUTOS_VERIFICACION * 60_000,
    codigoPendiente: !!f.codigo_vence && new Date(f.codigo_vence).getTime() > ahora,
  };
}
