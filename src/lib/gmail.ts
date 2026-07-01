import "server-only";
import { serverEnv } from "@/lib/env";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

/** ¿Están las credenciales OAuth de Gmail configuradas? */
export function hasGmailEnv(): boolean {
  return Boolean(
    serverEnv.GMAIL_CLIENT_ID &&
      serverEnv.GMAIL_CLIENT_SECRET &&
      serverEnv.GMAIL_REFRESH_TOKEN,
  );
}

/** Intercambia el refresh token por un access token de corta duración. */
async function accessToken(): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: serverEnv.GMAIL_CLIENT_ID,
      client_secret: serverEnv.GMAIL_CLIENT_SECRET,
      refresh_token: serverEnv.GMAIL_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gmail OAuth falló (${res.status}). ${t.slice(0, 180)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("Gmail OAuth no devolvió access_token.");
  return json.access_token;
}

type Header = { name: string; value: string };
type Part = {
  mimeType?: string;
  filename?: string;
  headers?: Header[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
};
type GmailMessage = { id: string; payload?: Part };

export interface FetchedEmail {
  id: string;
  subject: string;
  from: string;
  date: string | null; // YYYY-MM-DD
  bodyText: string;
  pdf: { base64: string; filename: string } | null;
}

function headerVal(headers: Header[] | undefined, name: string): string {
  return (
    headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

function decode(data?: string): string {
  return data ? Buffer.from(data, "base64url").toString("utf-8") : "";
}

function* walk(part?: Part): Generator<Part> {
  if (!part) return;
  yield part;
  for (const p of part.parts ?? []) yield* walk(p);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** IDs de mensajes que coinciden con la búsqueda (Gmail devuelve los más nuevos primero). */
export async function listActaMessageIds(query: string): Promise<string[]> {
  const token = await accessToken();
  const url = `${GMAIL}/messages?q=${encodeURIComponent(query)}&maxResults=10`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gmail list falló (${res.status}).`);
  const json = (await res.json()) as { messages?: { id: string }[] };
  return (json.messages ?? []).map((m) => m.id);
}

/** Descarga un correo: asunto, remitente, fecha, cuerpo (texto) y PDF adjunto si hay. */
export async function fetchEmail(id: string): Promise<FetchedEmail> {
  const token = await accessToken();
  const res = await fetch(`${GMAIL}/messages/${id}?format=full`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Gmail get falló (${res.status}).`);
  const msg = (await res.json()) as GmailMessage;
  const headers = msg.payload?.headers;

  let plain = "";
  let html = "";
  let pdf: FetchedEmail["pdf"] = null;

  for (const part of walk(msg.payload)) {
    const mt = part.mimeType ?? "";
    const fname = part.filename ?? "";
    const isPdf = mt === "application/pdf" || fname.toLowerCase().endsWith(".pdf");
    if (!pdf && isPdf && part.body?.attachmentId) {
      const aRes = await fetch(
        `${GMAIL}/messages/${id}/attachments/${part.body.attachmentId}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      );
      if (aRes.ok) {
        const a = (await aRes.json()) as { data?: string };
        if (a.data) {
          pdf = {
            base64: Buffer.from(a.data, "base64url").toString("base64"),
            filename: fname || "acta.pdf",
          };
        }
      }
    } else if (mt === "text/plain" && part.body?.data && !plain) {
      plain = decode(part.body.data);
    } else if (mt === "text/html" && part.body?.data && !html) {
      html = decode(part.body.data);
    }
  }

  // Algunos correos ponen el cuerpo directamente en payload.body.
  if (!plain && !html && msg.payload?.body?.data) {
    if ((msg.payload.mimeType ?? "").includes("html")) html = decode(msg.payload.body.data);
    else plain = decode(msg.payload.body.data);
  }

  // Muchos notetakers envían un text/plain trivial ("requiere cliente HTML") y
  // el contenido real va en el HTML — elegimos el cuerpo con más contenido.
  const htmlText = html ? stripHtml(html) : "";
  const bodyText = htmlText.length > plain.trim().length ? htmlText : plain.trim();

  const dateHeader = headerVal(headers, "Date");
  return {
    id,
    subject: headerVal(headers, "Subject"),
    from: headerVal(headers, "From"),
    date: dateHeader ? new Date(dateHeader).toISOString().slice(0, 10) : null,
    bodyText,
    pdf,
  };
}
