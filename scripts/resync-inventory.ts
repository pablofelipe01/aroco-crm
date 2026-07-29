/**
 * Resincroniza el inventario desde la hoja maestra sin esperar al cron.
 *
 * Útil durante la transición a CRM: mientras se alimentan la hoja y el CRM en
 * paralelo, permite refrescar y revisar el resultado en el momento. Hace lo
 * mismo que /api/cron/sync-inventory pero contra la base directamente, así que
 * no necesita levantar el servidor.
 *
 *   pnpm tsx scripts/resync-inventory.ts [--dry]
 *
 * Con --dry solo parsea e imprime el resumen, sin escribir en Supabase.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { parseInventorySheet } from "../src/lib/inventory/sheet-sync";
import { parseQualitySheet } from "../src/lib/inventory/quality-sheet";
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

async function fetchCsv(csvUrl: string, label: string): Promise<string> {
  const res = await fetch(csvUrl, { cache: "no-store", redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} al leer ${label}`);
  const csv = await res.text();
  if (csv.trimStart().startsWith("<!DOCTYPE")) {
    throw new Error(`${label} no devolvió CSV (¿dejó de estar compartida?).`);
  }
  return csv;
}

const kg = (n: number) =>
  new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 }).format(n);

async function main() {
  const startedAt = Date.now();

  // ── Lotes y salidas ────────────────────────────────────────────────────────
  const csv = await fetchCsv(serverEnv.INVENTORY_SHEET_CSV_URL, "la hoja de inventario");
  const { lots, dispatches, rowsRead } = parseInventorySheet(csv);
  if (rowsRead === 0) {
    throw new Error("0 filas con código — la estructura de la hoja pudo cambiar.");
  }

  const totalIn = lots.reduce((s, l) => s + l.qty_in_kg, 0);
  const totalOut = lots.reduce((s, l) => s + l.qty_out_kg, 0);
  const withStock = lots.filter((l) => l.qty_in_kg - l.qty_out_kg > 0).length;

  console.log(`Hoja leída: ${rowsRead} filas con código.`);
  console.log(`  lotes             ${lots.length}`);
  console.log(`  salidas           ${dispatches.length}`);
  console.log(`  ingresado         ${kg(totalIn)} kg`);
  console.log(`  salida            ${kg(totalOut)} kg`);
  console.log(`  disponible        ${kg(totalIn - totalOut)} kg en ${withStock} lotes`);

  if (dryRun) {
    console.log("\n--dry: no se escribió nada en Supabase.");
    return;
  }

  const { data, error } = await db.rpc("import_inventory_sheet", {
    p_lots: lots,
    p_dispatches: dispatches,
  });
  if (error) throw new Error(`import_inventory_sheet: ${error.message}`);

  const counts = (data ?? {}) as {
    lots?: number;
    dispatches?: number;
    lots_deleted?: number;
    dispatches_deleted?: number;
  };
  console.log(
    `\n✓ Lotes escritos ${counts.lots ?? 0} (borrados ${counts.lots_deleted ?? 0}) · ` +
      `despachos ${counts.dispatches ?? 0} (borrados ${counts.dispatches_deleted ?? 0})`,
  );

  await db.from("inventory_sync_runs").insert({
    source: "manual_script",
    status: "ok",
    rows_read: rowsRead,
    lots_upserted: counts.lots ?? 0,
    dispatches_upserted: counts.dispatches ?? 0,
    duration_ms: Date.now() - startedAt,
  });

  // ── Pestaña de inventario por calidad ──────────────────────────────────────
  const qCsv = await fetchCsv(
    serverEnv.INVENTORY_QUALITY_SHEET_CSV_URL,
    "la hoja de calidad",
  );
  const { rows } = parseQualitySheet(qCsv);
  const { data: qCount, error: qErr } = await db.rpc("replace_inventory_quality", {
    p_rows: rows,
  });
  if (qErr) throw new Error(`replace_inventory_quality: ${qErr.message}`);
  console.log(`✓ Inventario por calidad: ${qCount ?? rows.length} filas`);

  console.log(`\nListo en ${Date.now() - startedAt} ms.`);
}

main().catch((e) => {
  console.error("Resync falló:", e.message ?? e);
  process.exit(1);
});
