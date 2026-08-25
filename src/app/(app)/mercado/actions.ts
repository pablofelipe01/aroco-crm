"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionContext } from "@/lib/auth";
import { sincronizarMercado } from "@/lib/mercado/sync";

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
