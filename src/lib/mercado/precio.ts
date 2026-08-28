import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * Precio del cacao en vivo, del contrato de ICE Nueva York.
 *
 * Hasta ahora el precio salía de la paridad put-call sobre la cadena de
 * Barchart, que solo se refresca cuando corre el sync lento. El 28-ago-2026 eso
 * mostraba 5.949 mientras el mercado estaba en 6.483: un 9 % de diferencia, y
 * la pantalla de riesgo valorando el inventario con un precio de hace días.
 *
 * Esta consulta tarda alrededor de un segundo y no necesita credenciales, así
 * que se puede pedir en cada carga de la pantalla. Si no responde a tiempo se
 * usa lo último guardado —y se dice— en vez de dejar la pantalla en blanco o,
 * peor, mostrar un dato viejo como si fuera de ahora.
 */

/** Cacao ICE NY, contrato de referencia. */
export const TICKER = "CC=F";

export type PrecioCacao = {
  /** USD por tonelada métrica. */
  usdT: number;
  /** Momento de la cotización, en ISO. */
  momento: string;
  fecha: string;
  cierrePrevio: number | null;
  ticker: string;
  nombre: string | null;
};

type Yahoo = {
  chart?: {
    result?: {
      meta?: {
        symbol?: string;
        shortName?: string;
        currency?: string;
        regularMarketPrice?: number;
        regularMarketTime?: number;
        chartPreviousClose?: number;
      };
      timestamp?: number[];
      indicators?: { quote?: { close?: (number | null)[]; open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; volume?: (number | null)[] }[] };
    }[];
    error?: { description?: string };
  };
};

export class PrecioNoDisponible extends Error {}

/**
 * @param timeoutMs corto a propósito: esto corre al pintar la pantalla, y más
 *   vale caer al último precio guardado que dejar la página colgada.
 */
export async function precioEnVivo(timeoutMs = 4000): Promise<PrecioCacao> {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), timeoutMs);
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(TICKER)}?interval=1d&range=5d`,
      {
        signal: control.signal,
        cache: "no-store",
        // Sin User-Agent, Yahoo responde 429 a las peticiones de servidor.
        headers: { "User-Agent": "Mozilla/5.0 (compatible; AROCO-CRM/1.0)" },
      },
    );
    if (!res.ok) throw new PrecioNoDisponible(`Yahoo devolvió HTTP ${res.status}`);

    const j = (await res.json()) as Yahoo;
    const r = j.chart?.result?.[0];
    const m = r?.meta;
    const precio = m?.regularMarketPrice;
    if (!m || typeof precio !== "number" || !Number.isFinite(precio) || precio <= 0) {
      throw new PrecioNoDisponible(
        j.chart?.error?.description ?? "La respuesta no trae precio.",
      );
    }
    // El cacao de ICE NY cotiza en USD por tonelada. Si algún día cambiara de
    // moneda, convertir con la TRM daría una cifra absurda sin avisar.
    if (m?.currency && m.currency !== "USD") {
      throw new PrecioNoDisponible(`El precio vino en ${m.currency}, no en USD.`);
    }

    const momento = new Date((m.regularMarketTime ?? Date.now() / 1000) * 1000).toISOString();
    return {
      usdT: precio,
      momento,
      fecha: momento.slice(0, 10),
      cierrePrevio: typeof m.chartPreviousClose === "number" ? m.chartPreviousClose : null,
      ticker: m.symbol ?? TICKER,
      nombre: m.shortName ?? null,
    };
  } catch (e) {
    if (e instanceof PrecioNoDisponible) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new PrecioNoDisponible(`El precio no respondió en ${timeoutMs / 1000}s.`);
    }
    throw new PrecioNoDisponible(e instanceof Error ? e.message : "Error desconocido.");
  } finally {
    clearTimeout(reloj);
  }
}

/** Guarda la cotización del día. Una fila por día y ticker. */
export async function guardarPrecio(
  db: SupabaseClient<Database>,
  p: PrecioCacao,
): Promise<void> {
  const { error } = await db
    .from("market_data")
    .upsert({ date: p.fecha, ticker: p.ticker, close_price: p.usdT }, { onConflict: "date,ticker" });
  if (error) throw new Error(`market_data: ${error.message}`);
}

/** Lo último guardado, para cuando la consulta en vivo no responda. */
export async function ultimoPrecioGuardado(
  db: SupabaseClient<Database>,
): Promise<{ usdT: number; fecha: string } | null> {
  const { data } = await db
    .from("market_data")
    .select("date, close_price")
    .eq("ticker", TICKER)
    .not("close_price", "is", null)
    .order("date", { ascending: false })
    .limit(1);
  const f = data?.[0];
  return f ? { usdT: Number(f.close_price), fecha: f.date } : null;
}
