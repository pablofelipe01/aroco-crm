import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { construirPosicion, type LoteRow } from "@/lib/posicion";
import { calcularRiesgo, escenarios, type PosicionBroker, type Riesgo } from "@/lib/mercado/riesgo";
import { toneladasPorDelta } from "@/lib/mercado/tablero-imagen";

export type DatosMercado = {
  riesgo: Riesgo;
  escenarios: ReturnType<typeof escenarios>;
  kgFisico: number;
  lotes: ReturnType<typeof construirPosicion>["lotes"];
  totales: ReturnType<typeof construirPosicion>["totales"];
  broker: {
    fecha: string | null;
    cuenta: string | null;
    equity: number | null;
    margenInicial: number | null;
    pnlMtd: number | null;
    pnlYtd: number | null;
    moneda: string;
  } | null;
  mercado: { fecha: string | null; precioUsdT: number | null; contrato: string | null };
  /**
   * Cobertura ponderada por delta. `null` cuando no hay griegas cargadas: los
   * contratos nominales ya están en `riesgo`, y repetirlos aquí como si fueran
   * cobertura efectiva diría que se sabe algo que no se sabe.
   */
  cobertura: { efectivaT: number; sinDeltaT: number } | null;
  trm: { fecha: string | null; valor: number | null };
  error: string | null;
};

/**
 * Reúne todo lo que la pantalla de Mercado necesita.
 *
 * Cada fuente se lee por separado y se reporta su fecha. Sin eso, un dato de
 * hace tres días se ve idéntico a uno de hoy, y en riesgo eso induce a decidir
 * sobre una foto vieja creyéndola actual.
 */
export async function cargarMercado(
  db: SupabaseClient<Database>,
): Promise<DatosMercado> {
  const [lotesRes, balRes, pnlRes, posRes, boardRes, trmRes] = await Promise.all([
    db
      .from("inventory_lots")
      .select("code, remision, recepcion, odc, entry_date, origin, qty_in_kg, qty_out_kg, purchase_price_cop_kg, quality")
      .order("entry_date", { ascending: false, nullsFirst: false }),
    db.from("account_balance").select("*").order("statement_date", { ascending: false }).limit(1),
    db.from("broker_pnl").select("*").order("statement_date", { ascending: false }).limit(1),
    db.from("broker_positions").select("option_type, long_qty, short_qty, strike, contract_month, statement_date").order("statement_date", { ascending: false }),
    db.from("options_board").select("id, date, contract_month, underlying_price").not("underlying_price", "is", null).order("date", { ascending: false }).order("contract_month").limit(1),
    db.from("trm_data").select("date, trm").order("date", { ascending: false }).limit(1),
  ]);

  const posicion = construirPosicion((lotesRes.data ?? []) as LoteRow[], new Date());
  // El balance marca cuál es el estado más reciente: siempre hay uno por
  // estado procesado, tenga o no posiciones abiertas.
  const bal = balRes.data?.[0] ?? null;
  const pnl = pnlRes.data?.[0] ?? null;
  const board = boardRes.data?.[0] ?? null;
  const trmFila = trmRes.data?.[0] ?? null;

  // La fecha de referencia es la del ÚLTIMO ESTADO procesado, no la del último
  // día que TIENE posiciones. No es lo mismo: si los estados recientes vienen
  // sin posiciones —porque se cerró la cobertura— tomar el último día con filas
  // resucita un collar viejo y la pantalla dice «100 % cubierto» cuando no hay
  // ninguna cobertura. Un estado sin posiciones no es ausencia de datos: es la
  // afirmación de que ese día no había nada abierto.
  const ultimaFecha = bal?.statement_date ?? null;
  const posiciones = (posRes.data ?? []).filter(
    (p) => p.statement_date === ultimaFecha,
  ) as PosicionBroker[];

  // Griegas del tablero más reciente, si alguien cargó uno.
  const { data: griegas } = board
    ? await db
        .from("options_chain")
        .select("strike, call_delta, put_delta")
        .eq("board_id", board.id)
        .or("call_delta.not.is.null,put_delta.not.is.null")
    : { data: null };

  const deltaPorStrike = new Map(
    (griegas ?? []).map((g) => [
      Number(g.strike),
      {
        call: g.call_delta === null ? null : Number(g.call_delta),
        put: g.put_delta === null ? null : Number(g.put_delta),
      },
    ]),
  );

  const kgFisico = posicion.totales.kg_disponible;
  const riesgo = calcularRiesgo({
    kgFisico,
    costoPromedioCopKg: posicion.totales.costo_promedio_cop_kg,
    posiciones,
    precioCacaoUsdT: board?.underlying_price !== undefined && board?.underlying_price !== null ? Number(board.underlying_price) : null,
    trm: trmFila ? Number(trmFila.trm) : null,
  });

  return {
    riesgo,
    escenarios: escenarios(riesgo, kgFisico),
    kgFisico,
    lotes: posicion.lotes.filter((l) => l.kg_disponible > 0),
    totales: posicion.totales,
    broker: bal
      ? {
          fecha: bal.statement_date,
          cuenta: bal.account,
          equity: bal.total_equity === null ? null : Number(bal.total_equity),
          margenInicial: bal.initial_margin === null ? null : Number(bal.initial_margin),
          pnlMtd: pnl?.realized_pnl_mtd == null ? null : Number(pnl.realized_pnl_mtd),
          pnlYtd: pnl?.realized_pnl_ytd == null ? null : Number(pnl.realized_pnl_ytd),
          moneda: pnl?.currency ?? "USD",
        }
      : null,
    cobertura:
      deltaPorStrike.size > 0 && posiciones.length > 0
        ? (() => {
            const t = toneladasPorDelta(posiciones, deltaPorStrike);
            return { efectivaT: t.conDelta, sinDeltaT: t.sinDelta };
          })()
        : null,
    mercado: {
      fecha: board?.date ?? null,
      precioUsdT: board?.underlying_price == null ? null : Number(board.underlying_price),
      contrato: board?.contract_month ?? null,
    },
    trm: { fecha: trmFila?.date ?? null, valor: trmFila ? Number(trmFila.trm) : null },
    error: lotesRes.error?.message ?? null,
  };
}
