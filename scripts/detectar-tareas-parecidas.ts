/**
 * Busca tareas repetidas entre las actas que ya existen (0094).
 *
 * El ingest solo compara lo que entra de aquí en adelante; las tareas abiertas
 * de antes nunca se miraron entre sí. Se recorren las actas de la más vieja a
 * la más nueva y las tareas abiertas de cada una se comparan con las abiertas
 * creadas antes, igual que haría el ingest si hubiera existido desde el
 * principio. Solo se guardan sugerencias: nada se cierra.
 *
 *   pnpm tsx --conditions=react-server scripts/detectar-tareas-parecidas.ts [--limite N]
 *
 * Con --limite N solo revisa las N actas más recientes (contra todo lo
 * anterior): sirve para probar la calidad antes de pagar la corrida entera.
 *
 * Es idempotente: un par ya sugerido no se repite, así que se puede volver a
 * correr si se corta a medias.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/types/database";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || !process.env.ANTHROPIC_API_KEY) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o ANTHROPIC_API_KEY.");
  process.exit(1);
}

const db = createClient<Database>(url, key, { auth: { persistSession: false } });

const iLimite = process.argv.indexOf("--limite");
const limite = iLimite >= 0 ? Number(process.argv[iLimite + 1]) : null;
if (limite !== null && !(Number.isInteger(limite) && limite > 0)) {
  console.error("--limite necesita un número entero positivo.");
  process.exit(1);
}

async function main() {
  // Después de cargar el .env: el módulo de IA lee la clave al usarse.
  const { detectarParecidas } = await import("../src/lib/tareas/parecidas");

  const { data: abiertas, error } = await db
    .from("tasks")
    .select("id, meeting_id, created_at")
    .neq("status", "done")
    .is("unida_a", null)
    .not("meeting_id", "is", null)
    .order("created_at", { ascending: true });
  if (error) throw error;

  // Agrupadas por acta, en el orden en que entraron.
  const porActa = new Map<string, string[]>();
  for (const t of abiertas ?? []) {
    porActa.set(t.meeting_id!, [...(porActa.get(t.meeting_id!) ?? []), t.id]);
  }

  const actas = [...porActa].slice(limite ? -limite : 0);

  let total = 0;
  let i = 0;
  for (const [actaId, ids] of actas) {
    i++;
    try {
      const { sugeridas } = await detectarParecidas(db, ids);
      total += sugeridas;
      console.log(`[${i}/${actas.length}] acta ${actaId}: ${ids.length} abiertas, ${sugeridas} sugeridas`);
    } catch (e) {
      console.error(`[${i}/${actas.length}] acta ${actaId}:`, e instanceof Error ? e.message : e);
    }
  }
  console.log(`Listo: ${total} sugerencias nuevas.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
