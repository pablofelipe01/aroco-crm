/**
 * Sincroniza los estados de cuenta de StoneX sin esperar al cron.
 *
 *   pnpm tsx scripts/resync-mercado.ts [--dias 5] [--dry]
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/types/database";
import { traerExtracto, diasHabiles } from "../src/lib/mercado/stonex";
import { guardarExtracto, guardarTablero } from "../src/lib/mercado/guardar";
import { listarVencimientos, traerTablero } from "../src/lib/mercado/barchart";

config({ path: ".env.local" });

const db = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
const bc = {
  url: process.env.BARCHART_MCP_URL!,
  clientId: process.env.BARCHART_MCP_CF_CLIENT_ID,
  clientSecret: process.env.BARCHART_MCP_CF_CLIENT_SECRET,
};
const mcp = {
  url: process.env.STONEX_MCP_URL!,
  clientId: process.env.STONEX_MCP_CF_CLIENT_ID,
  clientSecret: process.env.STONEX_MCP_CF_CLIENT_SECRET,
};

const dry = process.argv.includes("--dry");
const i = process.argv.indexOf("--dias");
const dias = i >= 0 ? Number(process.argv[i + 1]) : 5;

const usd = (n: number | null) =>
  n === null ? "—" : `US$ ${n.toLocaleString("es-CO", { minimumFractionDigits: 2 })}`;

async function main() {
    for (const fecha of diasHabiles(new Date(), dias)) {
    try {
      const e = await traerExtracto(mcp, fecha);
      if (!e) {
        console.log(`  ${fecha}  sin estado (festivo o aún no cierra)`);
        continue;
      }
      console.log(
        `  ${fecha}  ${e.cuenta_nombre ?? e.cuenta} · equity ${usd(e.balance.total_equity)} · ` +
          `P&L ytd ${usd(e.pnl.ytd)} · ${e.posiciones.length} posiciones`,
      );
      if (!dry) {
        const r = await guardarExtracto(db, e);
        console.log(`            guardado ✓ (${r.posiciones} posiciones)`);
      }
    } catch (err) {
      console.log(`  ${fecha}  FALLA ${err instanceof Error ? err.message.slice(0, 160) : err}`);
    }
  }
  // ── Barchart ────────────────────────────────────────────────────────────
  if (!process.argv.includes("--solo-stonex")) {
    const j = process.argv.indexOf("--vencimientos");
    const cuantos = j >= 0 ? Number(process.argv[j + 1]) : 3;
    const hoy = new Date().toISOString().slice(0, 10);
    console.log(`\nBARCHART — ${cuantos} vencimientos más cercanos`);
    const vencs = await listarVencimientos(bc);
    for (const v of vencs.slice(0, cuantos)) {
      try {
        const t = await traerTablero(bc, v);
        if (!t) { console.log(`  ${v.label.padEnd(14)} sin strikes cotizados`); continue; }
        const conCall = t.filas.filter((f) => f.call_premium !== null).length;
        const conPut = t.filas.filter((f) => f.put_premium !== null).length;
        console.log(`  ${t.etiqueta.padEnd(14)} ${t.contract_month}  ${t.filas.length} strikes (${conCall} calls, ${conPut} puts)`);
        if (!dry) {
          const r = await guardarTablero(db, t, hoy);
          console.log(`                 guardado ✓ ${r.strikes} strikes`);
        }
      } catch (err) {
        console.log(`  ${v.label.padEnd(14)} FALLA ${err instanceof Error ? err.message.slice(0, 140) : err}`);
      }
    }
  }

  if (dry) console.log("\n(--dry: no se escribió nada)");
}

main().catch((e) => {
  console.error("\nFalló:", e instanceof Error ? e.message : e);
  process.exit(1);
});
