import "server-only";

/**
 * Live market references, fetched server-side from public sources that work
 * from datacenter IPs (Yahoo Finance 429s server requests, so it's not used):
 *  - Cocoa: Stooq CSV for the ICE NY cocoa front future (cc.f) → USD/T.
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

/** Parse a Stooq quote CSV (Symbol,Date,Time,Open,High,Low,Close,Volume). */
async function stooqClose(
  symbol: string,
  revalidate: number,
): Promise<{ close: number; date: string } | null> {
  const txt = await fetchText(
    `https://stooq.com/q/l/?s=${symbol}&f=sd2t2ohlcv&h&e=csv`,
    revalidate,
  );
  if (!txt) return null;
  const line = txt.trim().split("\n")[1];
  if (!line) return null;
  const cols = line.split(",");
  const date = cols[1];
  const close = Number(cols[6]);
  if (!date || date === "N/D" || !Number.isFinite(close)) return null;
  return { close, date };
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
  const cosd = `${from.slice(0, 4)}-01-01`;

  const [cocoaCsv, trmTxt, live] = await Promise.all([
    fetchText(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=PCOCOUSDM&cosd=${cosd}`,
      86400,
      { "User-Agent": "Mozilla/5.0" },
    ),
    fetchText(
      `https://www.datos.gov.co/resource/32sa-8pi3.json?$select=valor,vigenciadesde&$where=vigenciadesde%20%3E=%20'${from}'&$order=vigenciadesde&$limit=2000`,
      3600,
      { Accept: "application/json" },
    ),
    stooqClose("cc.f", 900),
  ]);

  const cocoa = cocoaCsv ? parseFredCsv(cocoaCsv) : new Map<string, number>();
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

  if (cocoa.size === 0 || trm.size === 0) return {};
  const cocoaSorted = [...cocoa.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const trmSorted = [...trm.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const lastFredMonth = cocoaSorted[cocoaSorted.length - 1][0].slice(0, 7);

  const out: Record<string, number> = {};
  for (const d of dates) {
    const fx = valueAtOrBefore(trmSorted, d);
    if (fx == null) continue;
    // Beyond FRED's last published month, use the live ICE quote so recent
    // dates reflect the current market rather than a stale monthly average.
    const usdT =
      d.slice(0, 7) > lastFredMonth && live ? live.close : valueAtOrBefore(cocoaSorted, d);
    if (usdT != null) {
      out[d] = Math.round(((usdT * fx) / 1000) * 100) / 100;
    }
  }
  return out;
}

export async function getMarketData(): Promise<MarketData> {
  const [cocoa, trm, spot] = await Promise.all([
    stooqClose("cc.f", 900),
    getTRM(),
    getSpot(),
  ]);
  return {
    cocoaUsdT: cocoa?.close ?? null,
    cocoaContract: cocoa ? "ICE NY" : null,
    cocoaDate: cocoa?.date ?? null,
    trm: trm.value,
    trmDate: trm.date,
    spot,
  };
}
