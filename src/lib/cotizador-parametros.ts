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
  // Costos por defecto, uno por pestaña de la hoja (columna M). Faltan los que
  // la hoja anula con `*0`: estibas en FOB, transporte a bodega en CIF y costos
  // de exportación en NACIONAL.
  transporte_bodega_fob: 104,
  seleccion_fob: 83,
  fumigacion_fob: 90,
  costales_fob: 226.1,
  coberturas_fob: 15,
  costos_exportacion_fob: 836.15,
  seleccion_cif: 83,
  fumigacion_cif: 100,
  estibas_cif: 53,
  costales_cif: 215,
  coberturas_cif: 15,
  costos_exportacion_cif: 720,
  transporte_bodega_nacional: 150,
  seleccion_nacional: 83,
  fumigacion_nacional: 0,
  estibas_nacional: 0,
  costales_nacional: 0,
  coberturas_nacional: 0,
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

/** Costos (COP/kg) con que arranca una cotización según el incoterm. */
export const COSTOS = [
  "transporte_bodega",
  "seleccion",
  "fumigacion",
  "estibas",
  "costales",
  "coberturas",
  "costos_exportacion",
] as const;
export type Costo = (typeof COSTOS)[number];

/** ¿Cuenta este costo en el incoterm? Los que no, el cálculo los deja en 0. */
export function aplicaCosto(costo: Costo, incoterm: Incoterm): boolean {
  if (incoterm === "FOB") return costo !== "estibas";
  if (incoterm === "CIF") return costo !== "transporte_bodega";
  return costo !== "costos_exportacion";
}

export function costosPorDefecto(p: Parametros, incoterm: Incoterm): Record<Costo, number> {
  const sufijo = incoterm.toLowerCase();
  const fila = p as Record<string, number>;
  return Object.fromEntries(
    COSTOS.map((c) => [c, aplicaCosto(c, incoterm) ? (fila[`${c}_${sufijo}`] ?? 0) : 0]),
  ) as Record<Costo, number>;
}

export async function cargarParametros(db: SupabaseClient<Database>): Promise<Parametros> {
  const { data } = await db.from("cotizador_parametros").select("clave, valor");
  return parametrosDesdeFilas(data);
}
