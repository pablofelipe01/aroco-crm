import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { construirPosicion, type LoteRow } from "@/lib/posicion";
import { calcularRiesgo, escenarios, type PosicionBroker, type Riesgo } from "@/lib/mercado/riesgo";
import { toneladasPorDelta } from "@/lib/mercado/tablero-imagen";
import { precioEnVivo, ultimoPrecioGuardado } from "@/lib/mercado/precio";

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
  mercado: {
    fecha: string | null;
    precioUsdT: number | null;
    contrato: string | null;
    /** De dónde salió el precio, para poder decirlo en pantalla. */
    fuente: "vivo" | "guardado" | "paridad" | null;
    momento: string | null;
    cierrePrevio: number | null;
  };
  /**
   * Cobertura ponderada por delta. `null` cuando no hay griegas cargadas: los
   * contratos nominales ya están en `riesgo`, y repetirlos aquí como si fueran
   * cobertura efectiva diría que se sabe algo que no se sabe.
   */
  cobertura: { efectivaT: number; sinDeltaT: number } | null;
  trm: { fecha: string | null; valor: number | null };
  intel: {
    article_id: string; title: string; resumen: string | null;
    abstract: string | null; url: string | null; published_at: string;
  }[];
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
  const [lotesRes, balRes, pnlRes, posRes, boardRes, trmRes, intelRes] = await Promise.all([
    db
      .from("inventory_lots")
      .select("code, remision, recepcion, odc, entry_date, origin, qty_in_kg, qty_out_kg, purchase_price_cop_kg, quality")
      .order("entry_date", { ascending: false, nullsFirst: false }),
    db.from("account_balance").select("*").order("statement_date", { ascending: false }).limit(1),
    db.from("broker_pnl").select("*").order("statement_date", { ascending: false }).limit(1),
    db.from("broker_positions").select("option_type, long_qty, short_qty, strike, contract_month, statement_date").order("statement_date", { ascending: false }),
    db.from("options_board").select("id, date, contract_month, underlying_price").not("underlying_price", "is", null).order("date", { ascending: false }).order("contract_month").limit(1),
    db.from("trm_data").select("date, trm").order("date", { ascending: false }).limit(1),
    db
      .from("market_intel")
      .select("article_id, title, resumen, abstract, url, published_at")
      .order("published_at", { ascending: false })
      .limit(6),
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

  // ── Precio del cacao ──────────────────────────────────────────────────────
  // En vivo primero. Antes salía de la paridad put-call sobre la cadena de
  // Barchart, que solo se refresca con el sync lento: el 28-ago eso daba 5.949
  // con el mercado en 6.483, y el inventario se valoraba con un precio de hace
  // días. Si la consulta no responde a tiempo se cae a lo último guardado y,
  // en último caso, a la paridad — y la pantalla dice cuál se usó.
  const paridad =
    board?.underlying_price === undefined || board?.underlying_price === null
      ? null
      : Number(board.underlying_price);

  let precioUsdT: number | null = null;
  let fuente: "vivo" | "guardado" | "paridad" | null = null;
  let momento: string | null = null;
  let cierrePrevio: number | null = null;
  let fechaPrecio: string | null = null;

  try {
    const vivo = await precioEnVivo();
    precioUsdT = vivo.usdT;
    fuente = "vivo";
    momento = vivo.momento;
    cierrePrevio = vivo.cierrePrevio;
    fechaPrecio = vivo.fecha;
    // Aquí NO se guarda: esta función corre con el cliente del usuario y
    // `market_data` no tiene política de escritura, así que el intento fallaría
    // y arrastraría el precio recién traído al camino de respaldo. Guardar es
    // tarea del sync, que corre con service_role.
  } catch {
    const guardado = await ultimoPrecioGuardado(db);
    if (guardado) {
      precioUsdT = guardado.usdT;
      fuente = "guardado";
      fechaPrecio = guardado.fecha;
    } else if (paridad !== null) {
      precioUsdT = paridad;
      fuente = "paridad";
      fechaPrecio = board?.date ?? null;
    }
  }

  const kgFisico = posicion.totales.kg_disponible;
  const riesgo = calcularRiesgo({
    kgFisico,
    costoPromedioCopKg: posicion.totales.costo_promedio_cop_kg,
    posiciones,
    precioCacaoUsdT: precioUsdT,
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
      fecha: fechaPrecio,
      precioUsdT,
      contrato: board?.contract_month ?? null,
      fuente,
      momento,
      cierrePrevio,
    },
    trm: { fecha: trmFila?.date ?? null, valor: trmFila ? Number(trmFila.trm) : null },
    intel: intelRes.data ?? [],
    error: lotesRes.error?.message ?? null,
  };
}
