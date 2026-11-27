import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/types/database";
import type { CatalogoCampo } from "@/lib/finca/captura-equipos";
import { fechaColombia, type Categoria } from "@/lib/finca/captura";
import {
  bajarArchivo,
  contestarBoton,
  enviar,
  escribiendo,
  quitarBotones,
  type TgCallback,
  type TgMessage,
  type TgUpdate,
} from "@/lib/telegram/api";
import { extraer } from "./extraer";
import { transcribir } from "./transcribir";
import {
  escapar,
  fechaLarga,
  filasDe,
  normalizarTelefono,
  proponer,
  resumen,
  vocabulario,
  type Extraccion,
  type Propuesta,
} from "./reporte";

type Db = ReturnType<typeof createAdminClient>;

export interface UsuarioBot {
  id: string;
  nombre: string;
  empleado_id: string | null;
  rol: string;
  chat_id: number | null;
}

/** Un reporte sin confirmar se puede seguir completando durante este tiempo. */
const PENDIENTE_HORAS = 18;
/** Audios de más de esto se rechazan: nadie cuenta el día en 5 minutos. */
const AUDIO_MAX_S = 300;

export const AYUDA = [
  "<b>Cómo mandar el reporte</b>",
  "",
  "Mantenga oprimido el 🎤 y cuénteme, como si le hablara a Angela:",
  "1️⃣ <b>Qué hizo</b> (cosecha, poda, riego, desgrane…)",
  "2️⃣ <b>En qué válvula</b>",
  "3️⃣ <b>A qué hora empezó y terminó</b>",
  "4️⃣ <b>Cuánto sacó</b>: mazorcas sanas, con monilia y negras, o kilos de baba",
  "",
  "<i>Ejemplo: «Hoy coseché en la válvula 8 de 7 de la mañana a 3 de la tarde, 800 mazorcas sanas, 30 con monilia y 15 negras.»</i>",
  "",
  "Si hizo varias cosas, cuéntelas todas en el mismo audio. Yo le leo lo que entendí y usted toca <b>✅ Está bien</b>.",
  "Si no tiene señal, grabe igual: el audio sale solo cuando llegue a la oficina.",
].join("\n");

// ── Catálogo ────────────────────────────────────────────────────────────────

export async function catalogo(db: Db): Promise<CatalogoCampo> {
  const [emp, lab, val, eq] = await Promise.all([
    db.from("finca_empleados").select("id, nombre").eq("activo", true).order("nombre"),
    db.from("finca_labores").select("id, nombre, categoria, unidad").eq("activo", true).order("nombre"),
    db.from("finca_valvulas").select("codigo").eq("activo", true).order("orden"),
    db.from("finca_equipos").select("id, codigo, nombre, combustible").eq("activo", true),
  ]);
  for (const r of [emp, lab, val, eq]) if (r.error) throw new Error(r.error.message);
  return {
    yo: null,
    porOtros: false,
    empleados: emp.data ?? [],
    labores: (lab.data ?? []).map((l) => ({ ...l, categoria: l.categoria as Categoria })),
    valvulas: (val.data ?? []).map((v) => v.codigo),
    hoy: fechaColombia(new Date()),
    equipos: (eq.data ?? []).map((q) => ({
      ...q,
      combustible: q.combustible as "acpm" | "gasolina",
    })),
  };
}

async function usuarioDe(db: Db, chatId: number): Promise<UsuarioBot | null> {
  const { data } = await db
    .from("finca_telegram_usuarios")
    .select("id, nombre, empleado_id, rol, chat_id")
    .eq("chat_id", chatId)
    .eq("activo", true)
    .maybeSingle();
  return data;
}

const primerNombre = (n: string) => n.split(" ")[0];

// ── Entrada ─────────────────────────────────────────────────────────────────

export async function manejarUpdate(u: TgUpdate): Promise<void> {
  const db = createAdminClient();
  if (u.callback_query) return manejarBoton(db, u.callback_query);
  const m = u.message;
  if (!m || m.chat.type !== "private") return;

  if (m.contact) return vincular(db, m);

  const usuario = await usuarioDe(db, m.chat.id);
  if (!usuario) {
    await enviar(
      m.chat.id,
      "Hola 👋 Soy el asistente de labores de la finca de AROCO.\n\nPara saber quién es usted, toque el botón <b>📱 Compartir mi número</b> aquí abajo.",
      {
        keyboard: [[{ text: "📱 Compartir mi número", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    );
    return;
  }

  const t = m.text?.trim() ?? "";
  if (/^\/(start|ayuda|help)\b/i.test(t)) {
    await enviar(m.chat.id, `Hola, ${escapar(primerNombre(usuario.nombre))}.\n\n${AYUDA}`);
    return;
  }
  if (/^\/hoy\b/i.test(t)) return mostrarHoy(db, m.chat.id, usuario);
  if (t.startsWith("/")) {
    await enviar(m.chat.id, AYUDA);
    return;
  }

  if (m.voice || m.audio || t) return procesar(db, u.update_id, m, usuario);
}

// ── Vincular el número ──────────────────────────────────────────────────────

async function vincular(db: Db, m: TgMessage) {
  const c = m.contact!;
  // Solo su propio número: un contacto reenviado no sirve para hacerse pasar
  // por otro.
  if (!m.from || c.user_id !== m.from.id) {
    await enviar(m.chat.id, "Ese no es su número. Toque el botón <b>📱 Compartir mi número</b>.");
    return;
  }
  const tel = normalizarTelefono(c.phone_number);
  const { data: u } = await db
    .from("finca_telegram_usuarios")
    .select("id, nombre, rol")
    .eq("telefono", tel)
    .eq("activo", true)
    .maybeSingle();
  if (!u) {
    await enviar(
      m.chat.id,
      `No encuentro el número ${escapar(tel)} en la lista de la finca. Pídale a Angela que lo agregue en el CRM y vuelva a tocar el botón.`,
      { remove_keyboard: true },
    );
    return;
  }
  // Un chat = una persona: si este Telegram estaba con otro número, se suelta.
  await db.from("finca_telegram_usuarios").update({ chat_id: null }).eq("chat_id", m.chat.id).neq("id", u.id);
  const { error } = await db
    .from("finca_telegram_usuarios")
    .update({ chat_id: m.chat.id, telegram_user_id: m.from.id, vinculado_en: new Date().toISOString() })
    .eq("id", u.id);
  if (error) throw new Error(error.message);

  const extra =
    u.rol === "supervisor"
      ? "\n\nComo supervisora, puede mandar audios por cualquier trabajador (diga el nombre de cada uno). A las 5 p. m. le aviso quién no ha enviado sus labores."
      : "\n\nCada mañana le recuerdo. Al terminar la jornada, mándeme un audio.";
  await enviar(m.chat.id, `✅ Listo, ${escapar(primerNombre(u.nombre))}. Ya lo tengo registrado.${extra}`, {
    remove_keyboard: true,
  });
  await enviar(m.chat.id, AYUDA);
}

// ── Un reporte (audio o texto) ──────────────────────────────────────────────

async function procesar(db: Db, updateId: number, m: TgMessage, usuario: UsuarioBot) {
  const voz = m.voice ?? m.audio;
  const { data: fila, error } = await db
    .from("finca_telegram_mensajes")
    .insert({
      update_id: updateId,
      chat_id: m.chat.id,
      usuario_id: usuario.id,
      tipo: voz ? "voz" : "texto",
      file_id: voz?.file_id ?? null,
      duracion_s: voz?.duration ?? null,
      texto: voz ? null : (m.text ?? null),
    })
    .select("id, created_at")
    .single();
  // Telegram reintentó un update que ya teníamos.
  if (error?.code === "23505") return;
  if (error || !fila) throw new Error(error?.message ?? "No se pudo guardar el mensaje");

  const falla = async (msg: string, detalle: string) => {
    await db.from("finca_telegram_mensajes").update({ estado: "error", error: detalle.slice(0, 1000) }).eq("id", fila.id);
    await enviar(m.chat.id, msg);
  };

  if (voz && voz.duration > AUDIO_MAX_S) {
    return falla("Ese audio es muy largo. Mándeme uno más corto (menos de 5 minutos), por favor.", "audio largo");
  }

  await escribiendo(m.chat.id);
  try {
    const cat = await catalogo(db);
    const hoy = cat.hoy;
    let texto = m.text ?? "";

    if (voz) {
      const a = await bajarArchivo(voz.file_id);
      const ruta = `${hoy.slice(0, 7)}/${fila.id}.ogg`;
      const up = await db.storage
        .from("finca-audios")
        .upload(ruta, a.bytes, { contentType: "audio/ogg", upsert: true });
      texto = await transcribir(a.bytes, a.ruta, vocabulario(cat));
      await db
        .from("finca_telegram_mensajes")
        .update({ texto, audio_path: up.error ? null : ruta })
        .eq("id", fila.id);
      if (!texto) {
        return falla("No le escuché nada en el audio 🙉 ¿Me lo manda otra vez, un poco más cerca del teléfono?", "transcripción vacía");
      }
    }

    // ¿Hay un reporte esperando que lo complete o corrija?
    const desde = new Date(Date.now() - PENDIENTE_HORAS * 3600_000).toISOString();
    const { data: pendiente } = await db
      .from("finca_telegram_mensajes")
      .select("id, extraccion, propuesta, bot_message_id")
      .eq("chat_id", m.chat.id)
      .eq("estado", "por_confirmar")
      .gte("created_at", desde)
      .neq("id", fila.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const porOtros = usuario.rol === "supervisor";
    const anterior = pendiente?.extraccion
      ? {
          extraccion: pendiente.extraccion as unknown as Extraccion,
          preguntas: ((pendiente.propuesta as unknown as Propuesta | null)?.preguntas ?? []),
        }
      : null;

    const ext = await extraer({ texto, cat, quien: usuario.nombre, porOtros, hoy, anterior });

    if (!ext.es_reporte && !anterior) {
      await db.from("finca_telegram_mensajes").update({ estado: "ignorado", extraccion: ext as unknown as Json }).eq("id", fila.id);
      await enviar(m.chat.id, escapar(ext.respuesta ?? "Mándeme un audio contando qué hizo hoy.") + "\n\nEscriba /ayuda para ver cómo.");
      return;
    }

    const prop = proponer(ext, cat, { yo: usuario.empleado_id, porOtros }, hoy, () => crypto.randomUUID());

    if (pendiente) {
      await db
        .from("finca_telegram_mensajes")
        .update({ estado: "reemplazado" })
        .eq("id", pendiente.id)
        .eq("estado", "por_confirmar");
      if (pendiente.bot_message_id) await quitarBotones(m.chat.id, pendiente.bot_message_id);
    }

    const oido = voz ? `🎙 <i>«${escapar(texto.length > 400 ? `${texto.slice(0, 400)}…` : texto)}»</i>\n\n` : "";
    const botones = prop.preguntas.length
      ? [[{ text: "🗑 Borrar este reporte", callback_data: `no:${fila.id}` }]]
      : [
          [
            { text: "✅ Está bien", callback_data: `ok:${fila.id}` },
            { text: "🗑 Borrar", callback_data: `no:${fila.id}` },
          ],
        ];
    const enviado = await enviar(m.chat.id, oido + resumen(prop, hoy, porOtros), { inline_keyboard: botones });

    await db
      .from("finca_telegram_mensajes")
      .update({
        estado: "por_confirmar",
        extraccion: ext as unknown as Json,
        propuesta: prop as unknown as Json,
        fecha_labor: prop.fecha,
        anterior_id: pendiente?.id ?? null,
        bot_message_id: enviado.message_id,
      })
      .eq("id", fila.id);
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("[finca-telegram]", detalle);
    await falla("Uy, no pude procesar ese mensaje 😕 ¿Me lo manda otra vez en un momento?", detalle);
  }
}

// ── Botones ─────────────────────────────────────────────────────────────────

async function manejarBoton(db: Db, q: TgCallback) {
  const chatId = q.message?.chat.id;
  const [accion, id] = (q.data ?? "").split(":");
  if (!chatId || !id) return void (await contestarBoton(q.id));
  const usuario = await usuarioDe(db, chatId);
  if (!usuario) return void (await contestarBoton(q.id, "No lo tengo registrado"));

  if (accion === "no") {
    const { data } = await db
      .from("finca_telegram_mensajes")
      .update({ estado: "descartado" })
      .eq("id", id)
      .eq("chat_id", chatId)
      .eq("estado", "por_confirmar")
      .select("id");
    await contestarBoton(q.id, data?.length ? "Borrado" : "Ya no se puede borrar");
    if (q.message) await quitarBotones(chatId, q.message.message_id);
    if (data?.length) await enviar(chatId, "🗑 Listo, lo borré. Cuando quiera, mándeme el audio otra vez.");
    return;
  }
  if (accion !== "ok") return void (await contestarBoton(q.id));

  // Reclamar el reporte: si tocan dos veces, la segunda no encuentra nada.
  const { data: tomado } = await db
    .from("finca_telegram_mensajes")
    .update({ estado: "confirmado", confirmado_en: new Date().toISOString() })
    .eq("id", id)
    .eq("chat_id", chatId)
    .eq("estado", "por_confirmar")
    .select("id, propuesta, created_at")
    .maybeSingle();
  if (!tomado?.propuesta) {
    await contestarBoton(q.id, "Este reporte ya estaba guardado o se reemplazó");
    if (q.message) await quitarBotones(chatId, q.message.message_id);
    return;
  }
  await contestarBoton(q.id, "Guardando…");

  try {
    const prop = tomado.propuesta as unknown as Propuesta;
    const cat = await catalogo(db);
    const { registros, usos } = filasDe(prop, cat, new Date(tomado.created_at));
    if (registros.length) {
      const { error } = await db.from("finca_registros").upsert(
        registros.map((r) => ({ ...r, origen: "telegram", telegram_mensaje_id: id, registrado_por: null })),
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw new Error(`registros: ${error.message}`);
    }
    if (usos.length) {
      const { error } = await db.from("finca_equipo_usos").upsert(
        usos.map((u) => ({ ...u, origen: "telegram", telegram_mensaje_id: id, registrado_por: null })),
        { onConflict: "id", ignoreDuplicates: true },
      );
      if (error) throw new Error(`usos: ${error.message}`);
    }
    await db
      .from("finca_telegram_mensajes")
      .update({ registros: registros.map((r) => r.id), usos: usos.map((u) => u.id) })
      .eq("id", id);
    if (q.message) await quitarBotones(chatId, q.message.message_id);
    await enviar(
      chatId,
      `✅ Guardado. Gracias, ${escapar(primerNombre(usuario.nombre))}.\n\n¿Hizo algo más? Mándeme otro audio. Escriba /hoy para ver todo lo de hoy.`,
    );
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    console.error("[finca-telegram] confirmar", detalle);
    await db
      .from("finca_telegram_mensajes")
      .update({ estado: "por_confirmar", confirmado_en: null, error: detalle.slice(0, 1000) })
      .eq("id", id);
    await enviar(chatId, "No pude guardar 😕 Toque <b>✅ Está bien</b> otra vez en un momento.");
  }
}

// ── /hoy ────────────────────────────────────────────────────────────────────

async function mostrarHoy(db: Db, chatId: number, usuario: UsuarioBot) {
  const hoy = fechaColombia(new Date());
  let q = db
    .from("finca_registros")
    .select("empleado_id, horas, hora_inicio, hora_fin, valvulas, finca_labores(nombre), finca_empleados(nombre)")
    .eq("fecha", hoy)
    .is("anulado_en", null);
  if (usuario.rol !== "supervisor") {
    if (!usuario.empleado_id) return void (await enviar(chatId, "No tengo su ficha de trabajador."));
    q = q.eq("empleado_id", usuario.empleado_id);
  }
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  if (!data?.length) {
    await enviar(chatId, `Hoy (${fechaLarga(hoy, hoy)}) no hay nada registrado todavía.`);
    return;
  }
  const l = data.map((r) => {
    const labor = (r.finca_labores as { nombre: string } | null)?.nombre ?? "—";
    const quien = usuario.rol === "supervisor" ? `${(r.finca_empleados as { nombre: string } | null)?.nombre ?? "—"}: ` : "";
    const t = r.hora_inicio && r.hora_fin ? `${r.hora_inicio.slice(0, 5)}–${r.hora_fin.slice(0, 5)}` : `${r.horas ?? "?"} h`;
    const v = r.valvulas.length ? ` · válv. ${r.valvulas.join(", ")}` : "";
    return `• ${escapar(quien)}<b>${escapar(labor)}</b> · ${t}${escapar(v)}`;
  });
  await enviar(chatId, `<b>Registrado hoy:</b>\n${l.join("\n")}`);
}
