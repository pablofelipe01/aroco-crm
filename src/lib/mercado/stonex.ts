/**
 * Sincronización del estado de cuenta diario de StoneX.
 *
 * El camino es: el MCP baja el PDF del día pedido y lo extrae; aquí se
 * normaliza y se guarda. Los balances, el P&L realizado y las posiciones
 * abiertas salen todos del mismo documento, así que una corrida deja las tres
 * tablas consistentes entre sí o no deja ninguna.
 *
 * El mapeo se escribió contra la forma REAL del payload, comprobada contra un
 * estado del 21-ago-2026. Vale la pena decirlo porque el sync de CacaoQ busca
 * claves que este MCP no devuelve —`positions` en vez de `open_positions`,
 * `pnl` en vez de `summary.realized_profit_loss`— y `balances` no es un
 * diccionario plano sino uno anidado por tipo de cuenta. Copiar ese mapeo
 * habría guardado balances vacíos y P&L en cero sin que nada fallara.
 */

import { llamarHerramienta, type McpConfig } from "@/lib/mcp/client";

export type Extracto = {
  statement_date: string;
  cuenta: string;
  cuenta_nombre: string | null;
  balance: BalanceNormalizado;
  pnl: { mtd: number; ytd: number; moneda: string };
  posiciones: PosicionNormalizada[];
  archivo: string;
};

export type BalanceNormalizado = {
  beginning_balance: number | null;
  ending_balance: number | null;
  total_equity: number | null;
  long_option_value: number | null;
  short_option_value: number | null;
  net_option_value: number | null;
  net_liquidating_value: number | null;
  prior_net_liquidating_value: number | null;
  market_variance: number | null;
  initial_margin: number | null;
  maintenance_margin: number | null;
  excess_equity: number | null;
};

export type PosicionNormalizada = {
  trade_date: string | null;
  card: string | null;
  long_qty: number;
  short_qty: number;
  option_type: string | null;
  contract_month: string | null;
  exchange: string;
  strike: number | null;
  settle_price: number | null;
  market_value: number | null;
  dr_cr: string | null;
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // StoneX escribe montos con comas de miles y a veces con sufijos.
  const limpio = String(v).replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
};

const ent = (v: unknown): number => Math.trunc(num(v) ?? 0);
const txt = (v: unknown): string | null => {
  const s = v === null || v === undefined ? "" : String(v).trim();
  return s === "" ? null : s;
};

/** Toma la primera clave presente. Los nombres varían entre versiones del MCP. */
function primero(o: Record<string, unknown>, claves: string[]): unknown {
  for (const k of claves) if (o[k] !== undefined && o[k] !== null) return o[k];
  return undefined;
}

/**
 * `balances` viene por tipo de cuenta: USD_SEGREGATED_U1, CONV_SEG_TOTAL,
 * TOTAL_CONVERTED… Se prefiere el consolidado, que es el que responde «cuánto
 * hay en total». Elegir el primero que aparezca daría una cifra parcial sin
 * avisar.
 */
export function normalizarBalance(balances: unknown): BalanceNormalizado {
  const vacio: BalanceNormalizado = {
    beginning_balance: null, ending_balance: null, total_equity: null,
    long_option_value: null, short_option_value: null, net_option_value: null,
    net_liquidating_value: null, prior_net_liquidating_value: null,
    market_variance: null, initial_margin: null, maintenance_margin: null,
    excess_equity: null,
  };
  if (!balances || typeof balances !== "object") return vacio;

  const b = balances as Record<string, unknown>;
  const preferidas = ["TOTAL_CONVERTED", "CONV_SEG_TOTAL"];
  const elegida =
    preferidas.map((k) => b[k]).find((v) => v && typeof v === "object") ??
    Object.values(b).find((v) => v && typeof v === "object");
  if (!elegida) return vacio;

  const x = elegida as Record<string, unknown>;
  const g = (...ks: string[]) => num(primero(x, ks));
  return {
    beginning_balance: g("beginning_balance", "beginningBalance"),
    ending_balance: g("ending_balance", "endingBalance"),
    total_equity: g("total_equity", "totalEquity"),
    long_option_value: g("long_option_value", "longOptionValue"),
    short_option_value: g("short_option_value", "shortOptionValue"),
    net_option_value: g("net_option_value", "netOptionValue", "net_market_value_of_options"),
    net_liquidating_value: g("net_liquidating_value", "netLiquidatingValue", "current_net_liquidating_value"),
    prior_net_liquidating_value: g("prior_net_liquidating_value", "priorNetLiquidatingValue"),
    market_variance: g("market_variance", "marketVariance"),
    initial_margin: g("initial_margin", "initialMargin"),
    maintenance_margin: g("maintenance_margin", "maintenanceMargin"),
    excess_equity: g("excess_equity", "excessEquity"),
  };
}

/** `summary.realized_profit_loss` viene por moneda: { USD: { mtd, ytd } }. */
export function normalizarPnl(summary: unknown): { mtd: number; ytd: number; moneda: string } {
  const s = (summary ?? {}) as Record<string, unknown>;
  const rpl = (primero(s, ["realized_profit_loss", "realizedProfitLoss", "pnl"]) ?? {}) as Record<string, unknown>;

  const porMoneda = Object.entries(rpl).find(([, v]) => v && typeof v === "object");
  if (porMoneda) {
    const [moneda, v] = porMoneda;
    const o = v as Record<string, unknown>;
    return {
      mtd: num(primero(o, ["mtd", "realized_pnl_mtd"])) ?? 0,
      ytd: num(primero(o, ["ytd", "realized_pnl_ytd"])) ?? 0,
      moneda,
    };
  }
  return { mtd: 0, ytd: 0, moneda: "USD" };
}

export function normalizarPosicion(p: Record<string, unknown>): PosicionNormalizada {
  const mv = num(primero(p, ["market_value", "marketValue", "value"]));
  return {
    trade_date: txt(primero(p, ["trade_date", "tradeDate"])),
    card: txt(primero(p, ["card"])),
    long_qty: ent(primero(p, ["long_qty", "longQty", "long"])),
    short_qty: ent(primero(p, ["short_qty", "shortQty", "short"])),
    option_type: txt(primero(p, ["option_type", "optionType", "type"])),
    contract_month: txt(primero(p, ["contract_month", "contractMonth", "month"])),
    exchange: txt(primero(p, ["exchange"])) ?? "ICE COCOA",
    strike: num(primero(p, ["strike"])),
    settle_price: num(primero(p, ["settle_price", "settlePrice", "settle"])),
    market_value: mv,
    // Si el estado no lo trae, se deduce del signo. Es la convención de StoneX
    // y evita dejar la columna en null cuando el dato sí se puede saber.
    dr_cr: txt(primero(p, ["dr_cr", "drCr"])) ?? (mv !== null && mv < 0 ? "DR" : "CR"),
  };
}

/** Baja y extrae el estado de una fecha. `null` si ese día no tiene estado. */
export async function traerExtracto(
  mcp: McpConfig,
  fecha: string,
): Promise<Extracto | null> {
  const descarga = await llamarHerramienta(mcp, "download_daily_statement", { date_str: fecha }, 120_000);

  // El MCP responde los errores como texto, no como fallo de protocolo: un
  // día sin estado llega como una cadena que empieza por "Error calling tool".
  if (typeof descarga === "string") {
    if (/NO_RESULT_FOR_CONFIGURATION/i.test(descarga)) return null;
    throw new Error(descarga);
  }
  const ruta = (descarga as { path?: string })?.path;
  if (!ruta) throw new Error(`download_daily_statement no devolvió ruta para ${fecha}.`);

  const extracto = await llamarHerramienta(
    mcp, "extract_statement_data", { pdf_path: ruta, include_raw_text: false }, 180_000,
  );
  if (typeof extracto === "string") throw new Error(extracto);

  const e = extracto as Record<string, unknown>;
  const cuenta = (e.account ?? {}) as Record<string, unknown>;
  const posiciones = Array.isArray(e.open_positions) ? e.open_positions : [];

  return {
    statement_date: txt(e.statement_date) ?? fecha,
    cuenta: txt(cuenta.number) ?? "desconocida",
    cuenta_nombre: txt(cuenta.name),
    balance: normalizarBalance(e.balances),
    pnl: normalizarPnl(e.summary),
    posiciones: (posiciones as Record<string, unknown>[]).map(normalizarPosicion),
    archivo: ruta,
  };
}

/** Los últimos N días hábiles hacia atrás desde `hoy`, en ISO. */
export function diasHabiles(hoy: Date, cuantos: number): string[] {
  const out: string[] = [];
  const d = new Date(hoy);
  while (out.length < cuantos) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() - 1);
  }
  return out;
}
