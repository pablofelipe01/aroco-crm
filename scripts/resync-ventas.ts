/**
 * Resincroniza las ventas desde la hoja sin esperar al cron.
 *
 *   pnpm tsx scripts/resync-ventas.ts [--dry]
 *
 * Con --dry solo parsea e imprime el resumen, sin escribir en Supabase.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parseVentasSheet } from "../src/lib/ventas/sheet";
import { serverEnv } from "../src/lib/env";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry");
const db = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const fmt = (n: number, d = 0) =>
  new Intl.NumberFormat("es-CO", { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);

async function main() {
  const res = await fetch(serverEnv.VENTAS_SHEET_CSV_URL, {
    cache: "no-store",
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer la hoja de ventas`);
  const csv = await res.text();
  if (csv.trimStart().startsWith("<!DOCTYPE")) {
    throw new Error("La hoja no devolvió CSV (¿dejó de estar compartida?).");
  }

  const { filas, descartadas } = parseVentasSheet(csv);
  if (filas.length === 0) throw new Error("0 ventas parseadas.");

  const porAnio = new Map<string, { n: number; kg: number; valor: number }>();
  for (const f of filas) {
    const a = f.fecha.slice(0, 4);
    const d = porAnio.get(a) ?? { n: 0, kg: 0, valor: 0 };
    d.n++;
    d.kg += f.kg;
    d.valor += f.valor_pagar;
    porAnio.set(a, d);
  }

  console.log(`\n${filas.length} ventas leídas de la hoja\n`);
  for (const [a, d] of [...porAnio.entries()].sort()) {
    console.log(
      `  ${a}: ${String(d.n).padStart(3)} ventas · ${fmt(d.kg, 1).padStart(12)} kg · $ ${fmt(d.valor).padStart(17)}`,
    );
  }
  if (descartadas.length) {
    console.log(`\n  ${descartadas.length} filas descartadas:`);
    for (const d of descartadas) console.log(`    fila ${d.fila}: ${d.motivo}`);
  }

  if (dryRun) {
    console.log("\n(--dry: no se escribió nada)");
    return;
  }

  const { data, error } = await db.rpc("import_ventas_sheet", { filas });
  if (error) throw new Error(error.message);
  console.log(`\nEscritas ${data} ventas en Supabase.`);
}

main().catch((e) => {
  console.error("\nFalló:", e instanceof Error ? e.message : e);
  process.exit(1);
});
