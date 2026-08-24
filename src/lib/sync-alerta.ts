import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Avisa en la campana cuando una sincronización falla.
 *
 * El sync de inventario falló todos los días del 22 al 24 de agosto y nadie se
 * enteró: el error quedaba escrito en `inventory_sync_runs`, que es una tabla
 * que nadie abre, y el módulo siguió mostrando los datos del 21 con toda
 * normalidad. Una vista desactualizada no se ve rota — se ve vieja, y eso solo
 * se nota cuando alguien busca algo que sabe que debería estar.
 *
 * El aviso va a Dirección. `dedupe_key` lleva la fecha, así que un cron que
 * falla siete días seguidos avisa siete veces, una por día: si se avisara una
 * sola vez, el problema desaparecería de la campana mientras sigue vivo.
 */
export async function avisarFalloSync(
  db: SupabaseClient<Database>,
  fuente: string,
  etiqueta: string,
  mensaje: string,
): Promise<void> {
  const hoy = new Date().toISOString().slice(0, 10);
  const { error } = await db.from("notifications").insert({
    type: "sync_error",
    severity: "danger",
    title: `No se actualizó ${etiqueta}`,
    // El mensaje entero, no un "revisa los logs": quien lo lee tiene que poder
    // saber si es un problema de la hoja o del CRM sin abrir otra herramienta.
    body: mensaje.slice(0, 500),
    for_department: "Dirección",
    dedupe_key: `sync_error:${fuente}:${hoy}`,
  });
  // Si el aviso falla, no se toca el resultado del cron: ya está fallando por
  // otra cosa y esconderla detrás de un segundo error no ayuda a nadie.
  if (error) console.error("[avisarFalloSync]", error.message);
}
