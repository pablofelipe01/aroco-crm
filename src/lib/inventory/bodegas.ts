/**
 * Bodegas (centros de costo) y tipos de cacao del inventario.
 *
 * Acordado en la reunión de 2026-11: tres centros de costo separados —Cauca,
 * Bogotá y Nilo— con vista consolidada y detalle por bodega, y el detalle en
 * cuatro tipos: Orgánico, Primera, Segunda y Baba.
 *
 * El archivo de bodega clasifica en ocho calidades (todas de cacao SECO). El
 * cruce, confirmado por Pablo el 2026-11-06:
 *   Primera  = Premium + Estándar + Fairtrade + Rainforest
 *   Segunda  = Corriente + Corriente C + Pasilla
 *   Orgánico = Orgánico
 *   Baba     = cacao en baba (fresco); el archivo no lo trae, entra por el CRM
 *
 * La bodega física (dónde está el grano HOY, no de dónde vino) se decide así
 * desde 0115 (acta 2026-11-17: 888 kg del Cauca en Bogotá salían bajo Cauca):
 *   1. la elegida a mano en el CRM (bodega_por), siempre;
 *   2. la columna «BODEGA» del archivo (`bodega_hoja`);
 *   3. si no hay ninguna, la regla por origen de 0114 (`bodegaPorOrigen`),
 *      que es solo un estimado y la vista marca «por confirmar».
 */

export const BODEGAS = ["cauca", "bogota", "nilo"] as const;
export type Bodega = (typeof BODEGAS)[number];

export const NOMBRE_BODEGA: Record<Bodega, string> = {
  cauca: "Cauca",
  bogota: "Bogotá",
  nilo: "Nilo",
};

export function esBodega(v: unknown): v is Bodega {
  return typeof v === "string" && (BODEGAS as readonly string[]).includes(v);
}

/**
 * La regla de bodega automática (Pablo, 2026-11-06): Cauca → Cauca;
 * Cundinamarca y Tolima → Nilo; lo demás → Bogotá. Sin departamento, se mira
 * el segundo tramo del código (CO-CAU-…). Debe coincidir con la función SQL
 * inventario_bodega_por_origen (0114).
 */
export function bodegaPorOrigen(departamento: string | null | undefined, code?: string | null): Bodega {
  const d = (departamento ?? "").trim().toUpperCase();
  const seg = ((code ?? "").split("-")[1] ?? "").trim().toUpperCase();
  if (d.startsWith("CAUCA")) return "cauca";
  if (d.startsWith("CUNDINAMARCA") || d.startsWith("TOLIMA")) return "nilo";
  if (d) return "bogota";
  if (seg.startsWith("CAU")) return "cauca";
  if (seg.startsWith("CUN") || seg.startsWith("TOL")) return "nilo";
  return "bogota";
}

/**
 * Lee la celda «BODEGA» del archivo: «Cauca», «BOGOTÁ», «El Nilo»… Lo que no
 * se reconozca queda nulo (y el lote cae a la regla por origen) en vez de
 * adivinar.
 */
export function leerBodega(v: string | null | undefined): Bodega | null {
  const t = (v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/^(bodega\s+)?(el\s+)?/, "");
  if (t.startsWith("cauca")) return "cauca";
  if (t.startsWith("bogota")) return "bogota";
  if (t.startsWith("nilo")) return "nilo";
  return null;
}

export type OrigenBodega = "manual" | "hoja" | "estimada";

/**
 * La bodega que toma un lote sin elección manual: la de la hoja si la trae, y
 * si no, el estimado por origen. Igual que el trigger inventario_tr_bodega.
 */
export function bodegaAutomatica(l: {
  bodega_hoja?: string | null;
  departamento: string | null;
  code: string | null;
}): { bodega: Bodega; origen: Exclude<OrigenBodega, "manual"> } {
  return esBodega(l.bodega_hoja)
    ? { bodega: l.bodega_hoja, origen: "hoja" }
    : { bodega: bodegaPorOrigen(l.departamento, l.code), origen: "estimada" };
}

export const TIPOS = ["organico", "primera", "segunda", "baba"] as const;
export type Tipo = (typeof TIPOS)[number];

export const NOMBRE_TIPO: Record<Tipo, string> = {
  organico: "Orgánico",
  primera: "Primera",
  segunda: "Segunda",
  baba: "Baba",
};

export type PorTipo = Record<Tipo, number>;

/** Las columnas de disponible por clasificación que mira la agrupación. */
export type DisponiblePorClase = {
  qty_avail_premium_kg: number | null;
  qty_avail_estandar_kg: number | null;
  qty_avail_corriente_kg: number | null;
  qty_avail_corriente_c_kg: number | null;
  qty_avail_fairtrade_kg: number | null;
  qty_avail_rainforest_kg: number | null;
  qty_avail_organico_kg: number | null;
  qty_avail_pasilla_kg: number | null;
  /** Solo existe desde 0113; los lotes del archivo no la traen. */
  qty_avail_baba_kg?: number | null;
};

const n = (v: number | null | undefined) => Number(v) || 0;

export function tipoVacio(): PorTipo {
  return { organico: 0, primera: 0, segunda: 0, baba: 0 };
}

/** Disponible de un lote agrupado en los cuatro tipos. */
export function disponiblePorTipo(l: DisponiblePorClase): PorTipo {
  return {
    organico: n(l.qty_avail_organico_kg),
    primera:
      n(l.qty_avail_premium_kg) +
      n(l.qty_avail_estandar_kg) +
      n(l.qty_avail_fairtrade_kg) +
      n(l.qty_avail_rainforest_kg),
    segunda: n(l.qty_avail_corriente_kg) + n(l.qty_avail_corriente_c_kg) + n(l.qty_avail_pasilla_kg),
    baba: n(l.qty_avail_baba_kg),
  };
}

export const totalTipos = (t: PorTipo) => TIPOS.reduce((s, k) => s + t[k], 0);

export type FilaResumen = { bodega: Bodega | null; tipos: PorTipo; total: number; lotes: number };

/**
 * Resumen por bodega: una fila por bodega (y una para los lotes sin asignar,
 * solo si hay alguno con saldo) más el total consolidado.
 */
export function resumenPorBodega<L extends DisponiblePorClase & { bodega: string | null }>(
  lotes: L[],
): { filas: FilaResumen[]; total: FilaResumen } {
  const filas = new Map<Bodega | null, FilaResumen>();
  for (const b of BODEGAS) filas.set(b, { bodega: b, tipos: tipoVacio(), total: 0, lotes: 0 });
  const total: FilaResumen = { bodega: null, tipos: tipoVacio(), total: 0, lotes: 0 };

  for (const l of lotes) {
    const t = disponiblePorTipo(l);
    const kg = totalTipos(t);
    if (kg <= 0) continue;
    const b = esBodega(l.bodega) ? l.bodega : null;
    if (!filas.has(b)) filas.set(b, { bodega: b, tipos: tipoVacio(), total: 0, lotes: 0 });
    for (const f of [filas.get(b)!, total]) {
      for (const k of TIPOS) f.tipos[k] += t[k];
      f.total += kg;
      f.lotes += 1;
    }
  }
  return { filas: [...filas.values()], total };
}
