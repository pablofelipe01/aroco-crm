/**
 * Agrupa por tema las actas que todavía no lo están.
 *
 *   pnpm tsx scripts/agrupar-actas.ts [--todas] [--dry]
 *
 * Por defecto salta las que ya tienen temas, así que se puede volver a correr
 * sin gastar de más si se corta a la mitad. `--todas` reagrupa también esas.
 *
 * Las actas nuevas del correo se agrupan solas al llegar (ingest); esto es
 * para las que ya estaban antes de la 0076.
 */
import Module from "node:module";
// `server-only` corta la importación fuera de Next. Se anula: aquí el código
// del servidor se ejecuta en el servidor, que es justo lo que esa guarda pide.
const cargar = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
(Module as unknown as { _load: unknown })._load = function (req: string, ...rest: unknown[]) {
  if (req === "server-only") return {};
  return (cargar as (...a: unknown[]) => unknown).call(this, req, ...rest);
};

import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/types/database";

// Importación dinámica a propósito: un `import` estático se evalúa ANTES que
// el parche de arriba —así lo manda ESM— y `server-only` cortaría igual.
type Agrupar = typeof import("../src/lib/ai/actas")["agruparActaPorTemas"];
let agruparActaPorTemas: Agrupar;

config({ path: ".env.local" });

const db = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

const TODAS = process.argv.includes("--todas");
const DRY = process.argv.includes("--dry");

/**
 * De a tres a la vez. Secuencial tardaría demasiado con 51 actas y de golpe
 * choca con el límite de la API; tres avanza rápido sin provocar reintentos.
 */
const A_LA_VEZ = 3;

type Fila = { id: string; title: string; notes: string | null };

async function agrupar(acta: Fila): Promise<string> {
  const { count: yaTiene } = await db
    .from("meeting_temas")
    .select("id", { count: "exact", head: true })
    .eq("meeting_id", acta.id);

  if (!TODAS && (yaTiene ?? 0) > 0) return `salta (ya tiene ${yaTiene} temas)`;
  if (!acta.notes?.trim()) return "salta (sin texto, solo adjunto)";

  const { data: tareas } = await db
    .from("tasks")
    .select("id, name")
    .eq("meeting_id", acta.id)
    .order("created_at", { ascending: true });

  const lista = tareas ?? [];
  const temas = await agruparActaPorTemas(
    acta.notes,
    lista.map((t) => ({ nombre: t.name })),
  );
  if (temas.length === 0) return "la IA no encontró temas";
  if (DRY) return `[dry] ${temas.length} temas · ${lista.length} tareas`;

  // Fuera los anteriores. `tasks.tema_id` es `on delete set null`, así que las
  // tareas sobreviven aunque el reparto siguiente falle.
  await db.from("meeting_temas").delete().eq("meeting_id", acta.id);

  const { data: creados, error } = await db
    .from("meeting_temas")
    .insert(
      temas.map((t, i) => ({
        meeting_id: acta.id,
        titulo: t.titulo,
        resumen: t.resumen || null,
        orden: i,
      })),
    )
    .select("id");
  if (error) throw new Error(error.message);

  let repartidas = 0;
  await Promise.all(
    (creados ?? []).map((tema, i) => {
      const ids = (temas[i]?.tareas ?? [])
        .map((n) => lista[n]?.id)
        .filter((x): x is string => !!x);
      if (ids.length === 0) return Promise.resolve();
      repartidas += ids.length;
      return db
        .from("tasks")
        .update({ tema_id: tema.id })
        .in("id", ids)
        .then(() => undefined);
    }),
  );

  const sueltas = lista.length - repartidas;
  return `${temas.length} temas · ${repartidas}/${lista.length} tareas${
    sueltas > 0 ? ` (${sueltas} sin tema)` : ""
  }`;
}

async function main() {
  ({ agruparActaPorTemas } = await import("../src/lib/ai/actas"));

  const { data: actas, error } = await db
    .from("meetings")
    .select("id, title, notes")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const lista = (actas ?? []) as Fila[];
  console.log(
    `${lista.length} actas · ${TODAS ? "reagrupando todas" : "solo las que no tienen temas"}${
      DRY ? " · SIN GUARDAR" : ""
    }\n`,
  );

  let hechas = 0;
  let saltadas = 0;
  const errores: string[] = [];

  for (let i = 0; i < lista.length; i += A_LA_VEZ) {
    const lote = lista.slice(i, i + A_LA_VEZ);
    await Promise.all(
      lote.map(async (acta) => {
        const etiqueta = acta.title.slice(0, 44).padEnd(44);
        try {
          const r = await agrupar(acta);
          if (r.startsWith("salta")) saltadas++;
          else hechas++;
          console.log(`  ${etiqueta} ${r}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          errores.push(`${acta.title}: ${msg}`);
          console.log(`  ${etiqueta} ERROR — ${msg}`);
        }
      }),
    );
  }

  console.log(
    `\n${hechas} agrupadas · ${saltadas} saltadas · ${errores.length} con error`,
  );
  if (errores.length > 0) {
    console.log("\nerrores:");
    for (const e of errores) console.log(`  · ${e}`);
  }
}

main();
