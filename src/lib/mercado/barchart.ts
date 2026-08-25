/**
 * Tablero de opciones de cacao desde Barchart.
 *
 * Barchart entrega cada fila dos veces: formateada para pantalla («3,250C»,
 * «2,695s») y en un objeto `raw` con los números limpios. Se usa `raw`; parsear
 * el texto sería reintroducir a mano los separadores de miles y los sufijos de
 * settle que el propio payload ya resolvió.
 *
 * LO QUE BARCHART NO DA: delta ni volatilidad implícita. La cadena trae
 * strikes, primas, bid/ask y open interest, pero no las griegas. Esas columnas
 * quedan en null —no en cero— porque un delta cero afirma que la opción no se
 * mueve con el subyacente, que es lo contrario de «no lo sabemos». Vienen del
 * tablero que se sube como imagen, que es otra fuente.
 *
 * La prima se guarda en PUNTOS (`lastPrice`), no en dólares (`premium`), para
 * que quede en la misma unidad que el strike. Es la convención del tablero de
 * CacaoQ: un call de 1500 con subyacente 3036 vale 1555 puntos, no 15.550 USD.
 */

import { llamarHerramienta, type McpConfig } from "@/lib/mcp/client";

export type FilaCadena = {
  strike: number;
  call_premium: number | null;
  put_premium: number | null;
  call_delta: null;
  put_delta: null;
};

export type Tablero = {
  contract_month: string;
  etiqueta: string;
  slug: string;
  filas: FilaCadena[];
  /** Subyacente deducido por paridad put-call. Ver `subyacentePorParidad`. */
  underlying_price: number | null;
};

const num = (v: unknown): number | null => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || v === "" || v === "N/A") return null;
  const n = Number(String(v).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

const MESES: Record<string, string> = {
  jan: "JAN", feb: "FEB", mar: "MAR", apr: "APR", may: "MAY", jun: "JUN",
  jul: "JUL", aug: "AUG", sep: "SEP", oct: "OCT", nov: "NOV", dec: "DEC",
};

/** «Oct 2026» → «OCT26», que es el formato del tablero de CacaoQ. */
export function mesContrato(etiqueta: string): string {
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{2,4})$/.exec(etiqueta.trim());
  if (!m) return etiqueta.trim().toUpperCase().replace(/\s+/g, "");
  const mes = MESES[m[1].toLowerCase()] ?? m[1].toUpperCase();
  return `${mes}${m[2].slice(-2)}`;
}

type FilaBarchart = { raw?: Record<string, unknown> } & Record<string, unknown>;

/**
 * Cruza calls y puts por strike. Barchart los devuelve en dos listas
 * separadas, y el tablero es una fila por strike con los dos lados.
 */
export function armarCadena(data: Record<string, FilaBarchart[]>): FilaCadena[] {
  const porStrike = new Map<number, FilaCadena>();

  const meter = (filas: FilaBarchart[] | undefined, lado: "call" | "put") => {
    for (const f of filas ?? []) {
      const r = (f.raw ?? f) as Record<string, unknown>;
      const strike = num(r.strike);
      if (strike === null) continue;

      const fila = porStrike.get(strike) ?? {
        strike,
        call_premium: null,
        put_premium: null,
        call_delta: null,
        put_delta: null,
      };
      // `lastPrice` es la prima cotizada en puntos. `premium` son dólares y
      // mezclarlas dejaría la columna con dos unidades distintas.
      const prima = num(r.lastPrice);
      if (lado === "call") fila.call_premium = prima;
      else fila.put_premium = prima;
      porStrike.set(strike, fila);
    }
  };

  meter(data.Call, "call");
  meter(data.Put, "put");

  return [...porStrike.values()].sort((a, b) => a.strike - b.strike);
}

/**
 * Precio del subyacente deducido de la propia cadena.
 *
 * Barchart no lo entrega en este payload, pero la paridad put-call lo da:
 * para cada strike, `subyacente ≈ strike + call − put`. Con los datos del
 * 25-ago-2026 el strike 3250 daba 5.944 y el 7250 daba 5.946 — la escalera es
 * consistente consigo misma.
 *
 * Se toma la MEDIANA y no el promedio: en los strikes lejanos hay primas que
 * llevan días sin operar, y una sola cotización vieja arrastra un promedio pero
 * no una mediana.
 *
 * Es un valor DERIVADO, no cotizado. Ignora el descuento por tasa, que a estos
 * plazos mueve la cifra menos de lo que la mueve el spread de una prima.
 */
export function subyacentePorParidad(filas: FilaCadena[]): number | null {
  const implicitos = filas
    .filter((f) => f.call_premium !== null && f.put_premium !== null)
    .map((f) => f.strike + (f.call_premium as number) - (f.put_premium as number))
    .sort((a, b) => a - b);
  if (implicitos.length === 0) return null;
  const m = Math.floor(implicitos.length / 2);
  const mediana =
    implicitos.length % 2 === 1
      ? implicitos[m]
      : (implicitos[m - 1] + implicitos[m]) / 2;
  return Math.round(mediana * 100) / 100;
}

export type Vencimiento = { label: string; slug: string; symbol: string };

export async function listarVencimientos(mcp: McpConfig): Promise<Vencimiento[]> {
  const r = await llamarHerramienta(mcp, "list_expirations", {}, 90_000);
  if (typeof r === "string") throw new Error(r);
  const exp = (r as { expirations?: Vencimiento[] })?.expirations ?? [];
  return exp.filter((e) => e.slug);
}

export async function traerTablero(mcp: McpConfig, v: Vencimiento): Promise<Tablero | null> {
  const r = await llamarHerramienta(mcp, "get_options_chain", { expiration: v.slug }, 180_000);
  if (typeof r === "string") throw new Error(r);

  const o = r as { ok?: boolean; resolved_expiration?: string; data?: Record<string, FilaBarchart[]> };
  if (o.ok === false || !o.data) return null;

  const filas = armarCadena(o.data);
  // Un vencimiento sin strikes no se guarda: un tablero vacío en la base se ve
  // igual que uno que se consultó y no tenía nada cotizado.
  if (filas.length === 0) return null;

  const etiqueta = o.resolved_expiration ?? v.label;
  return {
    contract_month: mesContrato(etiqueta),
    etiqueta,
    slug: v.slug,
    filas,
    underlying_price: subyacentePorParidad(filas),
  };
}
