import "server-only";
import { serverEnv } from "@/lib/env";

/**
 * Voz a texto con OpenAI. El `prompt` lleva los nombres de los trabajadores,
 * las labores y las válvulas: sin eso «Heriberto» sale «Eriberto» y «desgrane»
 * sale «desgrané». Telegram manda los audios en OGG/Opus, que OpenAI acepta.
 */
export async function transcribir(
  audio: ArrayBuffer,
  nombreArchivo: string,
  vocabulario: string,
): Promise<string> {
  if (!serverEnv.OPENAI_API_KEY) throw new Error("Falta OPENAI_API_KEY");
  const form = new FormData();
  const ext = nombreArchivo.split(".").pop()?.toLowerCase() || "ogg";
  // OpenAI decide el formato por la extensión; «oga» (Telegram) es ogg.
  const nombre = `audio.${ext === "oga" ? "ogg" : ext}`;
  form.append("file", new Blob([audio], { type: "audio/ogg" }), nombre);
  form.append("model", serverEnv.OPENAI_TRANSCRIBE_MODEL);
  form.append("language", "es");
  form.append("response_format", "json");
  form.append("prompt", vocabulario.slice(0, 2000));

  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${serverEnv.OPENAI_API_KEY}` },
    body: form,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(`OpenAI ${r.status}: ${t.slice(0, 300)}`);
  }
  const j = (await r.json()) as { text?: string };
  return (j.text ?? "").trim();
}
