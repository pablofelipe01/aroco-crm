"use server";

/**
 * Correcciones de Labores Finca (0119). Todo pasa por las funciones de la
 * base, que validan, dejan historial y marcan la fila para que la recarga de
 * la hoja no la pise. Aquí solo se llama y se refresca la página.
 *
 * OJO: un archivo "use server" solo puede exportar funciones async (los tipos
 * sí, se borran al compilar). Ver la memoria del proyecto.
 */

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { DatosRegistro } from "@/lib/finca/captura";
import type { Json } from "@/lib/types/database";
import { normalizarTelefono } from "@/lib/finca/telegram/reporte";

export type Resultado = { ok: true } | { ok: false; error: string };

export type Cambio = {
  id: number;
  accion: "corregir" | "anular" | "restaurar" | "revisar";
  antes: Record<string, unknown> | null;
  despues: Record<string, unknown> | null;
  motivo: string | null;
  por: string | null;
  en: string;
};

function listo(error: { message: string } | null): Resultado {
  if (error) return { ok: false, error: error.message };
  revalidatePath("/labores-finca");
  return { ok: true };
}

export async function corregirRegistro(
  id: string,
  datos: DatosRegistro & { empleado_id: string | null; seguir_dudoso: boolean },
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("finca_corregir_registro", {
    p_id: id,
    p: datos as unknown as Json,
  });
  return listo(error);
}

export async function anularRegistro(
  id: string,
  anular: boolean,
  motivo: string,
): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("finca_anular_registro", {
    p_id: id,
    p_anular: anular,
    p_motivo: motivo,
  });
  return listo(error);
}

export async function marcarRevisado(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("finca_marcar_revisado", { p_id: id });
  return listo(error);
}

/** Historial de una fila, con el nombre de quien hizo cada cambio. */
export async function historialRegistro(
  id: string,
): Promise<{ ok: true; cambios: Cambio[] } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("finca_registros_cambios")
    .select("id, accion, antes, despues, motivo, por, en")
    .eq("registro_id", id)
    .order("en", { ascending: false });
  if (error) return { ok: false, error: error.message };
  const ids = [...new Set((data ?? []).map((c) => c.por).filter((x): x is string => !!x))];
  const nombres = new Map<string, string>();
  if (ids.length) {
    const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", ids);
    for (const p of ps ?? []) nombres.set(p.id, p.full_name);
  }
  return {
    ok: true,
    cambios: (data ?? []).map((c) => ({
      id: c.id,
      accion: c.accion,
      antes: c.antes as Record<string, unknown> | null,
      despues: c.despues as Record<string, unknown> | null,
      motivo: c.motivo,
      por: c.por ? (nombres.get(c.por) ?? "—") : null,
      en: c.en,
    })),
  };
}

// ── Bot de Telegram (0122) ──────────────────────────────────────────────────
//
// Quién puede hablarle al bot. La RLS (is_direccion) es el candado; el bot
// reconoce a la persona cuando comparte este mismo número.

export type UsuarioTelegramForm = {
  id: string | null;
  nombre: string;
  telefono: string;
  empleadoId: string | null;
  rol: "trabajador" | "supervisor";
  recibeAvisos: boolean;
};

export async function guardarUsuarioTelegram(u: UsuarioTelegramForm): Promise<Resultado> {
  const telefono = normalizarTelefono(u.telefono);
  if (!/^\d{10,15}$/.test(telefono)) {
    return { ok: false, error: "Número inválido. Ej.: 317 430 4429" };
  }
  if (u.rol === "trabajador" && !u.empleadoId) {
    return { ok: false, error: "Falta el trabajador" };
  }
  const supabase = await createClient();
  const fila = {
    nombre: u.nombre.trim(),
    telefono,
    empleado_id: u.empleadoId,
    rol: u.rol,
    recibe_avisos: u.recibeAvisos,
  };
  if (u.id) {
    const { data: antes } = await supabase
      .from("finca_telegram_usuarios")
      .select("telefono")
      .eq("id", u.id)
      .maybeSingle();
    // Otro número = otra persona: el vínculo con el Telegram viejo se suelta.
    const suelta = antes && antes.telefono !== telefono
      ? { chat_id: null, telegram_user_id: null, vinculado_en: null }
      : {};
    const { error } = await supabase
      .from("finca_telegram_usuarios")
      .update({ ...fila, ...suelta })
      .eq("id", u.id);
    if (error?.code === "23505") return { ok: false, error: "Ese número ya lo tiene otra persona" };
    return listo(error);
  }
  const { error } = await supabase.from("finca_telegram_usuarios").insert(fila);
  if (error?.code === "23505") return { ok: false, error: "Ese número o ese trabajador ya está en la lista" };
  return listo(error);
}

export async function quitarUsuarioTelegram(id: string): Promise<Resultado> {
  const supabase = await createClient();
  const { error } = await supabase.from("finca_telegram_usuarios").delete().eq("id", id);
  return listo(error);
}
