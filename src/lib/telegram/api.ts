import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Lo poco de la Bot API de Telegram que usa el bot de la finca. A mano y sin
 * librería: son cinco llamadas HTTP.
 */

export interface TgUser {
  id: number;
  first_name?: string;
}
export interface TgMessage {
  message_id: number;
  date: number;
  chat: { id: number; type: string };
  from?: TgUser;
  text?: string;
  voice?: { file_id: string; duration: number; mime_type?: string; file_size?: number };
  audio?: { file_id: string; duration: number; mime_type?: string; file_size?: number };
  contact?: { phone_number: string; user_id?: number; first_name?: string };
}
export interface TgCallback {
  id: string;
  from: TgUser;
  data?: string;
  message?: TgMessage;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  callback_query?: TgCallback;
}

export type Teclado =
  | { inline_keyboard: { text: string; callback_data: string }[][] }
  | {
      keyboard: { text: string; request_contact?: boolean }[][];
      resize_keyboard?: boolean;
      one_time_keyboard?: boolean;
    }
  | { remove_keyboard: true };

export function botActivo(): boolean {
  return Boolean(serverEnv.TELEGRAM_BOT_TOKEN);
}

async function llamar<T>(metodo: string, cuerpo: Record<string, unknown>): Promise<T> {
  const r = await fetch(
    `https://api.telegram.org/bot${serverEnv.TELEGRAM_BOT_TOKEN}/${metodo}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
    },
  );
  const j = (await r.json().catch(() => null)) as { ok: boolean; result: T; description?: string } | null;
  if (!j?.ok) throw new Error(`Telegram ${metodo}: ${j?.description ?? r.status}`);
  return j.result;
}

export function enviar(chatId: number, texto: string, teclado?: Teclado) {
  return llamar<TgMessage>("sendMessage", {
    chat_id: chatId,
    text: texto,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(teclado ? { reply_markup: teclado } : {}),
  });
}

export function quitarBotones(chatId: number, messageId: number) {
  return llamar("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  }).catch(() => undefined);
}

export function contestarBoton(callbackId: string, texto?: string) {
  return llamar("answerCallbackQuery", { callback_query_id: callbackId, text: texto }).catch(
    () => undefined,
  );
}

export function escribiendo(chatId: number) {
  return llamar("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
}

/** Baja un archivo (el audio) por su file_id. */
export async function bajarArchivo(fileId: string): Promise<{ bytes: ArrayBuffer; ruta: string }> {
  const f = await llamar<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!f.file_path) throw new Error("Telegram no devolvió la ruta del archivo");
  const r = await fetch(
    `https://api.telegram.org/file/bot${serverEnv.TELEGRAM_BOT_TOKEN}/${f.file_path}`,
  );
  if (!r.ok) throw new Error(`No se pudo bajar el audio (${r.status})`);
  return { bytes: await r.arrayBuffer(), ruta: f.file_path };
}

export function configurarWebhook(url: string, secreto: string) {
  return llamar("setWebhook", {
    url,
    secret_token: secreto,
    allowed_updates: ["message", "callback_query"],
    drop_pending_updates: false,
  });
}

export function configurarComandos() {
  return llamar("setMyCommands", {
    commands: [
      { command: "start", description: "Empezar / vincular mi número" },
      { command: "ayuda", description: "Cómo mandar el reporte" },
      { command: "hoy", description: "Lo que ya tengo registrado hoy" },
    ],
  });
}

export function infoWebhook() {
  return llamar<Record<string, unknown>>("getWebhookInfo", {});
}
