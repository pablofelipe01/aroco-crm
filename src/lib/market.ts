import "server-only";

/**
 * Live market references, fetched server-side from public sources:
 *  - Cocoa: Yahoo Finance daily for the ICE NY cocoa future (CC=F) → USD/T,
 *    with FRED (PCOCOUSDM, monthly) as fallback if Yahoo is blocked.
 *  - USD/COP spot: open.er-api.com (free, daily).
 *  - TRM oficial: Banco de la República via datos.gov.co (dataset 32sa-8pi3).
 *
 * All calls are cached (Next Data Cache) and time-boxed; any failure degrades
 * to null so the dashboard never blocks on a slow/unavailable upstream.
 */

const TIMEOUT_MS = 4000;

export interface MarketData {
  cocoaUsdT: number | null;
  cocoaContract: string | null;
  cocoaDate: string | null;
  trm: number | null; // TRM oficial (Banrep)
  trmDate: string | null;
  spot: number | null; // USD/COP (referencia diaria)
}

async function fetchText(
  url: string,
  revalidate: number,
  headers: Record<string, string> = {},
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { Accept: "*/*", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      next: { revalidate },
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

async function getSpot(): Promise<number | null> {
  const txt = await fetchText("https://open.er-api.com/v6/latest/USD", 900);
  if (!txt) return null;
  try {
    const cop = JSON.parse(txt)?.rates?.COP;
    return Number.isFinite(cop) ? Number(cop) : null;
  } catch {
    return null;
  }
}

async function getTRM(): Promise<{ value: number | null; date: string | null }> {
  const txt = await fetchText(
    "https://www.datos.gov.co/resource/32sa-8pi3.json?$select=valor,vigenciadesde&$order=vigenciadesde%20DESC&$limit=1",
    3600,
    { Accept: "application/json" },
  );
  if (!txt) return { value: null, date: null };
  try {
    const row = (JSON.parse(txt) as { valor?: string; vigenciadesde?: string }[])?.[0];
    if (!row?.valor) return { value: null, date: null };
    return { value: Number(row.valor), date: row.vigenciadesde?.slice(0, 10) ?? null };
  } catch {
    return { value: null, date: null };
  }
}

/** Parse a FRED fredgraph CSV (observation_date,SERIES) → Map<YYYY-MM-DD, value>. */
function parseFredCsv(csv: string): Map<string, number> {
  const map = new Map<string, number>();
  const lines = csv.trim().split("\n");
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    const date = c[0];
    const value = Number(c[1]);
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(value)) {
      map.set(date, value);
    }
  }
  return map;
}

/**
 * Daily ICE cocoa (CC=F) in USD/T from Yahoo Finance → Map<YYYY-MM-DD, usdT>.
 * This is the "precio de bolsa diario": one point per trading day, current.
 */
async function yahooCocoaDaily(): Promise<Map<string, number>> {
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";
  const path = "/v8/finance/chart/CC=F?interval=1d&range=2y";
  // query1/query2 son hosts equivalentes; si uno bloquea, probamos el otro.
  const txt =
    (await fetchText(`https://query1.finance.yahoo.com${path}`, 3600, { "User-Agent": ua })) ??
    (await fetchText(`https://query2.finance.yahoo.com${path}`, 3600, { "User-Agent": ua }));
  const map = new Map<string, number>();
  if (!txt) return map;
  try {
    const r = JSON.parse(txt)?.chart?.result?.[0];
    const ts: number[] = r?.timestamp ?? [];
    const cl: (number | null)[] = r?.indicators?.quote?.[0]?.close ?? [];
    for (let i = 0; i < ts.length; i++) {
      const c = cl[i];
      if (c == null || !Number.isFinite(c)) continue;
      map.set(new Date(ts[i] * 1000).toISOString().slice(0, 10), Number(c));
    }
  } catch {
    /* ignore */
  }
  return map;
}

/** Monthly cocoa (USD/T) from FRED (PCOCOUSDM) — fallback if Yahoo is blocked. */
async function fredCocoaMonthly(from: string): Promise<Map<string, number>> {
  const cosd = `${from.slice(0, 4)}-01-01`;
  const csv = await fetchText(
    `https://fred.stlouisfed.org/graph/fredgraph.csv?id=PCOCOUSDM&cosd=${cosd}`,
    86400,
    { "User-Agent": "Mozilla/5.0" },
  );
  return csv ? parseFredCsv(csv) : new Map<string, number>();
}

/** Cocoa USD/T map: Yahoo daily preferred, FRED monthly as fallback. */
async function cocoaUsdTMap(from: string): Promise<Map<string, number>> {
  const yahoo = await yahooCocoaDaily();
  if (yahoo.size > 0) return yahoo;
  return fredCocoaMonthly(from);
}

/** Value of the latest entry with date ≤ target (nearest prior trading day). */
function valueAtOrBefore(sorted: [string, number][], target: string): number | null {
  let v: number | null = null;
  for (const [d, val] of sorted) {
    if (d <= target) v = val;
    else break;
  }
  return v;
}

/**
 * International cocoa converted to COP/kg for each requested date:
 *   COP/kg = cocoa(USD/T) × TRM(COP/USD) ÷ 1000
 *
 * Cocoa history comes from FRED (IMF global cocoa price, PCOCOUSDM — monthly,
 * USD/T, reliable from datacenter IPs; Stooq blocks daily CSV downloads and
 * Yahoo 429s). The IMF series lags ~1-2 months, so dates beyond its last
 * observation are anchored to the live ICE quote. TRM comes from Banrep
 * (datos.gov.co) per day. Each date aligns to the nearest prior value.
 */
export async function getInternationalSeries(
  dates: string[],
): Promise<Record<string, number>> {
  if (dates.length === 0) return {};
  const from = dates.reduce((a, b) => (a < b ? a : b));

  const [cocoa, trmTxt, latestTrm] = await Promise.all([
    cocoaUsdTMap(from),
    fetchText(
      `https://www.datos.gov.co/resource/32sa-8pi3.json?$select=valor,vigenciadesde&$where=vigenciadesde%20%3E=%20'${from}'&$order=vigenciadesde&$limit=4000`,
      3600,
      { Accept: "application/json" },
    ),
    getTRM(),
  ]);
  if (cocoa.size === 0) return {};

  const trm = new Map<string, number>();
  if (trmTxt) {
    try {
      for (const r of JSON.parse(trmTxt) as { valor?: string; vigenciadesde?: string }[]) {
        const d = r.vigenciadesde?.slice(0, 10);
        const v = Number(r.valor);
        if (d && Number.isFinite(v)) trm.set(d, v);
      }
    } catch {
      /* ignore */
    }
  }

  const cocoaSorted = [...cocoa.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const trmSorted = [...trm.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  // Si la TRM histórica no carga, usamos la TRM más reciente como respaldo
  // (así la línea internacional nunca desaparece por una fuente lenta).
  const fallbackTrm = latestTrm.value;

  const out: Record<string, number> = {};
  for (const d of dates) {
    const usdT = valueAtOrBefore(cocoaSorted, d);
    const fx = valueAtOrBefore(trmSorted, d) ?? fallbackTrm;
    if (usdT != null && fx != null) {
      out[d] = Math.round(((usdT * fx) / 1000) * 100) / 100;
    }
  }
  return out;
}

export async function getMarketData(): Promise<MarketData> {
  const year = new Date().getFullYear();
  const [cocoaMap, trm, spot] = await Promise.all([
    cocoaUsdTMap(`${year}-01-01`),
    getTRM(),
    getSpot(),
  ]);
  const sorted = [...cocoaMap.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const last = sorted[sorted.length - 1] ?? null;
  return {
    cocoaUsdT: last ? last[1] : null,
    cocoaContract: last ? "ICE NY · CC=F" : null,
    cocoaDate: last ? last[0] : null,
    trm: trm.value,
    trmDate: trm.date,
    spot,
  };
}
