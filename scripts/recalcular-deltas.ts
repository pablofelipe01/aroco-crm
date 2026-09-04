/**
 * Recalcula el delta de las cadenas de opciones ya guardadas.
 *
 * El sync nocturno lo hace solo desde la migración 0081, pero los tableros que
 * ya estaban en la base se bajaron cuando el delta no se calculaba: tienen
 * prima y no tienen griegas. Este script los rellena sin esperar a que el
 * vencimiento se vuelva a descargar.
 *
 * Solo toca `call_delta_calc` / `put_delta_calc`. Lo que afirmó el bróker en
 * `call_delta` / `put_delta` no se toca nunca: son dos cosas distintas y la
 * columna del bróker es la que manda cuando existe.
 *
 *   pnpm tsx scripts/recalcular-deltas.ts [--dry]
 *
 * Con --dry calcula e imprime el resumen sin escribir.
 */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  anosHasta,
  deltaDesdePrima,
  vencimientoOpcion,
} from "../src/lib/mercado/black76";
import { TASA_POR_DEFECTO } from "../src/lib/mercado/guardar";
import type { Database } from "../src/lib/types/database";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry");
const db = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false },
});

const aPorciento = (v: number | null) =>
  v === null ? null : Math.round(v * 100 * 10_000) / 10_000;

async function main() {
  const { data: ajuste } = await db
    .from("ajustes_mercado")
    .select("valor")
    .eq("clave", "tasa_libre_riesgo")
    .maybeSingle();
  const tasa = Number(ajuste?.valor ?? TASA_POR_DEFECTO) || TASA_POR_DEFECTO;

  const { data: boards, error } = await db
    .from("options_board")
    .select("id, date, contract_month, underlying_price, expiration, dte")
    .order("date", { ascending: false });
  if (error) throw new Error(error.message);

  console.log(`Tasa ${(tasa * 100).toFixed(2)} % · ${boards?.length ?? 0} tableros\n`);

  let totalFilas = 0;
  let totalConDelta = 0;

  for (const b of boards ?? []) {
    // El vencimiento del bróker manda; la regla del segundo viernes es el
    // respaldo para los tableros que vinieron de Barchart, que no lo trae.
    const vence = b.expiration ?? vencimientoOpcion(b.contract_month);
    const T = vence ? anosHasta(b.date, vence) : null;
    const F = b.underlying_price === null ? null : Number(b.underlying_price);

    if (F === null || T === null) {
      console.log(
        `· ${b.date} ${b.contract_month}: sin ${F === null ? "subyacente" : "plazo"}, se salta`,
      );
      continue;
    }

    // El tablero también se queda con su vencimiento: los que bajó Barchart
    // lo tenían en null, y sin él no hay forma de avisar cuando una opción
    // está por vencer —la lección del primer collar, que se convirtió en
    // futuros por no mirar la fecha—.
    if (!dryRun && (b.expiration === null || b.dte === null)) {
      const { error: eB } = await db
        .from("options_board")
        .update({ expiration: vence, dte: Math.round(T * 365) })
        .eq("id", b.id);
      if (eB) throw new Error(`options_board ${b.id}: ${eB.message}`);
    }

    const { data: filas } = await db
      .from("options_chain")
      .select("id, strike, call_premium, put_premium")
      .eq("board_id", b.id);

    const cambios = (filas ?? []).map((f) => {
      const base = { F, K: Number(f.strike), T, r: tasa };
      const c = f.call_premium === null ? null : Number(f.call_premium);
      const p = f.put_premium === null ? null : Number(f.put_premium);
      return {
        id: f.id,
        call_delta_calc: c === null ? null : aPorciento(deltaDesdePrima("call", c, base)),
        put_delta_calc: p === null ? null : aPorciento(deltaDesdePrima("put", p, base)),
      };
    });

    const conDelta = cambios.filter(
      (c) => c.call_delta_calc !== null || c.put_delta_calc !== null,
    ).length;
    totalFilas += cambios.length;
    totalConDelta += conDelta;

    console.log(
      `· ${b.date} ${b.contract_month} (vence ${vence}, ${Math.round(T * 365)} d): ` +
        `${conDelta}/${cambios.length} strikes con delta`,
    );

    if (dryRun) continue;

    // En bloques de 50 en paralelo: son ~2.700 filas en total y de una en una
    // el script se hace eterno, pero soltarlas todas a la vez abre miles de
    // conexiones contra la base.
    for (let i = 0; i < cambios.length; i += 50) {
      const lote = cambios.slice(i, i + 50);
      const res = await Promise.all(
        lote.map((c) =>
          db
            .from("options_chain")
            .update({
              call_delta_calc: c.call_delta_calc,
              put_delta_calc: c.put_delta_calc,
            })
            .eq("id", c.id),
        ),
      );
      const falla = res.find((r) => r.error);
      if (falla?.error) throw new Error(`options_chain: ${falla.error.message}`);
    }
  }

  console.log(
    `\n${dryRun ? "[dry] " : ""}${totalConDelta} de ${totalFilas} strikes con delta calculado.`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
