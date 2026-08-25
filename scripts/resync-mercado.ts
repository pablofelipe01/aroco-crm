/**
 * Sincroniza los estados de cuenta de StoneX sin esperar al cron.
 *
 *   pnpm tsx scripts/resync-mercado.ts [--dias 5] [--dry]
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/types/database";
import { traerExtracto, diasHabiles } from "../src/lib/mercado/stonex";
import { guardarExtracto } from "../src/lib/mercado/guardar";

config({ path: ".env.local" });

const db = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);
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
  if (dry) console.log("\n(--dry: no se escribió nada)");
}

main().catch((e) => {
  console.error("\nFalló:", e instanceof Error ? e.message : e);
  process.exit(1);
});
