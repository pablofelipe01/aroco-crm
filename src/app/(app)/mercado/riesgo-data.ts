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
    /**
     * Lo que el bróker declara disponible. Se muestra tal cual y NO se calcula
     * como «equity − margen»: el extracto de StoneX no trae el margen (solo
     * beginning/ending balance, total_equity, market_variance y excess_equity),
     * así que restarlo daría una cifra inventada con pinta de exacta.
     */
    disponible: number | null;
    variacionMercado: number | null;
    pnlMtd: number | null;
    pnlYtd: number | null;
    moneda: string;
  } | null;

  /**
   * Cadena de opciones del vencimiento elegido, tal como la bajó el sync.
   *
   * Es lo que hacía falta para proponer una cobertura sin salir del CRM: hasta
   * ahora la cadena se descargaba y se guardaba, pero no se enseñaba en
   * ninguna pantalla.
   */
  cadena: {
    vencimientos: { id: string; contract_month: string; date: string; underlying: number | null }[];
    elegido: string | null;
    fecha: string | null;
    subyacente: number | null;
    /**
     * De dónde salen los deltas: `broker` si alguien subió el tablero,
     * `calculado` si los despejamos de la prima, null si no hay ninguno.
     */
    fuenteDelta: "broker" | "calculado" | null;
    filas: {
      strike: number;
      call_premium: number | null;
      call_delta: number | null;
      put_premium: number | null;
      put_delta: number | null;
      /** Contratos que ya tiene en ese strike, para verlo sobre la cadena. */
      propioCall: number;
      propioPut: number;
    }[];
  };
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
  diferenciales: {
    fecha: string | null;
    filas: { origen: string; grado: string | null; valor: number; unidad: string; fuente: string; metodo: string | null }[];
  };
  ratios: {
    fecha: string | null;
    filas: { categoria: string; producto: string; incoterm: string | null; mercado: string | null; ratio: number; ratio_anterior: number | null; precio_usd: number | null }[];
    futuros: { contrato: string; valor: number; valor_anterior: number | null; moneda: string }[];
  };
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
  /** Vencimiento que se está mirando en la cadena. Por defecto, el primero. */
  contratoElegido?: string,
): Promise<DatosMercado> {
  const [lotesRes, balRes, pnlRes, posRes, boardRes, trmRes, intelRes, difRes, ratRes, futRes] =
    await Promise.all([
    db
      .from("inventory_lots")
      .select("code, remision, recepcion, odc, entry_date, origin, qty_in_kg, qty_out_kg, purchase_price_cop_kg, quality")
      .order("entry_date", { ascending: false, nullsFirst: false }),
    db.from("account_balance").select("*").order("statement_date", { ascending: false }).limit(1),
    db.from("broker_pnl").select("*").order("statement_date", { ascending: false }).limit(1),
    db.from("broker_positions").select("option_type, long_qty, short_qty, strike, contract_month, statement_date").order("statement_date", { ascending: false }),
    db.from("options_board").select("id, date, contract_month, underlying_price").not("underlying_price", "is", null).order("date", { ascending: false }).order("contract_month").limit(60),
    db.from("trm_data").select("date, trm").order("date", { ascending: false }).limit(1),
    db
      .from("market_intel")
      .select("article_id, title, resumen, abstract, url, published_at")
      .order("published_at", { ascending: false })
      .limit(6),
    db
      .from("cocoa_differentials")
      .select("report_date, origen, grado, valor, unidad, fuente, metodo")
      .order("report_date", { ascending: false })
      .order("valor", { ascending: false })
      .limit(40),
    db
      .from("cocoa_ratios")
      .select("report_date, categoria, producto, incoterm, mercado, ratio, ratio_anterior, precio_usd")
      .order("report_date", { ascending: false })
      .order("categoria")
      .order("producto")
      .limit(60),
    db
      .from("cocoa_futuros")
      .select("report_date, contrato, valor, valor_anterior, moneda")
      .order("report_date", { ascending: false })
      .limit(10),
  ]);

  const posicion = construirPosicion((lotesRes.data ?? []) as LoteRow[], new Date());
  // El balance marca cuál es el estado más reciente: siempre hay uno por
  // estado procesado, tenga o no posiciones abiertas.
  const bal = balRes.data?.[0] ?? null;
  const pnl = pnlRes.data?.[0] ?? null;
  const tableros = boardRes.data ?? [];

  // El tablero MÁS RECIENTE DE CADA VENCIMIENTO, no los de la última fecha.
  //
  // Un vencimiento que falla en el sync no cancela a los otros, así que un día
  // cualquiera puede traer Oct y Nov pero no Dic. Filtrando por fecha, Dic
  // desaparecía del selector sin decir nada — y Dic es el contrato líquido, el
  // que se usa para cubrir. Mejor mostrarlo con su fecha: un dato de anteayer
  // sirve para decidir, uno que no está no.
  const porVencimiento = new Map<string, (typeof tableros)[number]>();
  for (const t of tableros) {
    // Vienen ordenados por fecha descendente: el primero de cada mes es el
    // último que se bajó.
    if (!porVencimiento.has(t.contract_month)) porVencimiento.set(t.contract_month, t);
  }

  // En orden de vencimiento, no alfabético: DEC26 antes que NOV26 confunde.
  const MESES = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
  const orden = (m: string) => {
    const g = /^([A-Z]{3})(\d{2})$/.exec(m.toUpperCase());
    if (!g) return 9999;
    return Number(g[2]) * 12 + MESES.indexOf(g[1]);
  };
  const delDia = [...porVencimiento.values()].sort(
    (a, b) => orden(a.contract_month) - orden(b.contract_month),
  );

  const elegido =
    delDia.find((t) => t.contract_month === contratoElegido) ?? delDia[0] ?? null;
  const board = elegido;
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

  // La cadena entera del vencimiento elegido: es lo que se pinta en pantalla.
  const { data: cadenaFilas } = board
    ? await db
        .from("options_chain")
        .select(
          "strike, call_premium, call_delta, call_delta_calc, put_premium, put_delta, put_delta_calc",
        )
        .eq("board_id", board.id)
        .order("strike", { ascending: true })
    : { data: null };

  /**
   * Deltas para medir la cobertura efectiva.
   *
   * Manda el del BRÓKER —es lo que afirma la contraparte con la que se
   * liquida— y cuando no hay, entra el CALCULADO desde la prima (Black-76, ver
   * `black76.ts`). Antes, sin tablero subido no había delta ninguno y la
   * pantalla no podía decir cuánto protegía de verdad una cobertura; eso quedó
   * anotado en la revisión del 1-sep-2026.
   */
  const { data: griegas } = board
    ? await db
        .from("options_chain")
        .select("strike, call_delta, call_delta_calc, put_delta, put_delta_calc")
        .eq("board_id", board.id)
        .or(
          "call_delta.not.is.null,put_delta.not.is.null,call_delta_calc.not.is.null,put_delta_calc.not.is.null",
        )
    : { data: null };

  const num = (v: number | string | null) => (v === null ? null : Number(v));

  const deltaPorStrike = new Map(
    (griegas ?? []).map((g) => [
      Number(g.strike),
      {
        call: num(g.call_delta) ?? num(g.call_delta_calc),
        put: num(g.put_delta) ?? num(g.put_delta_calc),
      },
    ]),
  );

  /**
   * De dónde salieron esos deltas, para poder decirlo en pantalla. Un número
   * deducido de una prima y uno afirmado por el bróker no valen lo mismo en
   * una discusión sobre una cobertura.
   */
  const fuenteDelta: "broker" | "calculado" | null = (griegas ?? []).some(
    (g) => g.call_delta !== null || g.put_delta !== null,
  )
    ? "broker"
    : (griegas ?? []).length > 0
      ? "calculado"
      : null;

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
          disponible: bal.excess_equity === null ? null : Number(bal.excess_equity),
          variacionMercado:
            bal.market_variance === null ? null : Number(bal.market_variance),
          pnlMtd: pnl?.realized_pnl_mtd == null ? null : Number(pnl.realized_pnl_mtd),
          pnlYtd: pnl?.realized_pnl_ytd == null ? null : Number(pnl.realized_pnl_ytd),
          moneda: pnl?.currency ?? "USD",
        }
      : null,
    cadena: {
      vencimientos: delDia.map((t) => ({
        id: t.id,
        contract_month: t.contract_month,
        date: t.date,
        underlying: t.underlying_price === null ? null : Number(t.underlying_price),
      })),
      elegido: board?.contract_month ?? null,
      fecha: board?.date ?? null,
      subyacente:
        board?.underlying_price == null ? null : Number(board.underlying_price),
      fuenteDelta,
      filas: (cadenaFilas ?? []).map((f) => {
        const strike = Number(f.strike);
        // Los contratos propios se pintan sobre la cadena. Es la diferencia
        // entre mirar precios y mirar TU posición dentro de esos precios, que
        // es lo que hace falta para decidir si ampliar o rodar una cobertura.
        const mias = posiciones.filter(
          (p) => p.strike !== null && Number(p.strike) === strike,
        );
        const neto = (tipo: string) =>
          mias
            .filter((p) => (p.option_type ?? "").toUpperCase() === tipo)
            .reduce((a, p) => a + (p.long_qty ?? 0) - (p.short_qty ?? 0), 0);
        return {
          strike,
          call_premium: f.call_premium === null ? null : Number(f.call_premium),
          // En pantalla se enseña el delta que haya, con la fuente declarada
          // arriba: entre no mostrar nada y mostrar el calculado, lo segundo
          // es lo que permite decidir.
          call_delta: num(f.call_delta) ?? num(f.call_delta_calc),
          put_premium: f.put_premium === null ? null : Number(f.put_premium),
          put_delta: num(f.put_delta) ?? num(f.put_delta_calc),
          propioCall: neto("CALL"),
          propioPut: neto("PUT"),
        };
      }),
    },
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
    // Solo el reporte más reciente: mezclar semanas pondría dos diferenciales
    // del mismo origen uno al lado del otro sin decir cuál es el vigente.
    diferenciales: (() => {
      const todas = difRes.data ?? [];
      const ultima = todas[0]?.report_date ?? null;
      return { fecha: ultima, filas: todas.filter((f) => f.report_date === ultima) };
    })(),
    // Solo el reporte más reciente: mezclar semanas pondría dos ratios del
    // mismo producto uno al lado del otro sin decir cuál es el vigente.
    ratios: (() => {
      const todas = ratRes.data ?? [];
      const ultima = todas[0]?.report_date ?? null;
      return {
        fecha: ultima,
        filas: todas.filter((f) => f.report_date === ultima),
        futuros: (futRes.data ?? []).filter((f) => f.report_date === ultima),
      };
    })(),
    intel: intelRes.data ?? [],
    error: lotesRes.error?.message ?? null,
  };
}
