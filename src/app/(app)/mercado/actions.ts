"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/lib/auth";
import { sincronizarMercado } from "@/lib/mercado/sync";
import { leerTableroDeImagen, TableroIlegible } from "@/lib/mercado/tablero-imagen";
import { guardarTableroImagen } from "@/lib/mercado/guardar";

export type ResultadoSync = { ok: boolean; mensaje: string; detalle?: string };

/**
 * Sincroniza a mano desde la pantalla.
 *
 * Corre con service_role porque las tablas de Mercado no tienen políticas de
 * escritura —solo los syncs escriben—, así que el permiso se comprueba aquí
 * arriba, contra la sesión real, antes de tocar nada.
 *
 * Pide menos vencimientos que el cron: cada uno es una navegación con
 * Playwright del lado del MCP y son el tramo más lento. Con tres días y un
 * vencimiento tarda ~150 s de los 300 disponibles; el cron, que no espera a
 * nadie, barre cinco días y tres vencimientos.
 *
 * Tres días y no uno porque el estado de cuenta se publica con retraso: un
 * martes, el último disponible es el del viernes.
 */
export async function sincronizarAhora(): Promise<ResultadoSync> {
  const session = await getSessionContext();
  if (!session?.profile?.ve_mercado) {
    return { ok: false, mensaje: "No tienes permiso para sincronizar Mercado." };
  }

  try {
    const r = await sincronizarMercado(createAdminClient(), { dias: 3, vencimientos: 1 });
    revalidatePath("/mercado");

    const partes: string[] = [];
    if (r.estados.length) partes.push(`${r.estados.length} estados de cuenta`);
    if (r.tableros.length) {
      partes.push(`${r.tableros.reduce((a, t) => a + t.strikes, 0)} strikes`);
    }
    if (r.trm) partes.push(`TRM de ${r.trm} días`);

    if (partes.length === 0) {
      return {
        ok: false,
        mensaje: "No entró ningún dato.",
        detalle: r.fallos.map((f) => `${f.fuente}: ${f.error}`).join(" · "),
      };
    }
    return {
      ok: true,
      mensaje: `Actualizado: ${partes.join(", ")}.`,
      // Los fallos parciales se dicen: si Barchart no respondió, el tablero que
      // se está viendo es el de ayer y hay que saberlo.
      detalle: r.fallos.length
        ? `No entró: ${r.fallos.map((f) => f.fuente).join(", ")}.`
        : undefined,
    };
  } catch (e) {
    return {
      ok: false,
      mensaje: "Falló la sincronización.",
      detalle: e instanceof Error ? e.message.slice(0, 300) : undefined,
    };
  }
}


/**
 * Lee un tablero de opciones desde una captura y guarda sus griegas.
 *
 * Es la única fuente de delta y volatilidad: Barchart da strikes y primas pero
 * no las griegas, y el tablero del bróker no tiene API — es una pantalla.
 *
 * La imagen no se almacena. Lo que importa es el tablero extraído, y guardar
 * capturas de la cuenta del bróker sería conservar información sensible sin
 * ninguna necesidad.
 */
export async function subirTablero(formData: FormData): Promise<ResultadoSync> {
  const session = await getSessionContext();
  if (!session?.profile?.ve_mercado) {
    return { ok: false, mensaje: "No tienes permiso para cargar tableros." };
  }

  const archivo = formData.get("imagen");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return { ok: false, mensaje: "Elige una captura del tablero." };
  }
  // 10 MB: una captura de pantalla nunca pesa tanto, y más allá de eso la
  // petición se cae sola en vez de dar un error entendible.
  if (archivo.size > 10 * 1024 * 1024) {
    return { ok: false, mensaje: "La imagen pesa más de 10 MB." };
  }

  try {
    const tablero = await leerTableroDeImagen(
      Buffer.from(await archivo.arrayBuffer()),
      archivo.type,
    );
    const fecha =
      String(formData.get("fecha") ?? "").trim() || new Date().toISOString().slice(0, 10);

    const r = await guardarTableroImagen(createAdminClient(), tablero, fecha);
    revalidatePath("/mercado");

    const sinDelta = r.strikes - r.conDelta;
    return {
      ok: true,
      mensaje: `Tablero ${r.contract_month}: ${r.strikes} strikes, ${r.conDelta} con delta.`,
      // Un strike sin delta no cubre «cero», es que no se sabe. Decirlo evita
      // que la cobertura efectiva se lea como si estuviera completa.
      detalle: sinDelta > 0 ? `${sinDelta} strikes quedaron sin delta legible.` : undefined,
    };
  } catch (e) {
    if (e instanceof TableroIlegible) return { ok: false, mensaje: e.message };
    return {
      ok: false,
      mensaje: "No se pudo procesar el tablero.",
      detalle: e instanceof Error ? e.message.slice(0, 300) : undefined,
    };
  }
}

export type MovimientoResult = { ok: boolean; error?: string };

/**
 * Anota una apertura o un cierre hecho durante el día.
 *
 * Va contra la sesión del usuario y NO con `service_role` como los syncs: la
 * RLS de 0086 exige `ve_mercado()` y que `registrado_por` sea quien escribe,
 * y saltarse eso con la llave de servicio dejaría el registro sin autor
 * comprobable. Un apunte de lo que se operó vale por quién lo firmó.
 */
export async function registrarMovimiento(input: {
  fecha: string;
  accion: "abre" | "cierra";
  tipo: "FUT" | "CALL" | "PUT";
  lado: "largo" | "corto";
  contrato: string;
  strike: number | null;
  contratos: number;
  precio: number | null;
  nota: string | null;
}): Promise<MovimientoResult> {
  const session = await getSessionContext();
  if (!session?.profile?.ve_mercado) {
    return { ok: false, error: "No tienes acceso al módulo de Mercado." };
  }

  const contrato = input.contrato.trim().toUpperCase();
  if (!contrato) return { ok: false, error: "Falta el contrato (p. ej. DEC26)." };
  if (!Number.isInteger(input.contratos) || input.contratos <= 0) {
    return { ok: false, error: "El número de contratos tiene que ser un entero mayor que cero." };
  }
  // El mismo par de reglas que la restricción de la tabla, comprobado aquí para
  // poder decirlo con palabras en vez de devolver un error de Postgres.
  if (input.tipo === "FUT" && input.strike !== null) {
    return { ok: false, error: "Un futuro no lleva strike." };
  }
  if (input.tipo !== "FUT" && input.strike === null) {
    return { ok: false, error: "Una opción necesita su strike." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("posiciones_manuales").insert({
    fecha: input.fecha,
    accion: input.accion,
    tipo: input.tipo,
    lado: input.lado,
    contrato,
    strike: input.strike,
    contratos: input.contratos,
    precio: input.precio,
    nota: input.nota?.trim() || null,
    registrado_por: session.userId,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/mercado");
  return { ok: true };
}

/**
 * Borra un movimiento anotado.
 *
 * Quién puede lo decide la RLS —su autor o un admin—, no esta función: un
 * registro de lo que se operó es una afirmación firmada, y que cualquiera
 * pueda quitar la de otro le resta todo el valor como constancia.
 */
export async function borrarMovimiento(id: string): Promise<MovimientoResult> {
  const session = await getSessionContext();
  if (!session?.profile?.ve_mercado) {
    return { ok: false, error: "No tienes acceso al módulo de Mercado." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("posiciones_manuales")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // Un `delete` que la RLS rechaza no da error: borra cero filas y responde
  // que todo bien.
  if (!data || data.length === 0) {
    return { ok: false, error: "Solo quien lo anotó (o un administrador) puede borrarlo." };
  }
  revalidatePath("/mercado");
  return { ok: true };
}
