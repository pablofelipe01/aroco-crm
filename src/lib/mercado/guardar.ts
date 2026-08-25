import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { Extracto } from "./stonex";

export type ResultadoGuardado = {
  statement_date: string;
  cuenta: string;
  posiciones: number;
  balance: boolean;
  pnl: boolean;
};

/**
 * Guarda un estado de cuenta completo.
 *
 * Se escriben las cuatro tablas con upsert sobre la clave natural, así que
 * reprocesar el mismo día actualiza en vez de duplicar. Sin eso, dos corridas
 * del mismo día contarían la exposición y el P&L dos veces — que es lo que
 * pasaba con el sync anterior, que insertaba y confiaba.
 */
export async function guardarExtracto(
  db: SupabaseClient<Database>,
  e: Extracto,
): Promise<ResultadoGuardado> {
  // El hash identifica el documento. Se calcula sobre cuenta+fecha y no sobre
  // los bytes del PDF porque el archivo vive en el servidor del MCP y aquí solo
  // llega su ruta; StoneX emite un estado por cuenta y día, así que esa pareja
  // ya lo identifica.
  const hash = createHash("sha256")
    .update(`stonex:${e.cuenta}:${e.statement_date}`)
    .digest("hex");

  const { error: eSt } = await db.from("broker_statements").upsert(
    {
      filename: e.archivo.split("/").pop() ?? e.archivo,
      statement_date: e.statement_date,
      account: e.cuenta,
      file_hash: hash,
      num_positions: e.posiciones.length,
      processed_at: new Date().toISOString(),
    },
    { onConflict: "file_hash" },
  );
  if (eSt) throw new Error(`broker_statements: ${eSt.message}`);

  const { error: eBal } = await db.from("account_balance").upsert(
    { statement_date: e.statement_date, account: e.cuenta, ...e.balance },
    { onConflict: "statement_date,account" },
  );
  if (eBal) throw new Error(`account_balance: ${eBal.message}`);

  const { error: ePnl } = await db.from("broker_pnl").upsert(
    {
      statement_date: e.statement_date,
      account: e.cuenta,
      realized_pnl_mtd: e.pnl.mtd,
      realized_pnl_ytd: e.pnl.ytd,
      currency: e.pnl.moneda,
    },
    { onConflict: "statement_date,account" },
  );
  if (ePnl) throw new Error(`broker_pnl: ${ePnl.message}`);

  // Las posiciones del día se reemplazan enteras. Un upsert dejaría vivas las
  // de una corrida anterior que ya se cerraron, y una posición cerrada que
  // sigue apareciendo dice que hay cobertura donde ya no la hay.
  const { error: eDel } = await db
    .from("broker_positions")
    .delete()
    .eq("statement_date", e.statement_date)
    .eq("account", e.cuenta);
  if (eDel) throw new Error(`broker_positions (limpieza): ${eDel.message}`);

  if (e.posiciones.length > 0) {
    const { error: ePos } = await db.from("broker_positions").insert(
      e.posiciones.map((p) => ({
        statement_date: e.statement_date,
        account: e.cuenta,
        ...p,
      })),
    );
    if (ePos) throw new Error(`broker_positions: ${ePos.message}`);
  }

  return {
    statement_date: e.statement_date,
    cuenta: e.cuenta,
    posiciones: e.posiciones.length,
    balance: e.balance.total_equity !== null,
    pnl: e.pnl.mtd !== 0 || e.pnl.ytd !== 0,
  };
}
