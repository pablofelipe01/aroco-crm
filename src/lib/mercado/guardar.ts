import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { Extracto } from "./stonex";
import type { Tablero } from "./barchart";
import type { TableroImagen } from "./tablero-imagen";

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

/**
 * Guarda un tablero y su cadena de strikes.
 *
 * Dos fuentes escriben aquí y saben cosas distintas: Barchart trae strikes y
 * primas pero no las griegas; el tablero que se sube como imagen trae delta,
 * volatilidad y el resto de la metadata. Por eso se MEZCLA en vez de
 * reemplazar — con un borrado, el sync nocturno de Barchart dejaría en null
 * los deltas que alguien acaba de subir, y la pantalla volvería a no poder
 * decir cuánto protege de verdad la cobertura.
 *
 * La regla es simple: cada fuente escribe solo lo que sabe, y lo que no sabe
 * lo deja como estaba.
 */
async function guardarCadena(
  db: SupabaseClient<Database>,
  boardId: string,
  filas: {
    strike: number;
    call_premium?: number | null;
    put_premium?: number | null;
    call_delta?: number | null;
    put_delta?: number | null;
  }[],
  opciones: { conGriegas: boolean; podar: boolean },
): Promise<number> {
  const { data: previas } = await db
    .from("options_chain")
    .select("strike, call_premium, put_premium, call_delta, put_delta")
    .eq("board_id", boardId);

  const antes = new Map((previas ?? []).map((p) => [Number(p.strike), p]));

  const merge = filas.map((f) => {
    const p = antes.get(f.strike);
    return {
      board_id: boardId,
      strike: f.strike,
      call_premium: f.call_premium !== undefined ? f.call_premium : (p?.call_premium ?? null),
      put_premium: f.put_premium !== undefined ? f.put_premium : (p?.put_premium ?? null),
      // Solo la imagen aporta griegas. Barchart no las manda y no puede
      // borrarlas.
      call_delta: opciones.conGriegas ? (f.call_delta ?? null) : (p?.call_delta ?? null),
      put_delta: opciones.conGriegas ? (f.put_delta ?? null) : (p?.put_delta ?? null),
    };
  });

  const { error } = await db
    .from("options_chain")
    .upsert(merge, { onConflict: "board_id,strike" });
  if (error) throw new Error(`options_chain: ${error.message}`);

  // Un strike que dejó de cotizarse se quita, pero solo cuando la fuente
  // conoce la cadena completa. La imagen puede ser un recorte del tablero, y
  // podar con ella borraría strikes que sí existen.
  if (opciones.podar) {
    const vigentes = new Set(filas.map((f) => f.strike));
    const sobran = [...antes.keys()].filter((s) => !vigentes.has(s));
    if (sobran.length > 0) {
      const { error: eDel } = await db
        .from("options_chain")
        .delete()
        .eq("board_id", boardId)
        .in("strike", sobran);
      if (eDel) throw new Error(`options_chain (poda): ${eDel.message}`);
    }
  }

  return merge.length;
}

/** Crea o recupera el tablero de una fecha y un mes, sin pisar lo que ya tenga. */
async function boardId(
  db: SupabaseClient<Database>,
  fecha: string,
  contractMonth: string,
  campos: Record<string, number | string | null>,
): Promise<string> {
  const { data: previo } = await db
    .from("options_board")
    .select("*")
    .eq("date", fecha)
    .eq("contract_month", contractMonth)
    .maybeSingle();

  // Solo se escriben los campos con valor: un null de una fuente que no sabe
  // no puede borrar lo que otra sí supo.
  const conValor = Object.fromEntries(
    Object.entries(campos).filter(([, v]) => v !== null && v !== undefined),
  );

  const { data, error } = await db
    .from("options_board")
    .upsert(
      { ...(previo ?? {}), date: fecha, contract_month: contractMonth, ...conValor },
      { onConflict: "date,contract_month" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`options_board: ${error.message}`);
  return data.id;
}

/** Tablero desde Barchart: strikes y primas, sin griegas. */
export async function guardarTablero(
  db: SupabaseClient<Database>,
  t: Tablero,
  fecha: string,
): Promise<{ contract_month: string; strikes: number }> {
  const id = await boardId(db, fecha, t.contract_month, {
    // El subyacente se deduce por paridad put-call de la propia cadena.
    underlying_price: t.underlying_price,
  });
  const strikes = await guardarCadena(
    db,
    id,
    t.filas.map((f) => ({
      strike: f.strike,
      call_premium: f.call_premium,
      put_premium: f.put_premium,
    })),
    // Barchart devuelve la cadena completa, así que sí puede podar.
    { conGriegas: false, podar: true },
  );
  return { contract_month: t.contract_month, strikes };
}

/** Tablero leído de una captura: trae las griegas y la metadata. */
export async function guardarTableroImagen(
  db: SupabaseClient<Database>,
  t: TableroImagen,
  fecha: string,
): Promise<{ contract_month: string; strikes: number; conDelta: number }> {
  const id = await boardId(db, fecha, t.contract_month, {
    underlying_price: t.underlying_price,
    dte: t.dte,
    expiration: t.expiration,
    volatility_calls: t.volatility_calls,
    volatility_puts: t.volatility_puts,
    interest_rate: t.interest_rate,
  });
  const strikes = await guardarCadena(db, id, t.strikes, {
    conGriegas: true,
    // Una captura puede ser un recorte del tablero; podar con ella borraría
    // strikes que sí existen.
    podar: false,
  });
  return {
    contract_month: t.contract_month,
    strikes,
    conDelta: t.strikes.filter((s) => s.call_delta !== null || s.put_delta !== null).length,
  };
}
