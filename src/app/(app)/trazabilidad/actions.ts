"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";

export type TrazaResult = { ok: boolean; error?: string };

async function requireSession() {
  const session = await getSessionContext();
  if (!session) throw new Error("Sesión expirada.");
  return session;
}

function legible(mensaje: string): string {
  if (/row-level|policy|permission|42501/i.test(mensaje)) {
    return "No tienes permiso: enlazar acopios es de Bodega Central o Administrativo.";
  }
  return mensaje;
}

/**
 * Engancha un acopio de la hoja de ruta a un lote de la bodega.
 *
 * Es la decisión que sostiene toda la trazabilidad: a partir de aquí, ese lote
 * afirma venir de estas veredas y de estas manos. Por eso la hace una persona
 * y queda con nombre y fecha —lo pone el trigger de la migración 0082— en vez
 * de deducirse de una coincidencia de fechas que hoy ni siquiera existe.
 *
 * `lote_id` null desenlaza, y el mismo trigger borra el rastro: un enlace
 * deshecho no puede seguir diciendo quién lo hizo.
 */
export async function enlazarAcopio(
  acopioId: string,
  loteId: string | null,
): Promise<TrazaResult> {
  await requireSession();
  const supabase = await createClient();

  const { error } = await supabase
    .from("trazabilidad_acopios")
    .update({ lote_id: loteId })
    .eq("id", acopioId);
  if (error) return { ok: false, error: legible(error.message) };

  revalidatePath("/trazabilidad");
  return { ok: true };
}

/**
 * Pone la coordenada de una vereda.
 *
 * Se acepta como texto porque así es como llega: la gente copia «3.2367,
 * -76.4128» de Google Maps y lo pega. Pedirle dos campos numéricos separados
 * garantizaría que alguien pegue el par entero en el primero.
 *
 * `fuente` no es opcional por capricho: una coordenada sin procedencia, en un
 * sistema que puede terminar respaldando una declaración de origen, no vale
 * nada. Si nadie la escribe, queda dicho quién la puso y cuándo.
 */
export async function ubicarVereda(
  lugarId: string,
  texto: string,
  fuente: string,
): Promise<TrazaResult> {
  const session = await requireSession();
  const supabase = await createClient();

  const limpio = texto.trim();
  if (!limpio) {
    const { error } = await supabase
      .from("trazabilidad_lugares")
      .update({ lat: null, lng: null, fuente: null })
      .eq("id", lugarId);
    if (error) return { ok: false, error: legible(error.message) };
    revalidatePath("/trazabilidad");
    return { ok: true };
  }

  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*[,;\s]\s*(-?\d+(?:[.,]\d+)?)\s*$/.exec(limpio);
  if (!m) {
    return {
      ok: false,
      error: "Escribe la coordenada como «3.2367, -76.4128».",
    };
  }
  const lat = Number(m[1].replace(",", "."));
  const lng = Number(m[2].replace(",", "."));

  // Colombia entera cabe holgadamente aquí. Un signo al revés —el error más
  // común al copiar de un mapa— manda el punto al otro lado del mundo, y en un
  // mapa de veredas del Cauca eso no se nota mirando.
  if (!(lat >= -5 && lat <= 14)) {
    return { ok: false, error: `Latitud fuera de Colombia: ${lat}.` };
  }
  if (!(lng >= -82 && lng <= -66)) {
    return {
      ok: false,
      error: `Longitud fuera de Colombia: ${lng}. En Colombia es negativa.`,
    };
  }

  const { error } = await supabase
    .from("trazabilidad_lugares")
    .update({
      lat,
      lng,
      fuente:
        fuente.trim() ||
        `Puesta a mano por ${session.profile?.full_name ?? session.email}`,
    })
    .eq("id", lugarId);
  if (error) return { ok: false, error: legible(error.message) };

  revalidatePath("/trazabilidad");
  return { ok: true };
}
