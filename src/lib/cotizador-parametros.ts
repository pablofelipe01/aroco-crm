import type { SupabaseClient } from "@supabase/supabase-js";
import type { CotizadorParametro, Database } from "@/lib/types/database";
import {
  BONIF_CALIDAD_PCT,
  FACTOR_NACIONAL,
  FNC_PCT,
  MERMA_PCT,
  UMBRAL_VIABLE,
  type Incoterm,
} from "@/lib/calc/cotizador";

/**
 * Parámetros del cotizador (tabla cotizador_parametros, solo los edita un
 * admin). Los porcentajes vienen como fracción. Si una clave falta en la base
 * se usa el valor de la hoja de Nicolás, para que el cotizador nunca quede sin
 * número.
 */
export const PARAMETROS_HOJA = {
  fnc_pct: FNC_PCT,
  merma_pct: MERMA_PCT,
  factor_nacional: FACTOR_NACIONAL,
  comision_fob: 0.08,
  comision_cif: 0.1,
  comision_nacional: 0.05,
  umbral_viable: UMBRAL_VIABLE,
  bonif_calidad_pct: BONIF_CALIDAD_PCT,
  bonif_calidad_proveedor_pct: 0,
  bonif_cadmio: 280,
  bonif_trazabilidad: 120,
  bonif_transporte: 180,
  transporte_bodega: 150,
  seleccion: 83,
  fumigacion: 90,
  estibas: 53,
  costales: 226.1,
  coberturas: 15,
  costos_exportacion: 720,
};

export type ClaveParametro = keyof typeof PARAMETROS_HOJA;
export type Parametros = Record<ClaveParametro, number>;

/** Parámetros que fijan el cálculo y que la cotización no deja editar. */
export const PARAMETROS_FIJOS = [
  "fnc_pct",
  "merma_pct",
  "factor_nacional",
  "bonif_calidad_pct",
] as const satisfies readonly ClaveParametro[];

export function parametrosDesdeFilas(
  filas: Pick<CotizadorParametro, "clave" | "valor">[] | null | undefined,
): Parametros {
  const p: Parametros = { ...PARAMETROS_HOJA };
  for (const f of filas ?? []) {
    if (f.clave in p && Number.isFinite(Number(f.valor))) {
      p[f.clave as ClaveParametro] = Number(f.valor);
    }
  }
  return p;
}

export function comisionPorDefecto(p: Parametros, incoterm: Incoterm): number {
  if (incoterm === "FOB") return p.comision_fob;
  if (incoterm === "CIF") return p.comision_cif;
  return p.comision_nacional;
}

export async function cargarParametros(db: SupabaseClient<Database>): Promise<Parametros> {
  const { data } = await db.from("cotizador_parametros").select("clave, valor");
  return parametrosDesdeFilas(data);
}
