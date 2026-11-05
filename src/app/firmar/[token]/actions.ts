"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { enviarCorreo } from "@/lib/correo/resend";
import { escapar, marcoCorreo } from "@/lib/correo/html";
import { sha256Hex } from "@/lib/firmas/pdf";
import {
  accesoPorToken,
  avanzarTurno,
  BUCKET,
  cerrarSiCompleto,
  codigoCoincide,
  contextoPeticion,
  correoCodigo,
  descargar,
  generarCodigo,
  hashCodigo,
  huboEvento,
  registrarEvento,
} from "@/lib/firmas/servidor";
import { textosFirma, VERSION_CONSENTIMIENTO } from "@/lib/firmas/textos";
import {
  CODIGOS_POR_HORA,
  ESPERA_REENVIO_S,
  enmascararCorreo,
  INTENTOS_CODIGO,
  MINUTOS_CODIGO,
  MINUTOS_VERIFICACION,
} from "@/lib/firmas/tipos";

/**
 * Acciones de quien firma. No hay sesión: cada una vuelve a comprobar el
 * enlace desde cero y deja su evento. Los mensajes de error van en el idioma
 * del sobre porque los lee alguien de fuera.
 */

type Resultado = { ok: true } | { ok: false; error: string };

const MSG = {
  es: {
    noDisponible: "Este enlace ya no está disponible. Recarga la página.",
    espera: (s: number) => `Espera ${s} segundos para pedir otro código.`,
    muchos: "Pediste demasiados códigos. Intenta de nuevo en una hora.",
    noEnviado: "No pudimos enviar el código. Escríbenos a info@aroco.co.",
    sinCodigo: "Pide un código primero.",
    vencido: "El código venció. Pide otro.",
    agotado: "Demasiados intentos. Pide otro código.",
    incorrecto: (n: number) => `Código incorrecto. Te quedan ${n} intentos.`,
    abre: "Abre el documento antes de firmar.",
    verifica: "Confirma tu identidad antes de firmar.",
    nombre: "Escribe tu nombre completo.",
    documento: "Escribe tu número de documento.",
    consentimiento: "Debes aceptar firmar electrónicamente.",
    firma: "La imagen de la firma no es válida. Dibújala de nuevo.",
    integridad: "El documento cambió desde que se envió. No se puede firmar; escríbenos a info@aroco.co.",
    error: "No se pudo completar. Intenta de nuevo.",
  },
  en: {
    noDisponible: "This link is no longer available. Reload the page.",
    espera: (s: number) => `Wait ${s} seconds to request another code.`,
    muchos: "Too many codes requested. Try again in an hour.",
    noEnviado: "We could not send the code. Write to info@aroco.co.",
    sinCodigo: "Request a code first.",
    vencido: "The code has expired. Request a new one.",
    agotado: "Too many attempts. Request a new code.",
    incorrecto: (n: number) => `Wrong code. ${n} attempts left.`,
    abre: "Open the document before signing.",
    verifica: "Confirm your identity before signing.",
    nombre: "Type your full name.",
    documento: "Type your ID number.",
    consentimiento: "You must accept to sign electronically.",
    firma: "The signature image is not valid. Draw it again.",
    integridad: "The document changed after it was sent. It cannot be signed; write to info@aroco.co.",
    error: "Could not complete. Try again.",
  },
};

async function activo(token: string) {
  const admin = createAdminClient();
  const acceso = await accesoPorToken(admin, token);
  return { admin, acceso };
}

export async function enviarCodigo(token: string): Promise<Resultado> {
  const { admin, acceso } = await activo(token);
  if (acceso.estado !== "activo") return { ok: false, error: MSG.es.noDisponible };
  const { sobre, firmante } = acceso;
  const m = MSG[sobre.idioma === "en" ? "en" : "es"];

  if (firmante.codigo_vence) {
    const enviadoHace = (Date.now() - (new Date(firmante.codigo_vence).getTime() - MINUTOS_CODIGO * 60_000)) / 1000;
    if (enviadoHace < ESPERA_REENVIO_S) return { ok: false, error: m.espera(Math.ceil(ESPERA_REENVIO_S - enviadoHace)) };
  }
  if ((await huboEvento(admin, firmante.id, "codigo_enviado", 60)) >= CODIGOS_POR_HORA) {
    return { ok: false, error: m.muchos };
  }

  const ctx = await contextoPeticion();
  const codigo = generarCodigo();
  const { error } = await admin
    .from("firmas_firmantes")
    .update({
      codigo_hash: hashCodigo(firmante.id, codigo),
      codigo_vence: new Date(Date.now() + MINUTOS_CODIGO * 60_000).toISOString(),
      codigo_intentos: 0,
    })
    .eq("id", firmante.id)
    .eq("estado", "notificado");
  if (error) return { ok: false, error: m.error };

  const r = await correoCodigo(sobre.idioma, firmante.email, codigo);
  await registrarEvento(admin, {
    sobreId: sobre.id,
    firmanteId: firmante.id,
    tipo: r.ok ? "codigo_enviado" : "codigo_no_enviado",
    detalle: { canal: "email", destino: enmascararCorreo(firmante.email), ...(r.ok ? {} : { error: r.error }) },
    ctx,
  });
  return r.ok ? { ok: true } : { ok: false, error: m.noEnviado };
}

export async function verificarCodigo(token: string, codigo: string): Promise<Resultado> {
  const { admin, acceso } = await activo(token);
  if (acceso.estado !== "activo") return { ok: false, error: MSG.es.noDisponible };
  const { sobre, firmante } = acceso;
  const m = MSG[sobre.idioma === "en" ? "en" : "es"];

  if (!firmante.codigo_hash || !firmante.codigo_vence) return { ok: false, error: m.sinCodigo };
  if (new Date(firmante.codigo_vence) < new Date()) return { ok: false, error: m.vencido };
  if (firmante.codigo_intentos >= INTENTOS_CODIGO) return { ok: false, error: m.agotado };

  const ctx = await contextoPeticion();
  const limpio = codigo.replace(/\D/g, "");
  if (limpio.length !== 6 || !codigoCoincide(firmante.codigo_hash, firmante.id, limpio)) {
    const intentos = firmante.codigo_intentos + 1;
    await admin.from("firmas_firmantes").update({ codigo_intentos: intentos }).eq("id", firmante.id);
    await registrarEvento(admin, {
      sobreId: sobre.id,
      firmanteId: firmante.id,
      tipo: "codigo_fallido",
      detalle: { intento: intentos },
      ctx,
    });
    return {
      ok: false,
      error: intentos >= INTENTOS_CODIGO ? m.agotado : m.incorrecto(INTENTOS_CODIGO - intentos),
    };
  }

  const { error } = await admin
    .from("firmas_firmantes")
    .update({
      verificado_en: new Date().toISOString(),
      verificado_canal: "email",
      codigo_hash: null,
      codigo_vence: null,
      codigo_intentos: 0,
    })
    .eq("id", firmante.id)
    .eq("estado", "notificado");
  if (error) return { ok: false, error: m.error };
  await registrarEvento(admin, {
    sobreId: sobre.id,
    firmanteId: firmante.id,
    tipo: "codigo_verificado",
    detalle: { canal: "email", destino: enmascararCorreo(firmante.email) },
    ctx,
  });
  return { ok: true };
}

const PNG_MAGIA = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export async function firmar(
  token: string,
  datos: {
    nombre: string;
    documento: string;
    modo: "dibujada" | "escrita";
    firmaPng: string | null;
    consentimiento: boolean;
  },
): Promise<Resultado> {
  const { admin, acceso } = await activo(token);
  if (acceso.estado !== "activo") return { ok: false, error: MSG.es.noDisponible };
  const { sobre, firmante } = acceso;
  const idioma = sobre.idioma === "en" ? "en" : "es";
  const m = MSG[idioma];

  const nombre = datos.nombre.trim().replace(/\s+/g, " ");
  const documento = datos.documento.trim().replace(/\s+/g, " ");
  if (nombre.length < 3 || nombre.length > 120) return { ok: false, error: m.nombre };
  if (documento.length < 4 || documento.length > 40) return { ok: false, error: m.documento };
  if (datos.consentimiento !== true) return { ok: false, error: m.consentimiento };
  if (!(await huboEvento(admin, firmante.id, "documento_abierto"))) return { ok: false, error: m.abre };
  if (
    !firmante.verificado_en ||
    Date.now() - new Date(firmante.verificado_en).getTime() > MINUTOS_VERIFICACION * 60_000
  ) {
    return { ok: false, error: m.verifica };
  }

  let png: Buffer | null = null;
  if (datos.modo === "dibujada") {
    const b64 = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(datos.firmaPng ?? "")?.[1];
    png = b64 ? Buffer.from(b64, "base64") : null;
    if (!png || png.length < 100 || png.length > 400_000 || PNG_MAGIA.some((b, i) => png![i] !== b)) {
      return { ok: false, error: m.firma };
    }
  }

  // Lo que se firma es lo que se envió: el original se vuelve a medir aquí.
  const original = await descargar(admin, sobre.original_path);
  if (sha256Hex(original) !== sobre.original_sha256) return { ok: false, error: m.integridad };

  const ctx = await contextoPeticion();
  let firmaPath: string | null = null;
  if (png) {
    firmaPath = `sobres/${sobre.id}/firmas/${firmante.id}.png`;
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(firmaPath, png, { contentType: "image/png", upsert: false });
    if (error) return { ok: false, error: m.error };
  }

  const firmadoEn = new Date().toISOString();
  const { data: hecho, error } = await admin
    .from("firmas_firmantes")
    .update({
      estado: "firmado",
      nombre_firmado: nombre,
      documento_firmado: documento,
      firma_modo: datos.modo,
      firma_path: firmaPath,
      firmado_en: firmadoEn,
      firmado_ip: ctx.ip,
      firmado_user_agent: ctx.userAgent,
    })
    .eq("id", firmante.id)
    .eq("estado", "notificado")
    .select("id");
  if (error || !hecho?.length) return { ok: false, error: m.noDisponible };

  await registrarEvento(admin, {
    sobreId: sobre.id,
    firmanteId: firmante.id,
    tipo: "firmado",
    detalle: {
      nombre,
      documento,
      modo: datos.modo,
      sha256_documento: sobre.original_sha256,
      firma_sha256: png ? sha256Hex(png) : null,
      consentimiento: { version: VERSION_CONSENTIMIENTO, idioma, texto: textosFirma(idioma).consentimiento },
    },
    ctx,
  });

  // El siguiente turno y el cierre no pueden tumbar la firma, que ya quedó:
  // si fallan, queda el evento y desde el CRM se reintenta.
  try {
    await avanzarTurno(admin, sobre.id, ctx);
    await cerrarSiCompleto(admin, sobre.id, ctx);
  } catch (e) {
    await registrarEvento(admin, {
      sobreId: sobre.id,
      tipo: "cierre_fallido",
      detalle: { error: e instanceof Error ? e.message : String(e) },
      ctx,
    }).catch(() => {});
  }
  return { ok: true };
}

export async function rechazar(token: string, motivo: string): Promise<Resultado> {
  const { admin, acceso } = await activo(token);
  if (acceso.estado !== "activo") return { ok: false, error: MSG.es.noDisponible };
  const { sobre, firmante } = acceso;
  const m = MSG[sobre.idioma === "en" ? "en" : "es"];
  const ctx = await contextoPeticion();
  const texto = motivo.trim().slice(0, 1000) || null;

  const { data: hecho } = await admin
    .from("firmas_firmantes")
    .update({ estado: "rechazado", rechazado_en: new Date().toISOString(), motivo_rechazo: texto })
    .eq("id", firmante.id)
    .eq("estado", "notificado")
    .select("id");
  if (!hecho?.length) return { ok: false, error: m.noDisponible };
  await registrarEvento(admin, { sobreId: sobre.id, firmanteId: firmante.id, tipo: "rechazado", detalle: { motivo: texto }, ctx });

  // Un rechazo cierra el sobre: nadie más firma un documento que una parte no acepta.
  await admin
    .from("firmas_sobres")
    .update({
      estado: "anulado",
      anulado_en: new Date().toISOString(),
      motivo_anulacion: `Rechazado por ${firmante.nombre}${texto ? `: ${texto}` : ""}`,
    })
    .eq("id", sobre.id)
    .eq("estado", "enviado");
  await registrarEvento(admin, { sobreId: sobre.id, tipo: "anulado", detalle: { por: "rechazo", firmante: firmante.nombre }, ctx });

  const { data: creador } = await admin.from("profiles").select("email, full_name").eq("id", sobre.created_by).single();
  if (creador?.email) {
    const linea = `${firmante.nombre} (${firmante.email}) rechazó «${sobre.titulo}» (${sobre.codigo}).${texto ? ` Motivo: ${texto}` : ""}`;
    await enviarCorreo({
      para: creador.email,
      asunto: `Rechazado: ${sobre.titulo}`,
      html: marcoCorreo({
        seccion: "Firma electrónica",
        cuerpo: `<p style="margin:12px 0 0;font-size:14px;line-height:1.5">${escapar(linea)}</p>`,
        pie: "El sobre quedó anulado. Si hay que corregir algo, crea uno nuevo desde el CRM.",
      }),
      texto: linea,
    });
  }
  return { ok: true };
}
